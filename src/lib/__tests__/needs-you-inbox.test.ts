/**
 * §151: "Needs you" becomes an inbox. The actions an item offers (only what the person's own
 * page would), the person's own snooze and dismiss (kept on the server), and the inbox view.
 */

import { describe, expect, it } from "vitest";
import {
  applyHolds,
  careItems,
  commitmentItems,
  countInbox,
  docItems,
  filterInbox,
  foremanItems,
  holdChoices,
  holdFor,
  isValidSnoozeUntil,
  monitorItems,
  requestItems,
  resolveChoice,
  snoozePresets,
  sourceOfKey,
  staleHoldIds,
  type NeedsYouCaps,
  type NeedsYouItem,
  type StoredHold,
} from "@/lib/needs-you";

const NOW = new Date("2026-11-20T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function item(over: Partial<NeedsYouItem>): NeedsYouItem {
  return {
    id: "x",
    source: "docs",
    severity: "info",
    title: "t",
    detail: "",
    why: "because",
    clientName: null,
    href: "/app",
    action: "Open",
    since: null,
    fingerprint: "1",
    actions: [],
    hold: null,
    ...over,
  };
}

const ADMIN_ALL: NeedsYouCaps = { openableClientIds: null, admin: true };
const STAFF_WEDGE: NeedsYouCaps = { openableClientIds: ["c-wedge"], admin: false };
const STAFF_NONE: NeedsYouCaps = { openableClientIds: [], admin: false };

describe("monitor actions", () => {
  const m = {
    clientId: "c-wedge",
    clientName: "Wedge",
    clientSlug: "wedge",
    monitorId: "m1",
    name: "API",
    state: "down" as const,
    production: true,
    downSince: hoursAgo(1),
    error: null,
  };

  it("offers Acknowledge and Post update on an open incident to someone who can open the client", () => {
    const [i] = monitorItems([{ ...m, incident: { id: "inc1", acknowledged: false } }], NOW, STAFF_WEDGE);
    expect(i.actions.map((a) => a.kind)).toEqual(["acknowledge", "post-update"]);
    expect(i.actions[0]).toMatchObject({ clientSlug: "wedge", incidentId: "inc1" });
  });

  it("drops Acknowledge once acknowledged, and changes the fingerprint", () => {
    const [before] = monitorItems([{ ...m, incident: { id: "inc1", acknowledged: false } }], NOW, STAFF_WEDGE);
    const [after] = monitorItems([{ ...m, incident: { id: "inc1", acknowledged: true } }], NOW, STAFF_WEDGE);
    expect(after.actions.map((a) => a.kind)).toEqual(["post-update"]);
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it("offers nothing on a client the person can't open, or with no incident", () => {
    expect(monitorItems([{ ...m, incident: { id: "inc1", acknowledged: false } }], NOW, STAFF_NONE)[0].actions).toEqual([]);
    expect(monitorItems([{ ...m, incident: null }], NOW, ADMIN_ALL)[0].actions).toEqual([]);
    expect(monitorItems([{ ...m, incident: { id: "inc1", acknowledged: false } }], NOW)[0].actions).toEqual([]);
  });
});

describe("foreman actions", () => {
  const f = { key: "OVERDUE:a", severity: "warn" as const, category: "project" as const, subjectLabel: "A", headline: "h", evidence: ["e"], metric: 3 };
  it("gives admins Foreman's own Dismiss and Mute, and nobody else", () => {
    expect(foremanItems([f], ADMIN_ALL)[0].actions.map((a) => a.kind)).toEqual(["foreman-dismiss", "foreman-mute"]);
    expect(foremanItems([f], STAFF_WEDGE)[0].actions).toEqual([]);
  });
});

describe("commitmentItems", () => {
  it("is the person's own suggestion, with Accept and Dismiss, and says where it was read", () => {
    const [i] = commitmentItems(
      [{ id: "c1", title: "Send the deck", quote: "I'll send the deck", counterpart: "Priya", sourceLabel: "Your sent email", createdAt: hoursAgo(5) }],
      NOW,
    );
    expect(i.id).toBe("commitments:c1");
    expect(i.actions.map((a) => a.kind)).toEqual(["accept-commitment", "dismiss-commitment"]);
    expect(i.why).toBe("Suggested from your sent email 5h ago, not on your list yet");
    expect(i.detail).toContain("Priya");
  });
});

describe("requestItems", () => {
  const r = {
    requestId: "r1",
    clientId: "c-wedge",
    clientName: "Wedge",
    clientSlug: "wedge",
    title: "Tee time wrong",
    type: "BUG",
    requestedBy: "Luke",
    createdAt: hoursAgo(3),
  };

  it("is one item per request: information on the day, a warning after two days", () => {
    const out = requestItems([r, { ...r, requestId: "r2", createdAt: hoursAgo(72) }], NOW, ADMIN_ALL);
    expect(out.map((i) => [i.id, i.severity])).toEqual([
      ["requests:r1", "info"],
      ["requests:r2", "warn"],
    ]);
    expect(out[0].detail).toBe("Bug · from Luke · 3h ago");
    expect(out[0].href).toBe("/app/portal/wedge/wiki#intake");
  });

  it("offers Create task to admins only, and nothing on a client the person can't open", () => {
    expect(requestItems([r], NOW, ADMIN_ALL)[0].actions.map((a) => a.kind)).toEqual(["create-task", "mark-dealt-with"]);
    expect(requestItems([r], NOW, STAFF_WEDGE)[0].actions.map((a) => a.kind)).toEqual(["mark-dealt-with"]);
    expect(requestItems([r], NOW, STAFF_NONE)[0].actions).toEqual([]);
    expect(requestItems([{ ...r, clientId: "c-other" }], NOW, STAFF_WEDGE)[0].actions).toEqual([]);
  });
});

describe("every item says why it's here", () => {
  it("builds a why line for every source", () => {
    const items = [
      ...monitorItems([{ clientId: "c", clientName: "C", clientSlug: "c", monitorId: "m", name: "API", state: "stale", production: true, downSince: null, error: null }], NOW),
      ...foremanItems([{ key: "k", severity: "warn", category: "developer", subjectLabel: "Sam", headline: "h", evidence: [], metric: 1 }]),
      ...careItems([{ supportClientId: "s", clientName: "C", awaiting: 1, oldestAwaitingAt: hoursAgo(30) }], NOW),
      ...docItems([{ id: "d", title: "SOW", clientName: null, sharedAt: hoursAgo(24 * 9), firstViewedAt: null }], NOW),
    ];
    expect(items).toHaveLength(4);
    for (const i of items) expect(i.why.length).toBeGreaterThan(10);
  });
});

function hold(over: Partial<StoredHold>): StoredHold {
  return { id: "h", itemKey: "docs:1", fingerprint: "1", state: "snoozed", until: hoursAgo(-5), updatedAt: hoursAgo(1), ...over };
}

describe("holdFor", () => {
  const i = item({ id: "docs:1", severity: "warn", fingerprint: "1" });

  it("applies a snooze until its time, and not after", () => {
    expect(holdFor(i, hold({}), NOW)).toEqual({ state: "snoozed", until: hoursAgo(-5) });
    expect(holdFor(i, hold({ until: hoursAgo(1) }), NOW)).toBeNull();
  });

  it("applies a dismissal until the item changes", () => {
    expect(holdFor(i, hold({ state: "dismissed", until: null }), NOW)).toEqual({ state: "dismissed", until: null });
    expect(holdFor({ ...i, fingerprint: "2" }, hold({ state: "dismissed", until: null }), NOW)).toBeNull();
  });

  it("brings a snoozed item back early when it gets worse", () => {
    expect(holdFor({ ...i, fingerprint: "4" }, hold({}), NOW)).toBeNull();
  });

  it("never holds back an outage, whatever is stored", () => {
    expect(holdFor({ ...i, severity: "critical" }, hold({}), NOW)).toBeNull();
    expect(holdFor({ ...i, severity: "critical" }, hold({ state: "dismissed", until: null }), NOW)).toBeNull();
  });

  it("ignores a state it doesn't know", () => {
    expect(holdFor(i, hold({ state: "hidden" }), NOW)).toBeNull();
  });
});

describe("applyHolds", () => {
  it("uses the newest row for an item", () => {
    const i = item({ id: "docs:1", severity: "warn" });
    const [out] = applyHolds(
      [i],
      [hold({ id: "old", state: "dismissed", until: null, updatedAt: hoursAgo(5) }), hold({ id: "new", updatedAt: hoursAgo(1) })],
      NOW,
    );
    expect(out.hold?.state).toBe("snoozed");
  });
});

describe("staleHoldIds", () => {
  const live = item({ id: "docs:1", fingerprint: "1" });

  it("keeps a live hold, and deletes duplicates, expired snoozes and holds on changed items", () => {
    const rows = [
      hold({ id: "keep" }),
      hold({ id: "dup", updatedAt: hoursAgo(9) }),
      hold({ id: "expired", itemKey: "docs:2", until: hoursAgo(1) }),
      hold({ id: "changed", itemKey: "docs:3", fingerprint: "old", state: "dismissed", until: null }),
    ];
    const items = [live, item({ id: "docs:2" }), item({ id: "docs:3", fingerprint: "new" })];
    expect(staleHoldIds(rows, items, ["docs"], NOW).sort()).toEqual(["changed", "dup", "expired"]);
  });

  it("forgets an item gone from a source that was read, but keeps one whose source failed", () => {
    const rows = [hold({ id: "gone", itemKey: "docs:9" }), hold({ id: "unread", itemKey: "care:9" }), hold({ id: "junk", itemKey: "nonsense" })];
    expect(staleHoldIds(rows, [], ["docs"], NOW).sort()).toEqual(["gone", "junk"]);
  });
});

describe("snooze rules", () => {
  it("only accepts a future time within 30 days", () => {
    expect(isValidSnoozeUntil(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(true);
    expect(isValidSnoozeUntil(new Date(NOW.getTime() - 1), NOW)).toBe(false);
    expect(isValidSnoozeUntil(new Date(NOW.getTime() + 31 * 86_400_000), NOW)).toBe(false);
    expect(isValidSnoozeUntil(new Date("nonsense"), NOW)).toBe(false);
  });

  it("reads the source from an item key, and refuses anything else", () => {
    expect(sourceOfKey("requests:abc")).toBe("requests");
    expect(sourceOfKey("commitments:c1")).toBe("commitments");
    expect(sourceOfKey("nope:abc")).toBeNull();
    expect(sourceOfKey("requests:")).toBeNull();
    expect(sourceOfKey("requests")).toBeNull();
  });

  it("offers next week as the coming Monday, never today", () => {
    const monday = new Date(2026, 10, 23, 10, 0); // a Monday, local time
    const week = snoozePresets(monday).find((p) => p.id === "week")!.until;
    expect(week.getDay()).toBe(1);
    expect(week.getDate()).toBe(30);
    expect(week.getHours()).toBe(8);
  });

  it("offers no snooze or dismissal on an outage, and no second Dismiss where the source has one", () => {
    expect(holdChoices({ severity: "critical", source: "care" })).toEqual({ snooze: false, dismiss: false });
    expect(holdChoices({ severity: "warn", source: "foreman" })).toEqual({ snooze: true, dismiss: false });
    expect(holdChoices({ severity: "info", source: "docs" })).toEqual({ snooze: true, dismiss: true });
  });
});

describe("the inbox view", () => {
  const items = [
    item({ id: "docs:1", severity: "info" }),
    item({ id: "care:1", source: "care", severity: "warn", hold: { state: "snoozed", until: hoursAgo(-2) } }),
    item({ id: "pulse:1", source: "pulse", severity: "warn", hold: { state: "dismissed", until: null } }),
    item({ id: "requests:1", source: "requests", severity: "warn" }),
  ];

  it("splits open, snoozed and dismissed, and filters by source and severity", () => {
    expect(countInbox(items)).toEqual({ open: 2, snoozed: 1, dismissed: 1 });
    expect(filterInbox(items, { view: "open" }).map((i) => i.id)).toEqual(["docs:1", "requests:1"]);
    expect(filterInbox(items, { view: "open", severity: "warn" }).map((i) => i.id)).toEqual(["requests:1"]);
    expect(filterInbox(items, { view: "snoozed", source: "care" }).map((i) => i.id)).toEqual(["care:1"]);
    expect(filterInbox(items, { view: "dismissed", source: "care" })).toEqual([]);
  });

  it("deals with an item the source's own way when it can, else dismisses it for you", () => {
    const req = requestItems(
      [{ requestId: "r", clientId: "c-wedge", clientName: "W", clientSlug: "wedge", title: "t", type: "BUG", requestedBy: null, createdAt: hoursAgo(1) }],
      NOW,
      ADMIN_ALL,
    )[0];
    expect(resolveChoice(req)).toMatchObject({ kind: "mark-dealt-with" });
    expect(resolveChoice(item({ source: "docs", severity: "info" }))).toBe("dismiss");
    expect(resolveChoice(item({ source: "care", severity: "critical" }))).toBeNull();
    expect(resolveChoice(item({ source: "foreman", severity: "warn" }))).toBeNull();
  });
});
