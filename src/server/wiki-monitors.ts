/**
 * wiki-monitors.ts — uptime/health monitors for a client wiki's Monitors section.
 *
 * Monitors are probed on a schedule (/api/cron/wiki-monitors) by the connector
 * registry in ./wiki-monitors/. Each probe writes a WikiMonitorCheck and updates
 * the denormalised last* fields on WikiMonitor for fast public reads. The DTO adds
 * rolling uptime %, average latency, and a recent-status strip for the public board.
 */

import type { Prisma, WikiMonitor, WikiMonitorStatus, WikiMonitorType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runProbe, type MonitorStatus } from "./wiki-monitors/index";
import { dispatchNotification } from "@/server/notifications";
import {
  WINDOW,
  alertBlocks,
  alertMessage,
  CONFIRM_AFTER_MS,
  checkEveryMs,
  incidentHeading,
  shouldConfirm,
  isStale,
  nextAlertState,
  staleMessage,
  type ProbeStatus,
  type ServiceRow,
} from "@/lib/monitor-alerts";
import { suggestMonitors, type MonitorSuggestion } from "@/lib/monitor-suggestions";
import { AGENCY_CLIENT_SLUG } from "@/lib/agency-client";
import { heartbeatCheckDue, inMaintenance } from "@/lib/monitor-expiry";
import { combineLocations } from "@/lib/monitor-request";
import {
  incidentChangeFor,
  isIncidentStatus,
  sortIncidents,
  type IncidentDTO,
  type IncidentStatus,
} from "@/lib/monitor-incidents";
import { storeSecret } from "@/server/stored-secret";
import { monitorHeaders } from "./wiki-monitors/http";
import { remoteProbe } from "./wiki-monitors/remote";
import { randomBytes } from "node:crypto";

/** The URL a job calls each time it runs. Add /fail to report a failed run. */
export function heartbeatPingUrl(token: string): string {
  return `${appBaseUrl()}/api/public/heartbeat/${token}`;
}

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
  /** HEARTBEAT monitors only. `pingUrl` is null in the client's copy — it is the credential. */
  heartbeat: { pingUrl: string | null; lastPingAt: string | null; lastPingOk: boolean | null; graceMinutes: number | null } | null;
  /** Alerts paused until this time (null = not in maintenance). */
  maintenance: { until: string; note: string | null } | null;
  /** HTTPS certificate, read daily. Null until first read, or for non-HTTPS monitors. */
  ssl: { expiresAt: string | null; issuer: string | null; error: string | null; checkedAt: string } | null;
  /** Domain registration, from RDAP. */
  domain: { name: string; expiresAt: string | null; error: string | null; checkedAt: string } | null;
  /** Names of the extra request headers (never their values). Empty in the client's copy. */
  headerNames: string[];
  /** A request body is set (POST checks). */
  hasBody: boolean;
  /** When the last failure was checked from the second location, what it found. */
  remoteNote: string | null;
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
    heartbeat:
      m.type === "HEARTBEAT"
        ? {
            pingUrl: m.heartbeatToken ? heartbeatPingUrl(m.heartbeatToken) : null,
            lastPingAt: m.lastPingAt?.toISOString() ?? null,
            lastPingOk: m.lastPingOk,
            graceMinutes: m.graceMinutes,
          }
        : null,
    maintenance:
      m.maintenanceUntil && inMaintenance(m, new Date())
        ? { until: m.maintenanceUntil.toISOString(), note: m.maintenanceNote }
        : null,
    ssl: m.sslCheckedAt
      ? { expiresAt: m.sslExpiresAt?.toISOString() ?? null, issuer: m.sslIssuer, error: m.sslError, checkedAt: m.sslCheckedAt.toISOString() }
      : null,
    domain:
      m.domain && m.domainCheckedAt
        ? { name: m.domain, expiresAt: m.domainExpiresAt?.toISOString() ?? null, error: m.domainError, checkedAt: m.domainCheckedAt.toISOString() }
        : null,
    headerNames: Object.keys(monitorHeaders(m.requestHeaders)),
    hasBody: !!m.requestBody,
    remoteNote: m.lastRemoteNote,
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
  /** Open incidents, then those resolved in the last 30 days (max 20). */
  incidents: IncidentDTO[];
}

const INCIDENT_WINDOW_DAYS = 30;

const INCIDENT_INCLUDE = {
  monitor: { select: { name: true } },
  updates: { orderBy: { createdAt: "asc" } },
} as const satisfies Prisma.WikiMonitorIncidentInclude;

type IncidentRow = Prisma.WikiMonitorIncidentGetPayload<{ include: typeof INCIDENT_INCLUDE }>;

export function serializeIncident(i: IncidentRow): IncidentDTO {
  const updates = i.updates.map((u) => ({
    id: u.id,
    status: (isIncidentStatus(u.status) ? u.status : "investigating") as IncidentStatus,
    message: u.message,
    isPublic: u.isPublic,
    automatic: u.automatic,
    authorName: u.authorName,
    createdAt: u.createdAt.toISOString(),
  }));
  return {
    id: i.id,
    monitorId: i.monitorId,
    monitorName: i.monitor.name,
    kind: i.kind === "flaky" ? "flaky" : "down",
    title: i.title,
    startedAt: i.startedAt.toISOString(),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByName: i.acknowledgedByName,
    status: i.resolvedAt ? "resolved" : (updates[updates.length - 1]?.status ?? "investigating"),
    updates,
  };
}

/** A wiki's incidents for its Monitors section: every open one, then recent resolved ones. */
export async function loadWikiIncidents(wikiIds: string[]): Promise<IncidentDTO[]> {
  if (wikiIds.length === 0) return [];
  const rows = await prisma.wikiMonitorIncident.findMany({
    where: {
      wikiId: { in: wikiIds },
      OR: [{ resolvedAt: null }, { resolvedAt: { gte: daysAgo(INCIDENT_WINDOW_DAYS) } }],
    },
    orderBy: { startedAt: "desc" },
    take: 20 * wikiIds.length,
    include: INCIDENT_INCLUDE,
  });
  return sortIncidents(rows.map(serializeIncident));
}

export async function loadWikiMonitors(clientId: string): Promise<WikiMonitorsSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: {
      id: true,
      monitorsEnabled: true,
      monitors: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!wiki) return { enabled: false, monitors: [], incidents: [] };
  const [monitors, incidents] = await Promise.all([
    Promise.all(wiki.monitors.map(buildMonitorDTO)),
    loadWikiIncidents([wiki.id]),
  ]);
  return { enabled: wiki.monitorsEnabled, monitors, incidents: incidents.slice(0, 20) };
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
  /** HEARTBEAT: minutes after the expected ping before it counts as missed. */
  graceMinutes?: number | null;
  /** Pause alerts until this time (null ends maintenance). */
  maintenanceUntil?: Date | null;
  maintenanceNote?: string | null;
  /** HTTP: extra headers. Undefined keeps what's saved; null or {} clears them. */
  requestHeaders?: Record<string, string> | null;
  /** HTTP: a request body for POST checks. Undefined keeps; null or "" clears. */
  requestBody?: string | null;
}

/**
 * What the browser and API callers send. Headers travel as "Name: value" text, which the route
 * parses (headersField) before it becomes MonitorInput.
 */
export type MonitorWireInput = Omit<MonitorInput, "requestHeaders" | "maintenanceUntil"> & {
  requestHeaders?: string | null;
  maintenanceUntil?: Date | string | null;
};

function storedHeaders(h: Record<string, string> | null | undefined): string | null {
  return h && Object.keys(h).length > 0 ? storeSecret(JSON.stringify(h)) : null;
}
function storedBody(b: string | null | undefined): string | null {
  return b && b.trim() ? storeSecret(b) : null;
}

/** Enable/disable the Monitors section for a wiki (the sidebar add/remove). */
export async function setWikiMonitorsEnabled(clientId: string, enabled: boolean): Promise<void> {
  const id = await ensureWiki(clientId);
  await prisma.clientWiki.update({ where: { id }, data: { monitorsEnabled: enabled } });
}

export async function createMonitor(clientId: string, input: MonitorInput): Promise<WikiMonitorDTO> {
  const wikiId = await ensureWiki(clientId);
  const max = await prisma.wikiMonitor.aggregate({ where: { wikiId }, _max: { sortOrder: true } });
  // A heartbeat has no target to fetch — its "target" is the URL the job calls.
  const token = input.type === "HEARTBEAT" ? randomBytes(18).toString("base64url") : null;
  const monitor = await prisma.wikiMonitor.create({
    data: {
      wikiId,
      name: input.name.trim(),
      type: input.type,
      target: token ? heartbeatPingUrl(token) : input.target.trim(),
      heartbeatToken: token,
      graceMinutes: input.graceMinutes ?? null,
      requestHeaders: input.type === "HTTP" ? storedHeaders(input.requestHeaders) : null,
      requestBody: input.type === "HTTP" ? storedBody(input.requestBody) : null,
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
  await runMonitorCheck(monitor, { confirm: false }).catch(() => {});
  const fresh = await prisma.wikiMonitor.findUnique({ where: { id: monitor.id } });
  return buildMonitorDTO(fresh ?? monitor);
}

export async function updateMonitor(
  clientId: string,
  monitorId: string,
  input: Partial<MonitorInput>,
): Promise<WikiMonitorDTO | null> {
  const existing = await prisma.wikiMonitor.findFirst({
    where: { id: monitorId, wiki: { clientId } },
    select: { id: true, type: true },
  });
  if (!existing) return null;
  const updated = await prisma.wikiMonitor.update({
    where: { id: monitorId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      // A heartbeat's type and ping URL are fixed — changing either would orphan the job's URL.
      ...(input.type !== undefined && existing.type !== "HEARTBEAT" && input.type !== "HEARTBEAT" ? { type: input.type } : {}),
      ...(input.target !== undefined && existing.type !== "HEARTBEAT" ? { target: input.target.trim() } : {}),
      ...(input.method !== undefined ? { method: input.method.trim() || "GET" } : {}),
      ...(input.expectedStatus !== undefined ? { expectedStatus: input.expectedStatus } : {}),
      ...(input.keyword !== undefined ? { keyword: input.keyword?.trim() || null } : {}),
      ...(input.degradedMs !== undefined ? { degradedMs: input.degradedMs } : {}),
      ...(input.intervalMinutes !== undefined ? { intervalMinutes: input.intervalMinutes } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.graceMinutes !== undefined ? { graceMinutes: input.graceMinutes } : {}),
      ...(input.maintenanceUntil !== undefined ? { maintenanceUntil: input.maintenanceUntil } : {}),
      ...(input.maintenanceNote !== undefined ? { maintenanceNote: input.maintenanceNote?.trim() || null } : {}),
      ...(input.requestHeaders !== undefined ? { requestHeaders: storedHeaders(input.requestHeaders) } : {}),
      ...(input.requestBody !== undefined ? { requestBody: storedBody(input.requestBody) } : {}),
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
  await runMonitorCheck(monitor, { confirm: false });
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

/**
 * Probe one monitor, persist the check, update its state, and alert on an outage or recovery.
 *
 * `confirm` (on for scheduled checks): a FIRST failure is re-checked after CONFIRM_AFTER_MS in
 * the same run, so an outage is confirmed — and alerted — in seconds, not on the next run.
 * Off for "Check now" and a just-added monitor, which a person is waiting on.
 */
export async function runMonitorCheck(monitor: WikiMonitor, opts: { confirm?: boolean } = { confirm: true }): Promise<void> {
  const local = await runProbe(monitor);
  // A failure from Foundry's own server is checked again from a second location before it
  // counts: only-we-can't-reach-it is a network problem, not an outage (combineLocations).
  const remote = local.status === "DOWN" ? await remoteProbe(monitor) : null;
  const result = combineLocations(local, remote);
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
  const decision = nextAlertState(
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
  // Planned work: checks still run and are recorded, but nothing is announced and no outage
  // builds up — the alert state stays as it was, and the streak starts again when it ends.
  const maintenance = inMaintenance(monitor, now);
  const state = maintenance
    ? {
        failStreak: 0,
        downSince: null,
        alertedDownAt: monitor.alertedDownAt,
        alertKind: monitor.alertKind,
        alertClearedAt: monitor.alertClearedAt,
      }
    : decision.state;
  const alert = maintenance ? null : decision.alert;
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
        lastRemoteNote: result.note,
      },
    }),
  ]);
  if (alert) {
    await recordIncident(monitor, alert, result.error, now).catch((err) =>
      console.error("[wiki-monitors] could not record incident", err),
    );
    await sendMonitorAlert(monitor, alert, { statusCode: result.statusCode, error: result.error });
  }

  if (!maintenance && opts.confirm && shouldConfirm(result.status as ProbeStatus, decision.state)) {
    await new Promise((r) => setTimeout(r, CONFIRM_AFTER_MS));
    const fresh = await prisma.wikiMonitor.findUnique({ where: { id: monitor.id } });
    if (fresh?.enabled) await runMonitorCheck(fresh, { confirm: false });
  }
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

/** Every alert's button — GitHub Status's "View all updates" — opens the all-clients board. */
function allMonitorsButton() {
  return { label: "View all monitors", url: `${appBaseUrl()}/app/portal/${AGENCY_CLIENT_SLUG}/wiki#monitors` };
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
        button: allMonitorsButton(),
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
          button: allMonitorsButton(),
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
    (m) =>
      m.type === "HEARTBEAT"
        ? // No network — checked on its interval and again the minute a ping is overdue.
          heartbeatCheckDue(m, new Date(now)) || (m.failStreak > 0 && now - (m.lastCheckedAt?.getTime() ?? 0) >= checkEveryMs(m))
        : !m.lastCheckedAt || now - m.lastCheckedAt.getTime() >= checkEveryMs(m),
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

/**
 * A job pinged its heartbeat URL. Records the ping, then checks the monitor straight away so
 * a recovery (or a reported failure) is announced now, not on the next scheduled run.
 * Returns false for an unknown token or a paused monitor.
 */
export async function recordHeartbeatPing(token: string, ok: boolean): Promise<boolean> {
  if (!token || token.length > 64) return false;
  const monitor = await prisma.wikiMonitor.findFirst({ where: { heartbeatToken: token } });
  if (!monitor || monitor.type !== "HEARTBEAT" || !monitor.enabled) return false;
  const fresh = await prisma.wikiMonitor.update({
    where: { id: monitor.id },
    data: { lastPingAt: new Date(), lastPingOk: ok },
  });
  await runMonitorCheck(fresh, { confirm: false });
  return true;
}


// ─── Incidents ───────────────────────────────────────────────────────────────

/** Open an incident when an alert fires, or resolve the open one when it recovers. */
async function recordIncident(
  monitor: WikiMonitor,
  alert: NonNullable<ReturnType<typeof nextAlertState>["alert"]>,
  error: string | null,
  now: Date,
): Promise<void> {
  const change = incidentChangeFor(alert, monitor.name, error);
  if (!change) return;
  const open = await prisma.wikiMonitorIncident.findFirst({
    where: { monitorId: monitor.id, resolvedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if ("open" in change) {
    if (!open) {
      await prisma.wikiMonitorIncident.create({
        data: {
          wikiId: monitor.wikiId,
          monitorId: monitor.id,
          kind: change.open.kind,
          title: change.open.title,
          startedAt: "since" in alert ? alert.since : now,
          updates: { create: { status: "investigating", message: change.open.message, automatic: true } },
        },
      });
    } else if (open.kind === "flaky" && change.open.kind === "down") {
      // Unstable became down: the same outage, worse.
      await prisma.wikiMonitorIncident.update({
        where: { id: open.id },
        data: {
          kind: "down",
          title: change.open.title,
          updates: { create: { status: "investigating", message: change.open.message, automatic: true } },
        },
      });
    }
    return;
  }
  if (open) {
    await prisma.wikiMonitorIncident.update({
      where: { id: open.id },
      data: {
        resolvedAt: now,
        updates: { create: { status: "resolved", message: change.resolve.message, automatic: true } },
      },
    });
  }
}

async function incidentForClient(clientId: string, incidentId: string) {
  return prisma.wikiMonitorIncident.findFirst({
    where: { id: incidentId, monitor: { wiki: { clientId } } },
    include: INCIDENT_INCLUDE,
  });
}

/** Someone has picked it up. Idempotent: the first person to acknowledge is the one recorded. */
export async function acknowledgeIncident(
  clientId: string,
  incidentId: string,
  by: { userId: string; name: string },
): Promise<IncidentDTO | null> {
  const found = await incidentForClient(clientId, incidentId);
  if (!found) return null;
  if (!found.acknowledgedAt) {
    await prisma.wikiMonitorIncident.updateMany({
      where: { id: incidentId, acknowledgedAt: null },
      data: { acknowledgedAt: new Date(), acknowledgedById: by.userId, acknowledgedByName: by.name },
    });
  }
  const fresh = await incidentForClient(clientId, incidentId);
  return fresh ? serializeIncident(fresh) : null;
}

/**
 * A person's update. "resolved" closes the incident; any other status on a closed incident
 * reopens it. Posting also acknowledges, since someone is clearly on it.
 */
export async function addIncidentUpdate(
  clientId: string,
  incidentId: string,
  input: { status: IncidentStatus; message: string; isPublic: boolean },
  by: { userId: string; name: string },
): Promise<IncidentDTO | null> {
  const found = await incidentForClient(clientId, incidentId);
  if (!found) return null;
  const now = new Date();
  await prisma.wikiMonitorIncident.update({
    where: { id: incidentId },
    data: {
      resolvedAt: input.status === "resolved" ? (found.resolvedAt ?? now) : null,
      ...(found.acknowledgedAt ? {} : { acknowledgedAt: now, acknowledgedById: by.userId, acknowledgedByName: by.name }),
      updates: {
        create: { status: input.status, message: input.message.trim(), isPublic: input.isPublic, authorName: by.name },
      },
    },
  });
  const fresh = await incidentForClient(clientId, incidentId);
  return fresh ? serializeIncident(fresh) : null;
}
