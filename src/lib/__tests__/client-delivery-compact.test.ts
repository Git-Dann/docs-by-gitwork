/**
 * The Portal Timeline card, made readable (§159): long overdue tasks are counted, not listed;
 * a week opens to its events, then its finished work grouped by release or category.
 */
import { describe, expect, it } from "vitest";
import { LONG_OVERDUE_DAYS, doneByGroup, splitLongOverdue, weekHighlights, type DeliveryItem, type DeliveryWeek } from "@/lib/client-delivery-timeline";
import { PORTAL_SECTIONS } from "@/lib/client-portal-layout";

const NOW = new Date("2026-11-25T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("splitLongOverdue", () => {
  it("counts tasks more than 30 days late instead of listing them", () => {
    const tasks = [
      { id: "a", dueDate: daysAgo(244) },
      { id: "b", dueDate: daysAgo(LONG_OVERDUE_DAYS) },
      { id: "c", dueDate: daysAgo(3) },
      { id: "d", dueDate: null },
    ];
    const { current, longOverdue } = splitLongOverdue(tasks, NOW);
    expect(longOverdue.map((t) => t.id)).toEqual(["a"]);
    expect(current.map((t) => t.id)).toEqual(["b", "c", "d"]);
  });
});

const item = (over: Partial<DeliveryItem>): DeliveryItem => ({
  id: Math.random().toString(36),
  kind: "done",
  at: "2026-11-25T10:00:00Z",
  title: "t",
  detail: null,
  href: null,
  people: [],
  group: null,
  ...over,
});

describe("a week, opened", () => {
  const week: DeliveryWeek = {
    start: "2026-11-23",
    label: "This week",
    counts: {},
    items: [
      item({ group: "Free Feature Timeline" }),
      item({ group: "Free Feature Timeline" }),
      item({ group: "QA" }),
      item({ group: null }),
      item({ kind: "incident", title: "Database went down" }),
      item({ kind: "meeting", title: "Weekly call" }),
      item({ kind: "started" }),
    ],
  };

  it("leads with the events, not the finished tasks", () => {
    expect(weekHighlights(week).map((i) => i.kind)).toEqual(["incident", "meeting"]);
  });

  it("groups the finished work by release or category, biggest first, ungrouped last", () => {
    expect(doneByGroup(week).map((g) => [g.group, g.items.length])).toEqual([
      ["Free Feature Timeline", 2],
      ["QA", 1],
      [null, 1],
    ]);
  });
});

describe("the client page", () => {
  it("has no Studies card (Dan, Nov 2026)", () => {
    expect((PORTAL_SECTIONS as readonly string[]).includes("studies")).toBe(false);
  });
});
