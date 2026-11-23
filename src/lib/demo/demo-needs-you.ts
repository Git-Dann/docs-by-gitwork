/**
 * Demo data for the "Needs you" inbox (/demo/hq and /demo/inbox), run through the real rules in
 * src/lib/needs-you.ts so the demo shows what production would. Every source is present, and every
 * action works in memory: acknowledging an incident, Foreman's dismiss and mute, accepting or
 * dismissing a suggested commitment, creating a task from a request or marking it dealt with,
 * and the person's own snooze and dismiss. Every name is invented.
 *
 * Ids start "ny-" so these handlers can never answer another demo's request.
 */

import {
  applyHolds,
  careItems,
  commitmentItems,
  docItems,
  foremanItems,
  isValidSnoozeUntil,
  monitorItems,
  pulseItems,
  rankItems,
  requestItems,
  sourceOfKey,
  type NeedsYouCaps,
  type NeedsYouDTO,
  type StoredHold,
} from "@/lib/needs-you";

const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

/** The demo's admin can open every client and do every admin action. */
const CAPS: NeedsYouCaps = { openableClientIds: null, admin: true };

type DemoState = {
  /** Items dealt with through their source (they leave the list). */
  resolved: Set<string>;
  /** Incidents acknowledged. */
  acked: Set<string>;
  holds: Map<string, StoredHold>;
  seeded: boolean;
};

const state: DemoState = { resolved: new Set(), acked: new Set(), holds: new Map(), seeded: false };

/** One item starts snoozed, so the Snoozed view has something to show. */
function seed(now: Date) {
  if (state.seeded) return;
  state.seeded = true;
  state.holds.set("docs:ny-doc-2", {
    id: "ny-hold-1",
    itemKey: "docs:ny-doc-2",
    fingerprint: "unopened",
    state: "snoozed",
    until: new Date(now.getTime() + 20 * 3_600_000).toISOString(),
    updatedAt: hoursAgo(now, 2),
  });
}

export function demoNeedsYou(now: Date = new Date()): NeedsYouDTO {
  seed(now);
  const items = [
    ...monitorItems(
      [
        {
          clientId: "c-northwind",
          clientName: "Northwind Labs",
          clientSlug: "northwind",
          monitorId: "ny-m-api",
          name: "Production API",
          state: "down",
          production: true,
          downSince: hoursAgo(now, 0.3),
          error: "HTTP 503",
          incident: { id: "ny-inc-1", acknowledged: state.acked.has("ny-inc-1") },
        },
        {
          clientId: "c-fairway",
          clientName: "Fairway Club",
          clientSlug: "fairway",
          monitorId: "ny-m-web",
          name: "Members site",
          state: "flaky",
          production: true,
          downSince: hoursAgo(now, 2),
          error: null,
          incident: { id: "ny-inc-2", acknowledged: true },
        },
      ],
      now,
      CAPS,
    ),
    ...foremanItems(
      [
        {
          key: "OVERDUE_TASKS:ny-cadenza",
          severity: "warn",
          category: "project",
          subjectLabel: "Cadenza",
          headline: "6 tasks overdue",
          evidence: ["Oldest is 9 days late: Checkout retry flow"],
          href: "/app/tasks",
          metric: 6,
        },
      ],
      CAPS,
    ),
    ...commitmentItems(
      [
        {
          id: "ny-c-1",
          title: "Send Fairway the revised timeline",
          quote: "I'll get the revised timeline over to you by Thursday",
          counterpart: "Priya at Fairway",
          sourceLabel: "Your sent email",
          createdAt: hoursAgo(now, 5),
        },
        {
          id: "ny-c-2",
          title: "Share the load-test results with Northwind",
          quote: "Will share the load-test numbers once they're in",
          counterpart: "#northwind-build",
          sourceLabel: "Your Slack message",
          createdAt: hoursAgo(now, 26),
        },
      ],
      now,
    ),
    ...careItems([{ supportClientId: "ny-sc-1", clientName: "Northwind Labs", awaiting: 3, oldestAwaitingAt: hoursAgo(now, 30) }], now),
    ...requestItems(
      [
        {
          requestId: "ny-r-1",
          clientId: "c-fairway",
          clientName: "Fairway Club",
          clientSlug: "fairway",
          title: "Booking confirmation email shows the wrong tee time",
          type: "BUG",
          requestedBy: "Tom Hale",
          createdAt: hoursAgo(now, 60),
        },
        {
          requestId: "ny-r-2",
          clientId: "c-fairway",
          clientName: "Fairway Club",
          clientSlug: "fairway",
          title: "Let members add a guest to a booking",
          type: "FEEDBACK",
          requestedBy: "Tom Hale",
          createdAt: hoursAgo(now, 8),
        },
        {
          requestId: "ny-r-3",
          clientId: "c-northwind",
          clientName: "Northwind Labs",
          clientSlug: "northwind",
          title: "Export the usage report as CSV",
          type: "TASK",
          requestedBy: null,
          createdAt: hoursAgo(now, 3),
        },
      ],
      now,
      CAPS,
    ),
    ...docItems(
      [
        { id: "ny-doc-1", title: "Cadenza phase 2 proposal", clientName: "Cadenza", sharedAt: hoursAgo(now, 24 * 9), firstViewedAt: hoursAgo(now, 24 * 7) },
        { id: "ny-doc-2", title: "Brightwell SOW", clientName: "Brightwell", sharedAt: hoursAgo(now, 24 * 6), firstViewedAt: null },
      ],
      now,
    ),
    ...pulseItems([{ key: "url:ny-fairway", name: "fairwayclub.co.uk", reasons: ["Score fell 7 points since the last scan"], urgent: 2, href: "/app/pulse" }]),
  ].filter((i) => !state.resolved.has(i.id));
  // The demo links stay inside the demo.
  const local = items.map((i) => ({ ...i, href: i.href.replace(/^\/app\//, "/demo/") }));
  return {
    items: rankItems(applyHolds(local, [...state.holds.values()], now)),
    checked: ["monitors", "foreman", "commitments", "care", "requests", "docs", "pulse"],
    failed: [],
    readAt: now.toISOString(),
  };
}

function bodyOf(init?: { body?: unknown }): Record<string, unknown> {
  try {
    const v = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Handles the inbox's own writes, and the source routes it calls, for the "ny-" demo items.
 * Returns undefined for anything else, so other demos answer as before.
 */
export function demoNeedsYouApi(pathname: string, init?: { method?: string; body?: unknown }): unknown {
  const method = (init?.method ?? "GET").toUpperCase();
  const now = new Date();

  if (pathname === "/api/hq/needs-you" && method === "GET") return demoNeedsYou(now);

  if (pathname === "/api/hq/needs-you/state" && method === "POST") {
    const b = bodyOf(init);
    const key = String(b.itemKey ?? "");
    if (!sourceOfKey(key)) return { error: "That isn't an item in Needs you.", __status: 400 };
    if (b.action === "clear") {
      state.holds.delete(key);
      return { itemKey: key, state: null, until: null };
    }
    const until = b.action === "snooze" ? new Date(String(b.until)) : null;
    if (until && !isValidSnoozeUntil(until, now)) return { error: "A snooze has to end in the future, and within 30 days.", __status: 400 };
    state.holds.set(key, {
      id: `ny-hold-${key}`,
      itemKey: key,
      fingerprint: String(b.fingerprint ?? ""),
      state: b.action === "snooze" ? "snoozed" : "dismissed",
      until: until?.toISOString() ?? null,
      updatedAt: now.toISOString(),
    });
    return { itemKey: key, state: b.action === "snooze" ? "snoozed" : "dismissed", until: until?.toISOString() ?? null };
  }

  const inc = pathname.match(/^\/api\/clients\/[^/]+\/wiki\/monitors\/incidents\/(ny-[^/]+)$/);
  if (inc && method === "POST") {
    if (bodyOf(init).action === "acknowledge") state.acked.add(inc[1]);
    return { id: inc[1], acknowledgedAt: now.toISOString() };
  }

  if (pathname === "/api/foreman/findings" && method === "POST") {
    const b = bodyOf(init);
    const keys = Array.isArray(b.findingKeys) ? (b.findingKeys as string[]) : [];
    if (!keys.some((k) => k.includes("ny-"))) return undefined;
    for (const k of keys) {
      if (b.action === "clear") state.resolved.delete(`foreman:${k}`);
      else state.resolved.add(`foreman:${k}`);
    }
    return { updated: keys.length };
  }

  const c = pathname.match(/^\/api\/backstage\/commitments\/(ny-[^/]+)$/);
  if (c && method === "PATCH") {
    state.resolved.add(`commitments:${c[1]}`);
    const s = bodyOf(init).state;
    return { commitment: { id: c[1], state: s === "dismissed" ? "dismissed" : "open" }, next: null };
  }

  const r = pathname.match(/^\/api\/clients\/[^/]+\/wiki\/intake-items\/(ny-[^/]+)(\/promote)?$/);
  if (r) {
    const id = `requests:${r[1]}`;
    if (r[2] && method === "POST") {
      state.resolved.add(id);
      return { item: { id: r[1], status: "PROMOTED" }, taskId: `ny-task-${r[1]}` };
    }
    if (!r[2] && method === "PATCH") {
      const status = bodyOf(init).status;
      if (status === "NEW") state.resolved.delete(id);
      else state.resolved.add(id);
      return { id: r[1], status };
    }
  }

  return undefined;
}
