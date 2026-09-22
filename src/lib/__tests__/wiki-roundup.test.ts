/**
 * RoundUp's derivation. Fixtures mirror GAIA Bloom's real task shape, measured through
 * the Foundry MCP on 2026-09-22: DOING carries `startedAt` only, DONE carries both
 * stamps, BACKLOG/TODO carry neither. Inventing a tidier shape is how a passing suite
 * ends up describing a page that is wrong on real data (§42.8).
 */
import { describe, expect, it } from "vitest";
import { summariseRoundup, type RoundupBlock, type RoundupTask } from "@/lib/wiki-roundup";

const NOW = new Date("2026-09-22T12:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function task(partial: Partial<RoundupTask> & Pick<RoundupTask, "title">): RoundupTask {
  return { done: false, completedAt: null, startedAt: null, ...partial };
}
const doneTask = (title: string, daysAgo: number) =>
  task({ title, done: true, completedAt: ago(daysAgo), startedAt: ago(daysAgo + 2) });
const doingTask = (title: string) => task({ title, startedAt: ago(1) });
const plannedTask = (title: string) => task({ title });

function block(name: string, tasks: RoundupTask[], id = name): RoundupBlock {
  return { id, name, tasks };
}

describe("the weekly window", () => {
  const blocks = [
    block("Enforcement layer", [
      doneTask("Final testing of the multi-tenants module", 5),
      doneTask("Craft implementation plan for timezones", 5),
      doneTask("Addressing code review cycles", 6),
      doneTask("An older one", 9),
      doneTask("Older still", 13),
    ]),
  ];
  const s = summariseRoundup(blocks, NOW);

  it("counts only what completed inside the window", () => {
    expect(s.delivered).toHaveLength(3);
    expect(s.window.days).toBe(7);
  });

  it("counts the week before separately, so the page can say more or less", () => {
    expect(s.deliveredPrevious).toBe(2);
  });

  it("orders delivered work newest first", () => {
    expect(s.delivered.map((d) => d.at)).toEqual([...s.delivered.map((d) => d.at)].sort().reverse());
  });

  it("names the block each item belongs to", () => {
    expect(s.delivered[0].block).toBe("Enforcement layer");
  });
});

describe("done is the authority for WHETHER; the stamp only says WHEN", () => {
  it("a completed task with no stamp is still delivered, never planned", () => {
    // ⚠️ The dangerous failure. Falling through to `planned` would tell a client that
    // finished work has not been started.
    const s = summariseRoundup([block("B", [task({ title: "shipped, unstamped", done: true })])], NOW);
    expect(s.totals.delivered).toBe(1);
    expect(s.totals.planned).toBe(0);
    expect(s.deliveredUndated).toBe(1);
  });

  it("says so when EVERYTHING is complete but nothing is dated", () => {
    // "0 delivered this week" would be a lie of omission here.
    const s = summariseRoundup(
      [block("B", [task({ title: "a", done: true }), task({ title: "b", done: true })])],
      NOW,
    );
    expect(s.delivered).toHaveLength(0);
    expect(s.blindSpots.map((b) => b.kind)).toContain("NO_COMPLETION_STAMPS");
  });

  it("flags a partial gap without hiding the dated work", () => {
    const s = summariseRoundup(
      [block("B", [doneTask("dated", 2), task({ title: "undated", done: true })])],
      NOW,
    );
    expect(s.delivered).toHaveLength(1);
    expect(s.deliveredUndated).toBe(1);
    expect(s.blindSpots.map((b) => b.kind)).toContain("SOME_UNDATED");
  });

  it("treats an unparseable stamp as undated rather than dropping the task", () => {
    // Date.parse returns NaN, and every comparison against NaN is false — so without
    // the guard the task vanishes from both the window and the totals' weekly figures.
    const s = summariseRoundup(
      [block("B", [task({ title: "junk stamp", done: true, completedAt: "not-a-date" })])],
      NOW,
    );
    expect(s.totals.delivered).toBe(1);
    expect(s.deliveredUndated).toBe(1);
  });
});

describe("in flight and planned", () => {
  const s = summariseRoundup(
    [
      block("Frontend", [doingTask("Role-specific copy"), doingTask("Share resources")]),
      block("Backlog", [plannedTask("a"), plannedTask("b"), plannedTask("c")]),
    ],
    NOW,
  );

  it("started-and-not-finished is in flight", () => {
    expect(s.inFlight.map((i) => i.title)).toEqual(["Role-specific copy", "Share resources"]);
  });

  it("not started is planned", () => {
    expect(s.totals.planned).toBe(3);
  });

  it("caps up-next so the page does not become a backlog dump", () => {
    const many = block("B", Array.from({ length: 30 }, (_, i) => plannedTask(`t${i}`)));
    expect(summariseRoundup([many], NOW).upNext).toHaveLength(6);
    expect(summariseRoundup([many], NOW).totals.planned).toBe(30);
  });
});

describe("the Venn is over BLOCKS, because tasks cannot overlap", () => {
  it("puts a part-built block in a real overlap region", () => {
    const s = summariseRoundup(
      [block("Mixed", [doneTask("a", 2), doingTask("b"), plannedTask("c")])],
      NOW,
    );
    expect(s.venn.items).toHaveLength(1);
    expect(s.venn.items[0].region).toBe("ABC");
    expect(s.venn.items[0].note).toBe("1 delivered · 1 in flight · 1 planned");
  });

  it("orders region keys A→B→C, matching VENN_REGIONS_3", () => {
    // "BA" is not a region the renderer knows; it would silently draw nothing.
    const s = summariseRoundup([block("M", [plannedTask("c"), doneTask("a", 1)])], NOW);
    expect(s.venn.items[0].region).toBe("AC");
  });

  it("a fully delivered block sits in one circle, not an overlap", () => {
    const s = summariseRoundup([block("Done", [doneTask("a", 1), doneTask("b", 2)])], NOW);
    expect(s.venn.items[0].region).toBe("A");
  });

  it("a block with no tasks is in no region at all", () => {
    // Not region "A" with nothing in it — it has not been broken down, which is a
    // different fact from "nothing has been delivered".
    expect(summariseRoundup([block("Empty", [])], NOW).venn.items).toHaveLength(0);
  });

  it("always offers exactly the three named sets", () => {
    const s = summariseRoundup([], NOW);
    expect(s.venn.sets.map((x) => x.label)).toEqual(["Delivered", "In flight", "Planned"]);
  });
});

describe("blind spots", () => {
  it("says when there is no breakdown at all", () => {
    expect(summariseRoundup([], NOW).blindSpots.map((b) => b.kind)).toContain("NO_TASKS");
  });

  it("warns when nothing is marked started, which usually means stale data", () => {
    const s = summariseRoundup([block("B", [plannedTask("a"), plannedTask("b")])], NOW);
    expect(s.blindSpots.map((b) => b.kind)).toContain("NOTHING_IN_FLIGHT");
  });

  it("stays quiet on a healthy board", () => {
    const s = summariseRoundup(
      [block("B", [doneTask("a", 2), doingTask("b"), plannedTask("c")])],
      NOW,
    );
    expect(s.blindSpots).toEqual([]);
  });
});

describe("GAIA Bloom's real shape", () => {
  // 46 delivered (all stamped), 2 in flight, 5 planned — measured 2026-09-22.
  const gaia = [
    block(
      "My Tasks",
      [
        ...Array.from({ length: 10 }, (_, i) => doneTask(`recent ${i}`, 2 + (i % 5))),
        ...Array.from({ length: 18 }, (_, i) => doneTask(`prev ${i}`, 9 + (i % 5))),
        ...Array.from({ length: 18 }, (_, i) => doneTask(`older ${i}`, 16 + i)),
      ],
    ),
    block("Frontend", [doingTask("Role-specific copy"), doingTask("Share resources")]),
    block("Backlog", Array.from({ length: 5 }, (_, i) => plannedTask(`p${i}`))),
  ];
  const s = summariseRoundup(gaia, NOW);

  it("reports a real week's work with no blind spots", () => {
    expect(s.totals).toEqual({ delivered: 46, inFlight: 2, planned: 5 });
    expect(s.delivered).toHaveLength(10);
    expect(s.deliveredPrevious).toBe(18);
    expect(s.blindSpots).toEqual([]);
  });

  it("draws three non-overlapping blocks, which is what Gaia's data honestly is", () => {
    expect(s.venn.items.map((i) => i.region).sort()).toEqual(["A", "B", "C"]);
  });
});
