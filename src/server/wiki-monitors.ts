/**
 * wiki-monitors.ts — uptime/health monitors for a client wiki's Monitors section.
 *
 * Monitors are probed on a schedule (/api/cron/wiki-monitors) by the connector
 * registry in ./wiki-monitors/. Each probe writes a WikiMonitorCheck and updates
 * the denormalised last* fields on WikiMonitor for fast public reads. The DTO adds
 * rolling uptime %, average latency, and a recent-status strip for the public board.
 */

import type { WikiMonitor, WikiMonitorStatus, WikiMonitorType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runProbe, type MonitorStatus } from "./wiki-monitors/index";

// ─── DTOs ───────────────────────────────────────────────────────────────────

export interface WikiMonitorHistoryPoint {
  status: MonitorStatus;
  latencyMs: number | null;
  checkedAt: string;
}

export interface WikiMonitorDTO {
  id: string;
  name: string;
  type: WikiMonitorType;
  target: string;
  method: string;
  expectedStatus: number | null;
  keyword: string | null;
  degradedMs: number | null;
  enabled: boolean;
  intervalMinutes: number;
  /** Current denormalised status + last probe details. */
  status: MonitorStatus;
  checkedAt: string | null;
  latencyMs: number | null;
  statusCode: number | null;
  error: string | null;
  /** Uptime % over 24h / 7d / 30d (null when no data in the window). */
  uptime: { d1: number | null; d7: number | null; d30: number | null };
  /** Mean latency (ms) over the last 24h. */
  avgLatencyMs: number | null;
  /** Recent checks oldest→newest, for the status bar strip. */
  history: WikiMonitorHistoryPoint[];
}

/** Retention window for check history + the widest uptime window. */
const RETENTION_DAYS = 30;
const HISTORY_POINTS = 45;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

// ─── Uptime + DTO ─────────────────────────────────────────────────────────────

/** Uptime % over a window: (checks that were reachable) / (total). DEGRADED counts
 *  as up (the service answered); UNKNOWN is ignored. Null when the window is empty. */
async function uptimeForWindow(monitorId: string, since: Date): Promise<number | null> {
  const [total, down] = await Promise.all([
    prisma.wikiMonitorCheck.count({
      where: { monitorId, checkedAt: { gte: since }, status: { not: "UNKNOWN" } },
    }),
    prisma.wikiMonitorCheck.count({
      where: { monitorId, checkedAt: { gte: since }, status: "DOWN" },
    }),
  ]);
  if (total === 0) return null;
  return Math.round(((total - down) / total) * 1000) / 10; // one decimal place
}

async function buildMonitorDTO(m: WikiMonitor): Promise<WikiMonitorDTO> {
  const [d1, d7, d30, latencyAgg, recent] = await Promise.all([
    uptimeForWindow(m.id, daysAgo(1)),
    uptimeForWindow(m.id, daysAgo(7)),
    uptimeForWindow(m.id, daysAgo(RETENTION_DAYS)),
    prisma.wikiMonitorCheck.aggregate({
      where: { monitorId: m.id, checkedAt: { gte: daysAgo(1) }, latencyMs: { not: null } },
      _avg: { latencyMs: true },
    }),
    prisma.wikiMonitorCheck.findMany({
      where: { monitorId: m.id },
      orderBy: { checkedAt: "desc" },
      take: HISTORY_POINTS,
      select: { status: true, latencyMs: true, checkedAt: true },
    }),
  ]);

  return {
    id: m.id,
    name: m.name,
    type: m.type,
    target: m.target,
    method: m.method,
    expectedStatus: m.expectedStatus,
    keyword: m.keyword,
    degradedMs: m.degradedMs,
    enabled: m.enabled,
    intervalMinutes: m.intervalMinutes,
    status: m.lastStatus as MonitorStatus,
    checkedAt: m.lastCheckedAt ? m.lastCheckedAt.toISOString() : null,
    latencyMs: m.lastLatencyMs,
    statusCode: m.lastStatusCode,
    error: m.lastError,
    uptime: { d1, d7, d30 },
    avgLatencyMs:
      latencyAgg._avg.latencyMs != null ? Math.round(latencyAgg._avg.latencyMs) : null,
    history: recent
      .reverse()
      .map((c) => ({
        status: c.status as MonitorStatus,
        latencyMs: c.latencyMs,
        checkedAt: c.checkedAt.toISOString(),
      })),
  };
}

/** Section payload for the wiki DTO: whether Monitors is on + the monitors. */
export interface WikiMonitorsSection {
  enabled: boolean;
  monitors: WikiMonitorDTO[];
}

export async function loadWikiMonitors(clientId: string): Promise<WikiMonitorsSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: {
      monitorsEnabled: true,
      monitors: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!wiki) return { enabled: false, monitors: [] };
  const monitors = await Promise.all(wiki.monitors.map(buildMonitorDTO));
  return { enabled: wiki.monitorsEnabled, monitors };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

async function ensureWiki(clientId: string): Promise<string> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true },
  });
  return wiki.id;
}

export interface MonitorInput {
  name: string;
  type: WikiMonitorType;
  target: string;
  method?: string;
  expectedStatus?: number | null;
  keyword?: string | null;
  degradedMs?: number | null;
  intervalMinutes?: number;
  enabled?: boolean;
}

/** Enable/disable the Monitors section for a wiki (the sidebar add/remove). */
export async function setWikiMonitorsEnabled(clientId: string, enabled: boolean): Promise<void> {
  const id = await ensureWiki(clientId);
  await prisma.clientWiki.update({ where: { id }, data: { monitorsEnabled: enabled } });
}

export async function createMonitor(clientId: string, input: MonitorInput): Promise<WikiMonitorDTO> {
  const wikiId = await ensureWiki(clientId);
  const max = await prisma.wikiMonitor.aggregate({ where: { wikiId }, _max: { sortOrder: true } });
  const monitor = await prisma.wikiMonitor.create({
    data: {
      wikiId,
      name: input.name.trim(),
      type: input.type,
      target: input.target.trim(),
      method: input.method?.trim() || "GET",
      expectedStatus: input.expectedStatus ?? null,
      keyword: input.keyword?.trim() || null,
      degradedMs: input.degradedMs ?? null,
      intervalMinutes: input.intervalMinutes ?? 5,
      enabled: input.enabled ?? true,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });
  // Adding a monitor implies the section is on.
  await prisma.clientWiki.update({ where: { id: wikiId }, data: { monitorsEnabled: true } });
  // Best-effort immediate probe so the operator sees a status right away.
  await runMonitorCheck(monitor).catch(() => {});
  const fresh = await prisma.wikiMonitor.findUnique({ where: { id: monitor.id } });
  return buildMonitorDTO(fresh ?? monitor);
}

export async function updateMonitor(
  clientId: string,
  monitorId: string,
  input: Partial<MonitorInput>,
): Promise<WikiMonitorDTO | null> {
  const monitor = await prisma.wikiMonitor.findFirst({
    where: { id: monitorId, wiki: { clientId } },
    select: { id: true },
  });
  if (!monitor) return null;
  const updated = await prisma.wikiMonitor.update({
    where: { id: monitorId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.target !== undefined ? { target: input.target.trim() } : {}),
      ...(input.method !== undefined ? { method: input.method.trim() || "GET" } : {}),
      ...(input.expectedStatus !== undefined ? { expectedStatus: input.expectedStatus } : {}),
      ...(input.keyword !== undefined ? { keyword: input.keyword?.trim() || null } : {}),
      ...(input.degradedMs !== undefined ? { degradedMs: input.degradedMs } : {}),
      ...(input.intervalMinutes !== undefined ? { intervalMinutes: input.intervalMinutes } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    },
  });
  return buildMonitorDTO(updated);
}

export async function deleteMonitor(clientId: string, monitorId: string): Promise<boolean> {
  const res = await prisma.wikiMonitor.deleteMany({
    where: { id: monitorId, wiki: { clientId } },
  });
  return res.count > 0;
}

/** Run a monitor now (manual "Check now"), scoped to the client. */
export async function checkMonitorNow(clientId: string, monitorId: string): Promise<WikiMonitorDTO | null> {
  const monitor = await prisma.wikiMonitor.findFirst({ where: { id: monitorId, wiki: { clientId } } });
  if (!monitor) return null;
  await runMonitorCheck(monitor);
  const fresh = await prisma.wikiMonitor.findUnique({ where: { id: monitorId } });
  return fresh ? buildMonitorDTO(fresh) : null;
}

// ─── Probing ────────────────────────────────────────────────────────────────

/** Probe one monitor, persist the check, and update its denormalised state. */
export async function runMonitorCheck(monitor: WikiMonitor): Promise<void> {
  const result = await runProbe(monitor);
  await prisma.$transaction([
    prisma.wikiMonitorCheck.create({
      data: {
        monitorId: monitor.id,
        status: result.status as WikiMonitorStatus,
        latencyMs: result.latencyMs,
        statusCode: result.statusCode,
        error: result.error,
      },
    }),
    prisma.wikiMonitor.update({
      where: { id: monitor.id },
      data: {
        lastStatus: result.status as WikiMonitorStatus,
        lastCheckedAt: new Date(),
        lastLatencyMs: result.latencyMs,
        lastStatusCode: result.statusCode,
        lastError: result.error,
      },
    }),
  ]);
}

/**
 * Cron entry point: probe every enabled monitor that's due (interval elapsed
 * since its last check), in small concurrent batches, then prune old history.
 */
export async function runDueMonitors(): Promise<{ checked: number; pruned: number }> {
  const now = Date.now();
  const due = (
    await prisma.wikiMonitor.findMany({
      where: { enabled: true },
      orderBy: { lastCheckedAt: "asc" },
    })
  ).filter(
    (m) =>
      !m.lastCheckedAt ||
      now - m.lastCheckedAt.getTime() >= m.intervalMinutes * 60 * 1000,
  );

  const BATCH = 5;
  for (let i = 0; i < due.length; i += BATCH) {
    await Promise.all(due.slice(i, i + BATCH).map((m) => runMonitorCheck(m).catch(() => {})));
  }

  const pruned = await prisma.wikiMonitorCheck.deleteMany({
    where: { checkedAt: { lt: daysAgo(RETENTION_DAYS) } },
  });

  return { checked: due.length, pruned: pruned.count };
}
