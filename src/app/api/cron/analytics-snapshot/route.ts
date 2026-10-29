import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { prisma } from "@/lib/prisma";
import { decryptScraperConfig } from "@/server/support";
import { runAnalytics, type AnalyticsConnectionConfig } from "@/server/support-analytics";
import { forEachWorkspace } from "@/server/workspaces/for-each";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Captures each client's analytics metrics for the current month so the monthly
// report has reliable, historical month-over-month trends. CRON_SECRET-guarded.
// Runs once per workspace (each business's own connectors); the totals sum across them.
export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const period = `${year}-${String(month).padStart(2, "0")}`;

    const workspaces = await forEachWorkspace({ select: { id: true } }, (workspace) =>
      captureWorkspace(workspace.id, period, year, month),
    );
    const done = workspaces.flatMap((w) => (w.ok ? [w.result] : []));
    return apiOk({
      period,
      total: done.reduce((n, r) => n + r.total, 0),
      captured: done.reduce((n, r) => n + r.captured, 0),
      errors: [...done.flatMap((r) => r.errors), ...workspaces.flatMap((w) => (w.ok ? [] : [w.error]))],
      workspaces: workspaces.map((w) => ({ workspaceId: w.workspaceId, ok: w.ok })),
    });
  } catch (error) {
    return fromError(error);
  }
}

async function captureWorkspace(workspaceId: string, period: string, year: number, month: number) {
  const connections = await prisma.accountConnection.findMany({
    where: { source: "ANALYTICS", client: { workspaceId } },
    include: { client: { select: { id: true, name: true } } },
  });

  let captured = 0;
  const errors: string[] = [];

  for (const conn of connections) {
    try {
      // scraperConfig contains encrypted API credentials. Decrypt only in this
      // server-side job before passing it to the analytics adapter.
      const config = (decryptScraperConfig(conn.scraperConfig as Record<string, unknown> | null) ?? {}) as AnalyticsConnectionConfig;
      const snapshot = await runAnalytics(config, year, month);
      // ⚠️ Never store an empty month: it reads as "nothing happened", and once the month
      // ends it would count as that month's final figures (CLAUDE.md §35).
      if (snapshot.metrics.length === 0) {
        throw new Error("The connector answered, but returned no numbers for this month.");
      }
      await prisma.supportAnalyticsSnapshot.upsert({
        where: { clientId_period: { clientId: conn.clientId, period } },
        create: { clientId: conn.clientId, period, metrics: snapshot.metrics as object },
        update: { metrics: snapshot.metrics as object, capturedAt: new Date() },
      });
      await prisma.accountConnection.update({
        where: { id: conn.id },
        data: {
          lastSyncedAt: new Date(),
          lastSyncStats: { ingested: snapshot.metrics.length, filtered: 0, errors: [], at: new Date().toISOString() } as object,
          health: "CONNECTED",
        },
      });
      captured++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${conn.client.name}: ${msg}`);
      await prisma.accountConnection.update({
        where: { id: conn.id },
        data: { lastSyncStats: { ingested: 0, filtered: 0, errors: [msg], at: new Date().toISOString() } as object, health: "ERROR" },
      }).catch(() => {});
    }
  }

  return { total: connections.length, captured, errors };
}
