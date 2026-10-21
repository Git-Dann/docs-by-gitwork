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
import { dispatchNotification } from "@/server/notifications";
import {
  WINDOW,
  alertBlocks,
  alertMessage,
  checkEveryMs,
  incidentHeading,
  isStale,
  nextAlertState,
  staleMessage,
  type ProbeStatus,
  type ServiceRow,
} from "@/lib/monitor-alerts";
import { suggestMonitors, type MonitorSuggestion } from "@/lib/monitor-suggestions";

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
  /**
   * Not checked recently enough to trust `status`. Shown as "Not checked since …" rather than
   * the last result — a monitor whose checker stopped kept showing UP for 2½ months (Aug–Oct 2026).
   */
  stale: boolean;
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
    stale: isStale(m, new Date()),
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

/** Monitors worth adding — the client's Platform URLs that nothing is watching yet. */
export async function loadMonitorSuggestions(clientId: string): Promise<MonitorSuggestion[]> {
  const [platforms, wiki] = await Promise.all([
    prisma.clientPlatform.findMany({
      where: { clientId },
      orderBy: { createdAt: "asc" },
      // URL and name only — never logins or notes.
      select: { name: true, url: true },
    }),
    prisma.clientWiki.findUnique({
      where: { clientId },
      select: { monitors: { select: { target: true } } },
    }),
  ]);
  return suggestMonitors(platforms, wiki?.monitors.map((m) => m.target) ?? []);
}

// ─── Probing ────────────────────────────────────────────────────────────────

/** Probe one monitor, persist the check, update its state, and alert on an outage or recovery. */
export async function runMonitorCheck(monitor: WikiMonitor): Promise<void> {
  const result = await runProbe(monitor);
  const now = new Date();
  // The checks before this one, since the last alert cleared — the "3 of the last 6" window.
  // Filtered by alertClearedAt so an outage already reported and recovered isn't re-counted.
  const recent = await prisma.wikiMonitorCheck.findMany({
    where: {
      monitorId: monitor.id,
      ...(monitor.alertClearedAt ? { checkedAt: { gt: monitor.alertClearedAt } } : {}),
    },
    orderBy: { checkedAt: "desc" },
    take: WINDOW - 1,
    select: { status: true },
  });
  const { state, alert } = nextAlertState(
    {
      failStreak: monitor.failStreak,
      downSince: monitor.downSince,
      alertedDownAt: monitor.alertedDownAt,
      alertKind: monitor.alertKind === "down" || monitor.alertKind === "flaky" ? monitor.alertKind : null,
      alertClearedAt: monitor.alertClearedAt,
    },
    result.status as ProbeStatus,
    now,
    recent.reverse().map((c) => c.status as ProbeStatus),
  );
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
        lastCheckedAt: now,
        lastLatencyMs: result.latencyMs,
        lastStatusCode: result.statusCode,
        lastError: result.error,
        failStreak: state.failStreak,
        downSince: state.downSince,
        alertedDownAt: state.alertedDownAt,
        alertKind: state.alertKind,
        alertClearedAt: state.alertClearedAt,
        // Checked again, so the watchdog may speak up again if checks ever stop.
        staleAlertedAt: null,
      },
    }),
  ]);
  if (alert) await sendMonitorAlert(monitor, alert, { statusCode: result.statusCode, error: result.error });
}

/** Who and where to tell: the monitor's client, for the message and the link back. */
async function monitorOwner(wikiId: string) {
  const wiki = await prisma.clientWiki.findUnique({
    where: { id: wikiId },
    select: { client: { select: { name: true, slug: true, workspaceId: true } } },
  });
  return wiki?.client ?? null;
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://foundry.gitwork.co.uk").replace(/\/+$/, "");
}

/** Every monitor on the wiki with its status as of now — the post's services list. */
async function serviceRows(wikiId: string): Promise<ServiceRow[]> {
  const now = new Date();
  const monitors = await prisma.wikiMonitor.findMany({
    where: { wikiId, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { name: true, lastStatus: true, alertKind: true, enabled: true, lastCheckedAt: true, createdAt: true, intervalMinutes: true },
  });
  return monitors.map((m) => ({
    name: m.name,
    state: isStale(m, now)
      ? "stale"
      : m.lastStatus === "DOWN"
        ? "down"
        : m.alertKind === "flaky"
          ? "flaky"
          : m.lastStatus === "DEGRADED"
            ? "slow"
            : "up",
  }));
}

async function sendMonitorAlert(
  monitor: WikiMonitor,
  alert: NonNullable<ReturnType<typeof nextAlertState>["alert"]>,
  detail: { statusCode: number | null; error: string | null },
): Promise<void> {
  try {
    const client = await monitorOwner(monitor.wikiId);
    if (!client) return;
    const { title, body } = alertMessage(
      { clientName: client.name, monitorName: monitor.name, target: monitor.target },
      alert,
      detail,
    );
    const actionUrl = `/app/portal/${client.slug}/wiki#monitors`;
    dispatchNotification({
      event: "clients.monitor_alert",
      workspaceId: client.workspaceId,
      title,
      body,
      actionUrl,
      target: { kind: "admins" },
      groupKey: `clients.monitor_alert:${monitor.id}`,
      count: 1,
      slackBlocks: alertBlocks({
        heading: incidentHeading(alert.kind),
        // The emoji leads the plain-text title (notifications, push); the post has its own
        // status line, so the linked title drops it — as GitHub Status's does.
        title: title.replace(/^\S+\s+/, ""),
        url: `${appBaseUrl()}${actionUrl}`,
        description: body,
        services: await serviceRows(monitor.wikiId),
        footer: "Foundry uptime monitoring · re-checked every minute while anything is failing",
      }),
    });
  } catch (err) {
    // An alert that fails to send must never break the check that found the outage.
    console.error("[wiki-monitors] could not send alert", err);
  }
}

/**
 * The watchdog for the failure a check can never report: checks not running at all. Called
 * from the every-minute `jobs` worker — a different cron from the one it watches, so the two
 * cannot stop together. Says so ONCE per stale monitor (`staleAlertedAt`), grouped per
 * workspace; the next successful check clears the latch.
 */
export async function checkMonitorsWatchdog(now: Date = new Date()): Promise<{ stale: number }> {
  const candidates = await prisma.wikiMonitor.findMany({
    where: { enabled: true, staleAlertedAt: null },
    select: {
      id: true,
      name: true,
      enabled: true,
      lastCheckedAt: true,
      createdAt: true,
      intervalMinutes: true,
      wiki: { select: { client: { select: { name: true, slug: true, workspaceId: true } } } },
    },
  });
  const stale = candidates.filter((m) => isStale(m, now));
  if (stale.length === 0) return { stale: 0 };

  const byWorkspace = new Map<string, typeof stale>();
  for (const m of stale) {
    const ws = m.wiki.client.workspaceId;
    byWorkspace.set(ws, [...(byWorkspace.get(ws) ?? []), m]);
  }
  for (const [workspaceId, list] of byWorkspace) {
    const { title, body } = staleMessage(
      list.map((m) => ({ clientName: m.wiki.client.name, monitorName: m.name, lastCheckedAt: m.lastCheckedAt })),
      now,
    );
    const actionUrl = `/app/portal/${list[0].wiki.client.slug}/wiki#monitors`;
    try {
      dispatchNotification({
        event: "clients.monitor_alert",
        workspaceId,
        title,
        body,
        actionUrl,
        slackBlocks: alertBlocks({
          heading: incidentHeading("stalled"),
          title: title.replace(/^\S+\s+/, ""),
          url: `${appBaseUrl()}${actionUrl}`,
          description:
            "These monitors have not been checked recently, so their status can't be trusted. The wiki-monitors job may have stopped.",
          services: list.map((m) => ({ name: `${m.wiki.client.name} — ${m.name}`, state: "stale" as const })),
          footer: "Foundry uptime monitoring · watchdog",
        }),
        target: { kind: "admins" },
        groupKey: "clients.monitor_alert:stale",
        count: list.length,
      });
    } catch (err) {
      console.error("[wiki-monitors] could not send watchdog alert", err);
    }
  }
  await prisma.wikiMonitor.updateMany({
    where: { id: { in: stale.map((m) => m.id) } },
    data: { staleAlertedAt: now },
  });
  return { stale: stale.length };
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
    // Every minute while failing, its own interval otherwise (checkEveryMs). The cron runs
    // every minute so a failing monitor is actually picked up that often.
    (m) => !m.lastCheckedAt || now - m.lastCheckedAt.getTime() >= checkEveryMs(m),
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
