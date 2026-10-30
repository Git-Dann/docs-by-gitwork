/**
 * Every client's uptime monitors in one read — the board in the Gitwork wiki's Monitors
 * section (`src/lib/monitor-board.ts` holds the rules). Internal only: no token route serves
 * this, and the wiki DTO never carries it, so a client can never see another client's status.
 *
 * Two queries for any number of monitors: the monitors (with their stored last result), and one
 * groupBy for 24h uptime. The per-monitor DTO used by a single client's section runs five
 * queries each, which is fine for one client and not for all of them.
 */

import { prisma } from "@/lib/prisma";
import { isStale } from "@/lib/monitor-alerts";
import type { BoardClient } from "@/lib/monitor-board";

export interface MonitorBoardDTO {
  clients: BoardClient[];
  /** When this was read, so the page can say how fresh it is. */
  readAt: string;
}

/**
 * @param clientIds null = every client in the workspace; otherwise only these (a restricted
 *   user sees the clients they could open anyway — the board never widens anyone's view).
 */
export async function loadMonitorBoard(
  workspaceId: string,
  clientIds: string[] | null,
  now: Date = new Date(),
): Promise<MonitorBoardDTO> {
  const clients = await prisma.workspaceClient.findMany({
    where: {
      workspaceId,
      // Active clients, plus any client that still has an enabled monitor — a paused or
      // archived client whose service we still watch must not vanish from the board.
      OR: [{ status: "ACTIVE" }, { wiki: { monitors: { some: { enabled: true } } } }],
      ...(clientIds ? { id: { in: clientIds } } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      wiki: {
        select: {
          monitors: {
            where: { enabled: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              name: true,
              target: true,
              enabled: true,
              intervalMinutes: true,
              createdAt: true,
              lastStatus: true,
              lastCheckedAt: true,
              lastLatencyMs: true,
              lastStatusCode: true,
              lastError: true,
              alertKind: true,
              downSince: true,
            },
          },
        },
      },
    },
  });

  const monitorIds = clients.flatMap((c) => c.wiki?.monitors.map((m) => m.id) ?? []);
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const counts = monitorIds.length
    ? await prisma.wikiMonitorCheck.groupBy({
        by: ["monitorId", "status"],
        where: { monitorId: { in: monitorIds }, checkedAt: { gte: since }, status: { not: "UNKNOWN" } },
        _count: { _all: true },
      })
    : [];
  const uptime = new Map<string, { total: number; down: number }>();
  for (const row of counts) {
    const u = uptime.get(row.monitorId) ?? { total: 0, down: 0 };
    u.total += row._count._all;
    if (row.status === "DOWN") u.down += row._count._all;
    uptime.set(row.monitorId, u);
  }

  return {
    readAt: now.toISOString(),
    clients: clients.map((c) => ({
      clientId: c.id,
      slug: c.slug,
      name: c.name,
      monitors: (c.wiki?.monitors ?? []).map((m) => {
        const u = uptime.get(m.id);
        return {
          id: m.id,
          name: m.name,
          target: m.target,
          status: m.lastStatus,
          stale: isStale(m, now),
          alertKind: m.alertKind,
          latencyMs: m.lastLatencyMs,
          statusCode: m.lastStatusCode,
          error: m.lastError,
          checkedAt: m.lastCheckedAt ? m.lastCheckedAt.toISOString() : null,
          downSince: m.downSince ? m.downSince.toISOString() : null,
          uptime24h: u && u.total > 0 ? Math.round(((u.total - u.down) / u.total) * 1000) / 10 : null,
        };
      }),
    })),
  };
}
