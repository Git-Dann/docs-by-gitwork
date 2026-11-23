import { describe, expect, it } from "vitest";
import {
  allClearLine,
  careItems,
  docItems,
  foremanItems,
  monitorItems,
  rankItems,
  type NeedsYouItem,
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
    clientName: null,
    href: "/app",
    action: "Open",
    since: null,
    fingerprint: "1",
    why: "because",
    actions: [],
    hold: null,
    ...over,
  };
}

describe("monitorItems", () => {
  const base = { clientId: "c-wedge", clientName: "Wedge", clientSlug: "wedge", monitorId: "m1", name: "API", production: true, downSince: hoursAgo(1), error: "503" };

  it("makes production down critical and leaves up/slow/pending out", () => {
    const out = monitorItems(
      [
        { ...base, state: "down" },
        { ...base, monitorId: "m2", state: "up" },
        { ...base, monitorId: "m3", state: "slow" },
        { ...base, monitorId: "m4", state: "pending" },
      ],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("critical");
    expect(out[0].detail).toContain("503");
  });

  it("never makes non-production down critical", () => {
    const [i] = monitorItems([{ ...base, state: "down", production: false }], NOW);
    expect(i.severity).toBe("warn");
    expect(i.detail).toContain("Not production");
  });

  it("says a stale monitor can't be trusted rather than repeating its last result", () => {
    const [i] = monitorItems([{ ...base, state: "stale" }], NOW);
    expect(i.title).toMatch(/isn't being checked/);
  });
});

describe("careItems", () => {
  it("waits 24h before an item, and turns red at 72h", () => {
    const rows = [
      { supportClientId: "a", clientName: "A", awaiting: 2, oldestAwaitingAt: hoursAgo(5) },
      { supportClientId: "b", clientName: "B", awaiting: 1, oldestAwaitingAt: hoursAgo(30) },
      { supportClientId: "c", clientName: "C", awaiting: 4, oldestAwaitingAt: hoursAgo(80) },
    ];
    const out = careItems(rows, NOW);
    expect(out.map((i) => [i.clientName, i.severity])).toEqual([
      ["B", "warn"],
      ["C", "critical"],
    ]);
    expect(out[0].href).toBe("/app/care?client=b");
  });
});

describe("docItems", () => {
  it("nudges a document read with no decision, or never opened, after five days only", () => {
    const out = docItems(
      [
        { id: "1", title: "SOW", clientName: null, sharedAt: hoursAgo(24 * 10), firstViewedAt: hoursAgo(24 * 6) },
        { id: "2", title: "Proposal", clientName: null, sharedAt: hoursAgo(24 * 6), firstViewedAt: null },
        { id: "3", title: "Fresh", clientName: null, sharedAt: hoursAgo(24 * 2), firstViewedAt: null },
      ],
      NOW,
    );
    expect(out.map((i) => i.title)).toEqual(["SOW: read, no decision", "Proposal: never opened"]);
  });
});

describe("foremanItems", () => {
  it("leaves blind spots and information out", () => {
    const f = { key: "k", subjectLabel: "Wedge", headline: "h", evidence: ["e"], metric: 3 };
    const out = foremanItems([
      { ...f, key: "a", severity: "warn", category: "project" },
      { ...f, key: "b", severity: "warn", category: "blindspot" },
      { ...f, key: "c", severity: "info", category: "project" },
    ]);
    expect(out.map((i) => i.id)).toEqual(["foreman:a"]);
  });
});

describe("rankItems", () => {
  it("puts critical first, outages ahead of other critical items, then the longest-standing", () => {
    const out = rankItems([
      item({ id: "info", severity: "info" }),
      item({ id: "care-crit", source: "care", severity: "critical", since: hoursAgo(100) }),
      item({ id: "mon-crit", source: "monitors", severity: "critical", since: hoursAgo(1) }),
      item({ id: "warn-new", severity: "warn", since: hoursAgo(1) }),
      item({ id: "warn-old", severity: "warn", since: hoursAgo(50) }),
    ]);
    expect(out.map((i) => i.id)).toEqual(["mon-crit", "care-crit", "warn-old", "warn-new", "info"]);
  });
});

describe("allClearLine", () => {
  it("names what was checked, so all clear is never claimed for an unread source", () => {
    expect(allClearLine(["monitors", "care", "requests"])).toBe("Nothing needs you. Checked Monitors, Care and Requests.");
  });
});
