/**
 * The wiki's daily-updates card: what it will and will not claim a dev said.
 *
 * The rules here exist because this card is on a page the CLIENT reads. Getting
 * them wrong does not render badly — it misreports a person's work to their
 * customer, which is why each one is asserted rather than assumed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  columnTasks,
  deliveredDelta,
  formatPushTime,
  hasPushed,
  phaseLabel,
  standupGroups,
  taskLine,
  visibleStandups,
  type DevStandup,
} from "@/lib/wiki-standups";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const T = (id: string, title: string, parentTitle: string | null = null) => ({ id, title, parentTitle });

function dev(over: Partial<DevStandup> = {}): DevStandup {
  return {
    userId: "u1",
    name: "Priya Shah",
    amPushedAt: null,
    pmPushedAt: null,
    inProgress: [],
    inReview: [],
    doneToday: [],
    ...over,
  };
}

describe("a standup is reported only when it was pushed", () => {
  /**
   * ⚠️ The task board is always readable. Deriving "what Priya is doing" from it
   * and showing it as her standup would put words in her mouth on a page her
   * client reads, and would show an update on a day she never sent one.
   */
  it("hides a dev who pushed neither phase", () => {
    const day = { workDate: "2026-10-12T00:00:00.000Z", devs: [dev({ inProgress: [T("1", "x")] })] };
    expect(visibleStandups(day)).toEqual([]);
  });

  it("shows a dev who pushed, even with nothing to report", () => {
    // They said "nothing on this project today". Omitting them would make the
    // card disagree with who actually updated.
    const day = {
      workDate: "2026-10-12T00:00:00.000Z",
      devs: [dev({ amPushedAt: "2026-10-12T09:00:00.000Z" })],
    };
    expect(visibleStandups(day)).toHaveLength(1);
    expect(standupGroups(day.devs[0])).toEqual([]);
  });

  it("treats either phase as having pushed", () => {
    expect(hasPushed({ amPushedAt: "x", pmPushedAt: null })).toBe(true);
    expect(hasPushed({ amPushedAt: null, pmPushedAt: "x" })).toBe(true);
    expect(hasPushed({ amPushedAt: null, pmPushedAt: null })).toBe(false);
  });

  it("copes with no standups at all", () => {
    expect(visibleStandups(null)).toEqual([]);
    expect(visibleStandups({ workDate: "2026-10-12T00:00:00.000Z", devs: [] })).toEqual([]);
  });
});

describe("the phase label never overstates the day", () => {
  it("is AM until the PM push happens", () => {
    // ⚠️ Relabelling a morning update as end-of-day would tell a client work was
    // finished when it was only started.
    expect(phaseLabel({ amPushedAt: "9am", pmPushedAt: null })).toBe("AM");
    expect(phaseLabel({ amPushedAt: "9am", pmPushedAt: "5pm" })).toBe("PM");
    expect(phaseLabel({ amPushedAt: null, pmPushedAt: null })).toBeNull();
  });
});

describe("the groups match what the Slack standup reports", () => {
  const full = dev({
    amPushedAt: "2026-10-12T09:00:00.000Z",
    inProgress: [T("1", "Autocomplete")],
    inReview: [T("2", "Filters")],
    doneToday: [T("3", "Index rebuild")],
  });

  it("AM leads with in progress and never mentions done", () => {
    expect(standupGroups(full).map((g) => g.label)).toEqual(["In progress", "In review"]);
  });

  it("PM leads with done today and still reports work in flight", () => {
    const pm = { ...full, pmPushedAt: "2026-10-12T17:00:00.000Z" };
    expect(standupGroups(pm).map((g) => g.label)).toEqual([
      "Done today",
      "In review",
      "Still in progress",
    ]);
  });

  it("never shows an empty heading", () => {
    const pm = dev({ pmPushedAt: "5pm", doneToday: [T("1", "Shipped")] });
    expect(standupGroups(pm).map((g) => g.label)).toEqual(["Done today"]);
  });

  it("keeps In review out of Done — unreviewed work is not finished", () => {
    const pm = dev({ pmPushedAt: "5pm", inReview: [T("1", "Awaiting sign-off")] });
    const done = standupGroups(pm).find((g) => g.label === "Done today");
    expect(done).toBeUndefined();
  });
});

describe("presentation", () => {
  it("orders by who updated most recently", () => {
    const day = {
      workDate: "2026-10-12T00:00:00.000Z",
      devs: [
        dev({ userId: "a", name: "Early", amPushedAt: "2026-10-12T09:00:00.000Z" }),
        dev({ userId: "b", name: "Late", pmPushedAt: "2026-10-12T17:00:00.000Z" }),
      ],
    };
    expect(visibleStandups(day).map((d) => d.name)).toEqual(["Late", "Early"]);
  });

  it("falls back to a name sort when the stamps cannot be read", () => {
    const day = {
      workDate: "2026-10-12T00:00:00.000Z",
      devs: [
        dev({ userId: "b", name: "Zed", amPushedAt: "nonsense" }),
        dev({ userId: "a", name: "Ada", amPushedAt: "nonsense" }),
      ],
    };
    expect(visibleStandups(day).map((d) => d.name)).toEqual(["Ada", "Zed"]);
  });

  it("gives a subtask its parent for context", () => {
    expect(taskLine(T("1", "Autocomplete", "Search"))).toBe("Search → Autocomplete");
    expect(taskLine(T("1", "Autocomplete"))).toBe("Autocomplete");
  });

  it("returns null rather than a bogus time", () => {
    expect(formatPushTime(null)).toBeNull();
    expect(formatPushTime("not-a-date")).toBeNull();
    expect(formatPushTime("2026-10-12T09:05:00.000Z")).toMatch(/\d/);
  });
});

describe("the loader reads the event, not just the board", () => {
  const LOADER = code(read("src/server/wiki-standups.ts"));
  const CARD = code(read("src/components/clients/wiki/wiki-standups-card.tsx"));

  it("selects on a pushed stamp", () => {
    expect(LOADER).toMatch(/amPushedAt \|\| u\.pmPushedAt/);
  });

  it("scopes every task read to this client", () => {
    // ⚠️ One client's wiki must never show another's work. The task query is
    // keyed on clientId, not just on the dev.
    const q = LOADER.slice(LOADER.indexOf("prisma.task.findMany"));
    expect(q.slice(0, 400)).toContain("clientId,");
  });

  it("honours the legacy single assignee as well as the join", () => {
    // §13.7 keeps `assigneeId` as a fallback; reading only the join drops every
    // task assigned before multi-assignee shipped.
    expect(LOADER).toContain("assigneeId === u.userId");
    expect(LOADER).toMatch(/assignees:\s*\{\s*some/);
  });

  it("counts done only when it was completed on this work day", () => {
    expect(LOADER).toMatch(/completedAt >= workDate/);
    expect(LOADER).toMatch(/completedAt < dayEnd/);
  });

  it("says nobody has pushed YET, rather than that there is no activity", () => {
    expect(CARD).toMatch(/No updates pushed yet today/);
    expect(code(CARD)).not.toMatch(/No activity/i);
  });
});

describe("the horizontal card", () => {
  it("reports overflow instead of silently cutting a column", () => {
    // ⚠️ "3 shown of 7" and "3" are different claims about how much work there was.
    const { shown, hidden } = columnTasks([1, 2, 3, 4, 5, 6, 7], 3);
    expect(shown).toEqual([1, 2, 3]);
    expect(hidden).toBe(4);
    expect(columnTasks([1], 3).hidden).toBe(0);
  });

  it("never claims an improvement in a first week", () => {
    expect(deliveredDelta(12, 0, false)).toBeNull();
    expect(deliveredDelta(5, 2, true)).toBe("+3 vs last week");
    expect(deliveredDelta(2, 5, true)).toBe("-3 vs last week");
    expect(deliveredDelta(4, 4, true)).toBe("same as last week");
  });

  const CARD = code(read("src/components/clients/wiki/wiki-standups-card.tsx"));
  const DASH = code(read("src/components/clients/wiki/wiki-dashboard.tsx"));

  it("lays devs out as columns that collapse on a phone", () => {
    expect(CARD).toMatch(/repeat\(auto-fit, minmax\(220px, 1fr\)\)/);
  });

  it("reads the same week figures as the RoundUp tile", () => {
    // Two cards on one page must not report two different weeks.
    expect(CARD).toContain("roundup.delivered.length");
    expect(CARD).toContain("roundup.totals.inFlight");
    expect(DASH).toMatch(/summariseRoundup\(wiki\.timeline\.blocks, new Date\(\), \{ unassigned: wiki\.timeline\.unassigned \}\)/);
  });

  it("omits the week strip when there is no plan, rather than zeroing it", () => {
    expect(DASH).toMatch(/const weekRoundup = hasPlan\s*\?/);
    expect(CARD).toMatch(/\{roundup && \(/);
  });

  it("says when finished work has no date, rather than hiding it", () => {
    expect(CARD).toContain("roundup.deliveredUndated > 0");
  });
});
