/**
 * "Needs you" — one inbox of things a person should act on, gathered from every watcher
 * Foundry already runs (Monitors, Foreman, Commitments, Care, client Requests, Docs, Pulse).
 * Each source keeps its own rules and its own page; this turns what they already found into one
 * ranked list, so nobody has to visit seven pages to learn what's on fire.
 *
 * Pure: the server reads the sources (src/server/needs-you.ts), this decides what each becomes,
 * which actions a person may take on it, how they rank, and whether a snoozed or dismissed item
 * comes back.
 *
 * Suggested, never acted on: nothing here changes a source on its own. An action on a row is a
 * person pressing a button, and it calls the same route the source's own page calls, so every
 * permission rule there still applies. The actions listed on an item are only the ones that
 * person's own page would offer them.
 */

import { careHref } from "@/lib/care-links";

export type NeedsYouSource = "monitors" | "foreman" | "commitments" | "care" | "requests" | "docs" | "pulse";

export const NEEDS_YOU_SOURCES: readonly NeedsYouSource[] = [
  "monitors",
  "foreman",
  "commitments",
  "care",
  "requests",
  "docs",
  "pulse",
];

export type NeedsYouSeverity = "critical" | "warn" | "info";

/**
 * Something a person can do to an item from the inbox, carrying exactly what the source's own
 * route needs. Built only for people the source's page would let do it.
 */
export type NeedsYouAction =
  | { kind: "acknowledge"; clientSlug: string; incidentId: string }
  | { kind: "post-update"; clientSlug: string; incidentId: string }
  | { kind: "foreman-dismiss"; findingKey: string }
  | { kind: "foreman-mute"; findingKey: string }
  | { kind: "accept-commitment"; commitmentId: string }
  | { kind: "dismiss-commitment"; commitmentId: string }
  | { kind: "create-task"; clientSlug: string; requestId: string }
  | { kind: "mark-dealt-with"; clientSlug: string; requestId: string };

export type NeedsYouActionKind = NeedsYouAction["kind"];

export const ACTION_LABEL: Record<NeedsYouActionKind, string> = {
  acknowledge: "Acknowledge",
  "post-update": "Post update",
  "foreman-dismiss": "Dismiss",
  "foreman-mute": "Mute",
  "accept-commitment": "Add to my list",
  "dismiss-commitment": "Dismiss",
  "create-task": "Create task",
  "mark-dealt-with": "Mark dealt with",
};

/** A person's own snooze or dismissal of an item, as read back for that item. */
export type HoldState = "snoozed" | "dismissed";
export interface NeedsYouHold {
  state: HoldState;
  /** Snoozed until (ISO). Null for a dismissal, which lasts until the item changes. */
  until: string | null;
}

export interface NeedsYouItem {
  /** Stable across reads, so a snooze sticks: `${source}:${subject}`. */
  id: string;
  source: NeedsYouSource;
  severity: NeedsYouSeverity;
  /** What's wrong, in a few words. */
  title: string;
  /** The evidence: one line a person can check. */
  detail: string;
  /** Why it's on the list: the rule that put it here, in plain words. */
  why: string;
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
   * snoozed or dismissed item comes back instead of staying hidden while it grows.
   */
  fingerprint: string;
  /** What can be done here, for this person. Empty means "open it on its own page". */
  actions: NeedsYouAction[];
  /** This person's snooze or dismissal, when one applies right now. */
  hold: NeedsYouHold | null;
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
  commitments: "Commitments",
  care: "Care",
  requests: "Requests",
  docs: "Docs",
  pulse: "Pulse",
};

export const SEVERITY_LABEL: Record<NeedsYouSeverity, string> = {
  critical: "Urgent",
  warn: "Worth a look",
  info: "For your information",
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

/** What a source's items are, counted: "27 projects need a look". */
export function groupHeadline(source: NeedsYouSource, n: number): string {
  const many = n !== 1;
  switch (source) {
    case "monitors":
      return many ? `${n} services need attention` : "1 service needs attention";
    case "foreman":
      return many ? `${n} delivery risks` : "1 delivery risk";
    case "commitments":
      return many ? `${n} suggested commitments` : "1 suggested commitment";
    case "care":
      return many ? `${n} clients with customers waiting` : "1 client with customers waiting";
    case "requests":
      return many ? `${n} client requests to look at` : "1 client request to look at";
    case "docs":
      return many ? `${n} documents to follow up` : "1 document to follow up";
    case "pulse":
      return many ? `${n} projects need a look` : "1 project needs a look";
  }
}

export interface NeedsYouGroup {
  source: NeedsYouSource;
  /** The group's items, in the inbox's order (most serious first). */
  items: NeedsYouItem[];
  /** The most serious item's severity. */
  severity: NeedsYouSeverity;
}

/**
 * HQ's card, one group per source (§157): 27 Pulse projects are one line you can open, not 27
 * rows burying the one outage. Groups go most serious first, then outages, then the biggest.
 */
export function groupBySource(items: NeedsYouItem[]): NeedsYouGroup[] {
  const by = new Map<NeedsYouSource, NeedsYouItem[]>();
  for (const item of rankItems(items)) by.set(item.source, [...(by.get(item.source) ?? []), item]);
  return [...by.entries()]
    .map(([source, list]) => ({ source, items: list, severity: list[0].severity }))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        (a.source === "monitors" ? -1 : b.source === "monitors" ? 1 : 0) ||
        b.items.length - a.items.length,
    );
}

/** The names in a group's summary line: "adam-beasley.com, Afterdesk Testing +25". */
export function groupNames(items: NeedsYouItem[], shown = 2): string {
  const names = items.map((i) => i.clientName ?? i.title.replace(/ needs a look$/, ""));
  const unique = [...new Set(names)];
  const head = unique.slice(0, shown).join(", ");
  const rest = items.length - Math.min(shown, unique.length);
  return rest > 0 ? `${head} +${rest}` : head;
}

// ── Who may do what ───────────────────────────────────────────────────────────

/**
 * What the reader knows about the person, so an item only offers what their own page would.
 * Every route re-checks; this only keeps a button off a row that would refuse it.
 */
export interface NeedsYouCaps {
  /** Clients this person can open in Portal. Null = every client. */
  openableClientIds: string[] | null;
  /** Admin or above (Foreman's routes, and creating a task from a request). */
  admin: boolean;
}

export function canOpenClient(caps: NeedsYouCaps | undefined, clientId: string): boolean {
  if (!caps) return false;
  return caps.openableClientIds === null || caps.openableClientIds.includes(clientId);
}

// ── Snooze and dismiss ────────────────────────────────────────────────────────

/** The old browser-only hide list. Ignored now, and cleared when the card first loads. */
export const LEGACY_HIDDEN_KEY = "foundry.needsyou.hidden.v1";

/** The longest a snooze can run, so a forgotten one can't hide something for good. */
export const MAX_SNOOZE_DAYS = 30;

/** A stored snooze or dismissal, as the database holds it. */
export interface StoredHold {
  id: string;
  itemKey: string;
  fingerprint: string;
  state: string;
  until: Date | string | null;
  updatedAt: Date | string;
}

function time(v: Date | string | null): number {
  if (v === null) return NaN;
  return typeof v === "string" ? Date.parse(v) : v.getTime();
}

/** An outage can never be snoozed or dismissed: it stays on the list until it's over. */
export function canHold(item: Pick<NeedsYouItem, "severity">): boolean {
  return item.severity !== "critical";
}

/**
 * Which of the person's own choices a row offers. Dismiss is left off where the source has its
 * own (Foreman's Dismiss, a commitment's Dismiss), so a row never shows two buttons called Dismiss
 * that do different things.
 */
export function holdChoices(item: Pick<NeedsYouItem, "severity" | "source">): { snooze: boolean; dismiss: boolean } {
  if (!canHold(item)) return { snooze: false, dismiss: false };
  return { snooze: true, dismiss: item.source !== "foreman" && item.source !== "commitments" };
}

/**
 * Whether a stored hold applies to an item now. It applies only while the item is the same
 * (same fingerprint), never to a critical item, and a snooze only until its time.
 */
export function holdFor(item: Pick<NeedsYouItem, "severity" | "fingerprint">, row: StoredHold | undefined, now: Date): NeedsYouHold | null {
  if (!row || !canHold(item)) return null;
  if (row.fingerprint !== item.fingerprint) return null;
  if (row.state === "dismissed") return { state: "dismissed", until: null };
  if (row.state !== "snoozed") return null;
  const until = time(row.until);
  if (!Number.isFinite(until) || until <= now.getTime()) return null;
  return { state: "snoozed", until: new Date(until).toISOString() };
}

/** The source an item key belongs to, or null for a key no source makes. */
export function sourceOfKey(key: string): NeedsYouSource | null {
  const i = key.indexOf(":");
  if (i <= 0 || i === key.length - 1) return null;
  const s = key.slice(0, i);
  return (NEEDS_YOU_SOURCES as readonly string[]).includes(s) ? (s as NeedsYouSource) : null;
}

/** A snooze must end in the future and no more than MAX_SNOOZE_DAYS ahead. */
export function isValidSnoozeUntil(until: Date, now: Date): boolean {
  const t = until.getTime();
  return Number.isFinite(t) && t > now.getTime() && t <= now.getTime() + MAX_SNOOZE_DAYS * 86_400_000;
}

/**
 * Stored holds worth deleting: a duplicate for the same item (the newest is kept), a snooze that
 * has run out, one whose item has changed (it came back), and one whose item has gone from a
 * source that was read just now. A source that failed to read keeps its holds, because "we
 * couldn't look" is not "it's gone".
 */
export function staleHoldIds(
  rows: StoredHold[],
  items: Pick<NeedsYouItem, "id" | "fingerprint">[],
  checked: NeedsYouSource[],
  now: Date,
): string[] {
  const byKey = new Map(items.map((i) => [i.id, i]));
  const out: string[] = [];
  const newest = new Map<string, StoredHold>();
  for (const r of rows) {
    const kept = newest.get(r.itemKey);
    if (!kept || time(r.updatedAt) > time(kept.updatedAt)) {
      if (kept) out.push(kept.id);
      newest.set(r.itemKey, r);
    } else {
      out.push(r.id);
    }
  }
  for (const r of newest.values()) {
    const item = byKey.get(r.itemKey);
    if (r.state === "snoozed" && !(time(r.until) > now.getTime())) {
      out.push(r.id);
    } else if (item && item.fingerprint !== r.fingerprint) {
      out.push(r.id);
    } else if (!item) {
      const source = sourceOfKey(r.itemKey);
      if (!source || checked.includes(source)) out.push(r.id);
    }
  }
  return out;
}

/** Applies the person's holds, newest per item. */
export function applyHolds(items: NeedsYouItem[], rows: StoredHold[], now: Date): NeedsYouItem[] {
  const newest = new Map<string, StoredHold>();
  for (const r of rows) {
    const kept = newest.get(r.itemKey);
    if (!kept || time(r.updatedAt) > time(kept.updatedAt)) newest.set(r.itemKey, r);
  }
  return items.map((i) => ({ ...i, hold: holdFor(i, newest.get(i.id), now) }));
}

/** Snooze choices, worked out in the person's own time zone (the browser's). */
export function snoozePresets(now: Date): { id: string; label: string; until: Date }[] {
  const at8 = (d: Date) => {
    const t = new Date(d);
    t.setHours(8, 0, 0, 0);
    return t;
  };
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const monday = new Date(now);
  // Next Monday, never today: a snooze to "next week" on a Monday means the Monday after.
  monday.setDate(monday.getDate() + (((8 - monday.getDay()) % 7) || 7));
  return [
    { id: "3h", label: "3 hours", until: new Date(now.getTime() + 3 * 3_600_000) },
    { id: "tomorrow", label: "Tomorrow morning", until: at8(tomorrow) },
    { id: "week", label: "Next week", until: at8(monday) },
  ];
}

// ── The inbox view ─────────────────────────────────────────────────────────────

export type InboxView = "open" | "snoozed" | "dismissed";

export interface InboxFilter {
  view: InboxView;
  source?: NeedsYouSource | null;
  severity?: NeedsYouSeverity | null;
}

export function inInboxView(item: Pick<NeedsYouItem, "hold">, view: InboxView): boolean {
  if (view === "open") return item.hold === null;
  return item.hold?.state === view;
}

export function filterInbox(items: NeedsYouItem[], f: InboxFilter): NeedsYouItem[] {
  return items.filter(
    (i) => inInboxView(i, f.view) && (!f.source || i.source === f.source) && (!f.severity || i.severity === f.severity),
  );
}

/** How many items sit in each view, so the switch can show its counts. */
export function countInbox(items: NeedsYouItem[]): Record<InboxView, number> {
  const out: Record<InboxView, number> = { open: 0, snoozed: 0, dismissed: 0 };
  for (const i of items) {
    if (i.hold === null) out.open += 1;
    else out[i.hold.state] += 1;
  }
  return out;
}

/**
 * What the `e` key does to an item: the source's own way of saying "dealt with" when it has one,
 * else the person's own dismissal. Null when nothing can be done here (an outage with no incident
 * to acknowledge, or no permission).
 */
export function resolveChoice(item: NeedsYouItem): NeedsYouAction | "dismiss" | null {
  const pick = (k: NeedsYouActionKind) => item.actions.find((a) => a.kind === k);
  const own = pick("acknowledge") ?? pick("mark-dealt-with") ?? pick("foreman-dismiss") ?? pick("dismiss-commitment");
  if (own) return own;
  return holdChoices(item).dismiss ? "dismiss" : null;
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

/** The parts every item would otherwise repeat. */
function base(): Pick<NeedsYouItem, "actions" | "hold"> {
  return { actions: [], hold: null };
}

export type MonitorInput = {
  clientId: string;
  clientName: string;
  clientSlug: string;
  monitorId: string;
  name: string;
  /** From monitorState(): only down / flaky / stale make an item. */
  state: "up" | "slow" | "flaky" | "down" | "stale" | "pending";
  production: boolean;
  downSince: string | null;
  error: string | null;
  /** The monitor's open incident, when there is one. */
  incident?: { id: string; acknowledged: boolean } | null;
};

/** Down in production is critical; down elsewhere, unstable or not being checked is a warning. */
export function monitorItems(monitors: MonitorInput[], now: Date, caps?: NeedsYouCaps): NeedsYouItem[] {
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
    const why =
      m.state === "down"
        ? `${m.production ? "A production" : "A non-production"} service is failing every check`
        : m.state === "flaky"
          ? "Its checks keep failing on and off"
          : "Its checks stopped running";
    const actions: NeedsYouAction[] = [];
    if (m.incident && canOpenClient(caps, m.clientId)) {
      if (!m.incident.acknowledged) actions.push({ kind: "acknowledge", clientSlug: m.clientSlug, incidentId: m.incident.id });
      actions.push({ kind: "post-update", clientSlug: m.clientSlug, incidentId: m.incident.id });
    }
    out.push({
      ...base(),
      id: `monitors:${m.monitorId}`,
      source: "monitors",
      severity: m.state === "down" && m.production ? "critical" : "warn",
      title,
      detail,
      why,
      clientName: m.clientName,
      href: "/app/monitors",
      action: "Open",
      since: m.downSince,
      // Acknowledging is part of the item's state: an acknowledged outage is a different fact.
      fingerprint: `${m.state}${m.incident?.acknowledged ? ":ack" : ""}`,
      actions,
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

/**
 * Foreman's own risks, minus its blind spots (those belong in Settings, not a daily list).
 * Dismiss and Mute are Foreman's own (shared by the workspace, as on Settings → Foreman), offered
 * to admins only, as there.
 */
export function foremanItems(findings: ForemanInput[], caps?: NeedsYouCaps): NeedsYouItem[] {
  return findings
    .filter((f) => f.category !== "blindspot" && f.severity !== "info")
    .map((f) => ({
      ...base(),
      id: `foreman:${f.key}`,
      source: "foreman" as const,
      severity: f.severity,
      title: f.headline,
      detail: f.evidence[0] ?? "",
      why: f.category === "developer" ? "Foreman's morning check flagged a developer's workload" : "Foreman's morning check flagged this delivery risk",
      clientName: f.category === "project" ? f.subjectLabel : null,
      href: f.href ?? "/app",
      action: "Open",
      since: null,
      fingerprint: String(f.metric),
      actions: caps?.admin
        ? [
            { kind: "foreman-dismiss" as const, findingKey: f.key },
            { kind: "foreman-mute" as const, findingKey: f.key },
          ]
        : [],
    }));
}

export type CommitmentInput = {
  id: string;
  title: string;
  quote: string | null;
  counterpart: string | null;
  sourceLabel: string;
  createdAt: string;
};

/**
 * Promises Foundry read in the person's own messages and is suggesting they keep. Only ever the
 * person's own (Commitments are private), so Accept and Dismiss are always theirs to press.
 */
export function commitmentItems(rows: CommitmentInput[], now: Date): NeedsYouItem[] {
  return rows.map((c) => ({
    ...base(),
    id: `commitments:${c.id}`,
    source: "commitments" as const,
    severity: "info" as const,
    title: c.title,
    detail: [c.quote ? `“${c.quote}”` : null, c.counterpart ? `To ${c.counterpart}` : null].filter(Boolean).join(" · "),
    why: `Suggested from ${c.sourceLabel.toLowerCase()} ${sinceWords(c.createdAt, now) ?? "just now"} ago, not on your list yet`,
    clientName: null,
    href: "/app/backstage?area=commitments",
    action: "Review",
    since: c.createdAt,
    fingerprint: "suggested",
    actions: [
      { kind: "accept-commitment" as const, commitmentId: c.id },
      { kind: "dismiss-commitment" as const, commitmentId: c.id },
    ],
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
    const critical = hours >= CARE_CRITICAL_HOURS;
    out.push({
      ...base(),
      id: `care:${r.supportClientId}`,
      source: "care",
      severity: critical ? "critical" : "warn",
      title: `${plural(r.awaiting, "customer")} waiting for a reply`,
      detail: `Longest wait ${sinceWords(r.oldestAwaitingAt, now) ?? ""}`.trim(),
      why: `A customer has waited over ${critical ? CARE_CRITICAL_HOURS : CARE_WARN_HOURS} hours for a reply`,
      clientName: r.clientName,
      href: careHref({ clientId: r.supportClientId }),
      action: "Reply",
      since: r.oldestAwaitingAt,
      fingerprint: String(r.awaiting),
    });
  }
  return out;
}

export type RequestInput = {
  requestId: string;
  clientId: string;
  clientName: string;
  clientSlug: string;
  title: string;
  /** BUG | FEEDBACK | TASK | DESIGN */
  type: string;
  requestedBy: string | null;
  createdAt: string;
};

const REQUEST_TYPE_LABEL: Record<string, string> = { BUG: "Bug", FEEDBACK: "Feedback", TASK: "Task", DESIGN: "Design" };

/** The most new requests one read lists, oldest first, so one busy client can't fill the inbox. */
export const MAX_REQUEST_ITEMS = 60;

/**
 * One item per client request nobody has looked at. Older than two days is a warning.
 * Mark dealt with is offered to anyone who can open the client (the route's own rule); Create
 * task to admins as well, as the route requires.
 */
export function requestItems(rows: RequestInput[], now: Date, caps?: NeedsYouCaps): NeedsYouItem[] {
  return rows.map((r) => {
    const days = (now.getTime() - Date.parse(r.createdAt)) / 86_400_000;
    const age = sinceWords(r.createdAt, now);
    const actions: NeedsYouAction[] = [];
    if (canOpenClient(caps, r.clientId)) {
      if (caps?.admin) actions.push({ kind: "create-task", clientSlug: r.clientSlug, requestId: r.requestId });
      actions.push({ kind: "mark-dealt-with", clientSlug: r.clientSlug, requestId: r.requestId });
    }
    return {
      ...base(),
      id: `requests:${r.requestId}`,
      source: "requests" as const,
      severity: days >= 2 ? ("warn" as const) : ("info" as const),
      title: r.title,
      detail: [REQUEST_TYPE_LABEL[r.type] ?? "Request", r.requestedBy ? `from ${r.requestedBy}` : null, age ? `${age} ago` : "today"]
        .filter(Boolean)
        .join(" · "),
      why: days >= 2 ? "A new client request, not triaged for over two days" : "A new client request, not triaged yet",
      clientName: r.clientName,
      href: `/app/portal/${encodeURIComponent(r.clientSlug)}/wiki#intake`,
      action: "Triage",
      since: r.createdAt,
      fingerprint: "new",
      actions,
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
      ...base(),
      id: `docs:${d.id}`,
      source: "docs",
      severity: "info",
      title: viewed ? `${d.title}: read, no decision` : `${d.title}: never opened`,
      detail: viewed ? `First read ${sinceWords(viewed, now)} ago` : `Shared ${sinceWords(d.sharedAt, now)} ago`,
      why: viewed
        ? `Sent and read, with no accept or decline after ${DOC_NUDGE_DAYS} days`
        : `Sent and not opened after ${DOC_NUDGE_DAYS} days`,
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
      ...base(),
      id: `pulse:${p.key}`,
      source: "pulse" as const,
      severity: p.urgent > 0 ? ("warn" as const) : ("info" as const),
      title: `${p.name} needs a look`,
      detail: p.reasons.slice(0, 2).join(" · "),
      why: p.urgent > 0 ? `Its latest scan has ${plural(p.urgent, "urgent finding")}` : "Its latest scan flagged it on the Projects list",
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
