/**
 * "Needs you" — the one list on HQ of things a person should act on, gathered from every watcher
 * Foundry already runs (Monitors, Foreman, Care, client Requests, Docs, Pulse). Each source keeps
 * its own rules and its own page; this only turns what they already found into one ranked list,
 * so nobody has to visit five pages to learn what's on fire.
 *
 * Pure: the server reads the sources (src/server/needs-you.ts), this decides what each becomes,
 * how they rank and whether a hidden item comes back. Suggested, never acted on: every item is a
 * link to the place it's dealt with.
 */

import { careHref } from "@/lib/care-links";

export type NeedsYouSource = "monitors" | "foreman" | "care" | "requests" | "docs" | "pulse";

export type NeedsYouSeverity = "critical" | "warn" | "info";

export interface NeedsYouItem {
  /** Stable across reads, so hiding it sticks: `${source}:${subject}`. */
  id: string;
  source: NeedsYouSource;
  severity: NeedsYouSeverity;
  /** What's wrong, in a few words. */
  title: string;
  /** The evidence: one line a person can check. */
  detail: string;
  /** Who it's about, when there is a client. */
  clientName: string | null;
  /** Where it's dealt with. */
  href: string;
  /** The verb on the link ("Open", "Reply", "Triage"). */
  action: string;
  /** When it started, ISO. Null when the source has no start time. */
  since: string | null;
  /**
   * Changes when the item gets materially worse (more requests, another day overdue), so a
   * hidden item comes back instead of staying hidden while it grows.
   */
  fingerprint: string;
}

export interface NeedsYouDTO {
  items: NeedsYouItem[];
  /** Sources that were read. */
  checked: NeedsYouSource[];
  /** Sources that failed to read, so "nothing here" is never claimed for them. */
  failed: NeedsYouSource[];
  readAt: string;
}

export const SOURCE_LABEL: Record<NeedsYouSource, string> = {
  monitors: "Monitors",
  foreman: "Delivery",
  care: "Care",
  requests: "Requests",
  docs: "Docs",
  pulse: "Pulse",
};

const SEVERITY_RANK: Record<NeedsYouSeverity, number> = { critical: 0, warn: 1, info: 2 };

/** Outages first, then by severity, then the longest-standing first, then by title. */
export function rankItems(items: NeedsYouItem[]): NeedsYouItem[] {
  const sourceRank = (s: NeedsYouSource) => (s === "monitors" ? 0 : 1);
  return [...items].sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev) return sev;
    const src = sourceRank(a.source) - sourceRank(b.source);
    if (src) return src;
    const at = (a.since ? Date.parse(a.since) : Infinity) - (b.since ? Date.parse(b.since) : Infinity);
    if (at) return at;
    return a.title.localeCompare(b.title);
  });
}

// ── Hiding ──────────────────────────────────────────────────────────────────────

/** A hidden item: the fingerprint it had, and the day it stays hidden until (YYYY-MM-DD, exclusive). */
export type HiddenEntry = { fingerprint: string; until: string };
export type HiddenMap = Record<string, HiddenEntry>;

export const HIDDEN_KEY = "foundry.needsyou.hidden.v1";

/** Local YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hidden until tomorrow: the list is a daily check, and tomorrow it should ask again. */
export function hideUntilTomorrow(now: Date): string {
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  return dayKey(t);
}

/**
 * An item stays hidden only while it's the same item (same fingerprint) and the day hasn't
 * come. A critical item can never be hidden: an outage must stay on the list until it's over.
 */
export function isHidden(item: NeedsYouItem, hidden: HiddenMap, now: Date): boolean {
  if (item.severity === "critical") return false;
  const h = hidden[item.id];
  if (!h) return false;
  return h.fingerprint === item.fingerprint && dayKey(now) < h.until;
}

/** Drops entries that have expired or whose item is gone, so the stored map can't grow forever. */
export function pruneHidden(hidden: HiddenMap, items: NeedsYouItem[], now: Date): HiddenMap {
  const live = new Set(items.map((i) => i.id));
  const today = dayKey(now);
  const out: HiddenMap = {};
  for (const [id, h] of Object.entries(hidden)) {
    if (live.has(id) && today < h.until) out[id] = h;
  }
  return out;
}

/** Reads the stored map defensively: anything malformed is ignored. */
export function parseHidden(raw: string | null): HiddenMap {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: HiddenMap = {};
    for (const [id, h] of Object.entries(v as Record<string, unknown>)) {
      if (h && typeof h === "object" && typeof (h as HiddenEntry).fingerprint === "string" && typeof (h as HiddenEntry).until === "string") {
        out[id] = { fingerprint: (h as HiddenEntry).fingerprint, until: (h as HiddenEntry).until };
      }
    }
    return out;
  } catch {
    return {};
  }
}

// ── Building items from each source ────────────────────────────────────────────

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "3h", "2 days", "5 min" — how long something has been going on. */
export function sinceWords(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const ms = now.getTime() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h`;
  return plural(Math.floor(h / 24), "day");
}

export type MonitorInput = {
  clientName: string;
  clientSlug: string;
  monitorId: string;
  name: string;
  /** From monitorState(): only down / flaky / stale make an item. */
  state: "up" | "slow" | "flaky" | "down" | "stale" | "pending";
  production: boolean;
  downSince: string | null;
  error: string | null;
};

/** Down in production is critical; down elsewhere, unstable or not being checked is a warning. */
export function monitorItems(monitors: MonitorInput[], now: Date): NeedsYouItem[] {
  const out: NeedsYouItem[] = [];
  for (const m of monitors) {
    if (m.state !== "down" && m.state !== "flaky" && m.state !== "stale") continue;
    const how = sinceWords(m.downSince, now);
    const title =
      m.state === "down" ? `${m.name} is down` : m.state === "flaky" ? `${m.name} keeps failing` : `${m.name} isn't being checked`;
    const detail =
      m.state === "stale"
        ? "No recent check, so its status can't be trusted"
        : [how ? `For ${how}` : null, m.error, m.production ? null : "Not production"].filter(Boolean).join(" · ") || "Failing its checks";
    out.push({
      id: `monitors:${m.monitorId}`,
      source: "monitors",
      severity: m.state === "down" && m.production ? "critical" : "warn",
      title,
      detail,
      clientName: m.clientName,
      href: "/app/monitors",
      action: "Open",
      since: m.downSince,
      fingerprint: m.state,
    });
  }
  return out;
}

export type ForemanInput = {
  key: string;
  severity: "critical" | "warn" | "info";
  category: "project" | "developer" | "blindspot";
  subjectLabel: string;
  headline: string;
  evidence: string[];
  href?: string;
  metric: number;
};

/** Foreman's own risks, minus its blind spots (those belong in Settings, not a daily list). */
export function foremanItems(findings: ForemanInput[]): NeedsYouItem[] {
  return findings
    .filter((f) => f.category !== "blindspot" && f.severity !== "info")
    .map((f) => ({
      id: `foreman:${f.key}`,
      source: "foreman" as const,
      severity: f.severity,
      title: f.headline,
      detail: f.evidence[0] ?? "",
      clientName: f.category === "project" ? f.subjectLabel : null,
      href: f.href ?? "/app",
      action: "Open",
      since: null,
      fingerprint: String(f.metric),
    }));
}

export type CareInput = {
  supportClientId: string;
  clientName: string;
  awaiting: number;
  oldestAwaitingAt: string | null;
};

/** Hours a customer can wait before Care makes it an item, and before it turns red. */
export const CARE_WARN_HOURS = 24;
export const CARE_CRITICAL_HOURS = 72;

export function careItems(rows: CareInput[], now: Date): NeedsYouItem[] {
  const out: NeedsYouItem[] = [];
  for (const r of rows) {
    if (r.awaiting <= 0 || !r.oldestAwaitingAt) continue;
    const hours = (now.getTime() - Date.parse(r.oldestAwaitingAt)) / 3_600_000;
    if (!(hours >= CARE_WARN_HOURS)) continue;
    out.push({
      id: `care:${r.supportClientId}`,
      source: "care",
      severity: hours >= CARE_CRITICAL_HOURS ? "critical" : "warn",
      title: `${plural(r.awaiting, "customer")} waiting for a reply`,
      detail: `Longest wait ${sinceWords(r.oldestAwaitingAt, now) ?? ""}`.trim(),
      clientName: r.clientName,
      href: careHref({ clientId: r.supportClientId }),
      action: "Reply",
      since: r.oldestAwaitingAt,
      fingerprint: String(r.awaiting),
    });
  }
  return out;
}

export type RequestsInput = {
  clientName: string;
  clientSlug: string;
  newCount: number;
  oldestAt: string;
};

/** New client requests nobody has looked at. Older than two days is a warning. */
export function requestItems(rows: RequestsInput[], now: Date): NeedsYouItem[] {
  return rows
    .filter((r) => r.newCount > 0)
    .map((r) => {
      const days = (now.getTime() - Date.parse(r.oldestAt)) / 86_400_000;
      return {
        id: `requests:${r.clientSlug}`,
        source: "requests" as const,
        severity: days >= 2 ? ("warn" as const) : ("info" as const),
        title: `${plural(r.newCount, "new request")} to triage`,
        detail: `Oldest ${sinceWords(r.oldestAt, now) ?? "today"}`,
        clientName: r.clientName,
        href: `/app/portal/${encodeURIComponent(r.clientSlug)}/wiki#intake`,
        action: "Triage",
        since: r.oldestAt,
        fingerprint: String(r.newCount),
      };
    });
}

export type DocInput = {
  id: string;
  title: string;
  clientName: string | null;
  sharedAt: string | null;
  firstViewedAt: string | null;
};

/** A document sent and read with no decision after this many days is worth a nudge. */
export const DOC_NUDGE_DAYS = 5;

/** Sent documents that have stalled: read with no decision, or never opened. */
export function docItems(docs: DocInput[], now: Date): NeedsYouItem[] {
  const out: NeedsYouItem[] = [];
  for (const d of docs) {
    const viewed = d.firstViewedAt;
    const from = viewed ?? d.sharedAt;
    if (!from) continue;
    const days = (now.getTime() - Date.parse(from)) / 86_400_000;
    if (!(days >= DOC_NUDGE_DAYS)) continue;
    out.push({
      id: `docs:${d.id}`,
      source: "docs",
      severity: "info",
      title: viewed ? `${d.title}: read, no decision` : `${d.title}: never opened`,
      detail: viewed ? `First read ${sinceWords(viewed, now)} ago` : `Shared ${sinceWords(d.sharedAt, now)} ago`,
      clientName: d.clientName,
      href: `/app/docs/${encodeURIComponent(d.id)}`,
      action: "Follow up",
      since: from,
      fingerprint: viewed ? "viewed" : "unopened",
    });
  }
  return out;
}

export type PulseInput = {
  key: string;
  name: string;
  /** The reasons a project needs a look, from the Projects list. */
  reasons: string[];
  urgent: number;
  href: string;
};

export function pulseItems(projects: PulseInput[]): NeedsYouItem[] {
  return projects
    .filter((p) => p.reasons.length > 0)
    .map((p) => ({
      id: `pulse:${p.key}`,
      source: "pulse" as const,
      severity: p.urgent > 0 ? ("warn" as const) : ("info" as const),
      title: `${p.name} needs a look`,
      detail: p.reasons.slice(0, 2).join(" · "),
      clientName: null,
      href: p.href,
      action: "Open",
      since: null,
      fingerprint: p.reasons.join("|"),
    }));
}

/** What the list says when nothing needs anyone. */
export function allClearLine(checked: NeedsYouSource[]): string {
  if (checked.length === 0) return "Nothing to check yet.";
  const names = checked.map((s) => SOURCE_LABEL[s]);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Nothing needs you. Checked ${list}.`;
}
