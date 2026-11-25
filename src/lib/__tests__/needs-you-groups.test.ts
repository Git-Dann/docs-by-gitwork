/**
 * HQ's Needs you card shows one line per source (§157): 27 Pulse projects are one line, not 27
 * rows burying the one customer-reply backlog that matters.
 */
import { describe, expect, it } from "vitest";
import { groupBySource, groupHeadline, groupNames, type NeedsYouItem } from "@/lib/needs-you";

function item(over: Partial<NeedsYouItem>): NeedsYouItem {
  return {
    id: Math.random().toString(36),
    source: "pulse",
    severity: "warn",
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

describe("groupBySource", () => {
  const pulse = Array.from({ length: 27 }, (_, i) => item({ title: `site-${i}.com needs a look` }));
  const care = item({ source: "care", severity: "critical", title: "334 customers waiting for a reply", clientName: "Fellas Loaded" });
  const docs = [item({ source: "docs", severity: "info" }), item({ source: "docs", severity: "warn" })];

  it("makes one group per source, the most serious first, then the biggest", () => {
    const groups = groupBySource([...pulse, ...docs, care]);
    expect(groups.map((g) => [g.source, g.items.length, g.severity])).toEqual([
      ["care", 1, "critical"],
      ["pulse", 27, "warn"],
      ["docs", 2, "warn"],
    ]);
  });

  it("puts an outage before anything else of the same severity", () => {
    const groups = groupBySource([care, item({ source: "monitors", severity: "critical" })]);
    expect(groups[0].source).toBe("monitors");
  });

  it("keeps each group's items most serious first", () => {
    expect(groupBySource(docs)[0].items.map((i) => i.severity)).toEqual(["warn", "info"]);
  });
});

describe("the group's line", () => {
  it("counts in words that fit the source", () => {
    expect(groupHeadline("pulse", 27)).toBe("27 projects need a look");
    expect(groupHeadline("pulse", 1)).toBe("1 project needs a look");
    expect(groupHeadline("care", 2)).toBe("2 clients with customers waiting");
  });

  it("names the first two and counts the rest", () => {
    const items = [item({ title: "adam-beasley.com needs a look" }), item({ title: "Afterdesk Testing needs a look" }), item({ title: "c.com needs a look" })];
    expect(groupNames(items)).toBe("adam-beasley.com, Afterdesk Testing +1");
    expect(groupNames(items.slice(0, 2))).toBe("adam-beasley.com, Afterdesk Testing");
    expect(groupNames([item({ source: "care", clientName: "Fellas Loaded", title: "334 waiting" })])).toBe("Fellas Loaded");
  });
});
