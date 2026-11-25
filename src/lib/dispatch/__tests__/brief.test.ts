import { describe, expect, it } from "vitest";
import { buildBrief, currentRelease, type BriefInput, type BriefTask } from "../brief";

const now = new Date("2026-11-25T12:00:00Z"); // a Wednesday
const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000).toISOString();

let seq = 0;
function task(over: Partial<BriefTask> = {}): BriefTask {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    status: "TODO",
    dueDate: null,
    startedAt: null,
    createdAt: day(-30),
    assignees: ["Nasir Javed"],
    mine: true,
    flagged: false,
    blocked: false,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    release: null,
    ...over,
  };
}

const base: BriefInput = { now, clientName: "Wedge", isAdmin: false, open: [], doneThisWeek: [], releases: [], focus: null };

describe("buildBrief: needs you", () => {
  it("lists only the person's own tasks, most urgent first, with the reason", () => {
    const b = buildBrief({
      ...base,
      open: [
        task({ title: "Due Friday", dueDate: day(2) }),
        task({ title: "Someone else's overdue", dueDate: day(-5), mine: false, assignees: ["Fahad"] }),
        task({ title: "Stuck", status: "DOING", startedAt: day(-8) }),
        task({ title: "Overdue", dueDate: day(-3) }),
        task({ title: "Backlog idea", status: "BACKLOG" }),
      ],
    });
    expect(b.needsYou.map((r) => r.title)).toEqual(["Overdue", "Stuck", "Due Friday"]);
    expect(b.needsYou[0]).toMatchObject({ reason: "Overdue 3 days", tone: "danger" });
    expect(b.needsYou[1].reason).toBe("In progress 8 days");
    expect(b.needsYou[2].reason).toBe("Due Fri 27 Nov");
  });

  it("caps the list at six", () => {
    const open = Array.from({ length: 10 }, () => task({ dueDate: day(1) }));
    expect(buildBrief({ ...base, open }).needsYou).toHaveLength(6);
  });
});

describe("buildBrief: who sees whose work", () => {
  const others = [
    task({ mine: false, assignees: ["Nasir Javed"] }),
    task({ mine: false, assignees: ["Nasir Javed", "Fahad"] }),
    task({ mine: false, assignees: [] }),
  ];

  it("a developer with nothing assigned is told only how much has nobody on it", () => {
    const b = buildBrief({ ...base, open: others });
    expect(b.nothingMine).toBe("Nothing on Wedge is assigned to you.");
    expect(b.team).toBeNull();
    expect(b.unassigned).toBe(1);
    expect(JSON.stringify(b)).not.toContain("Nasir");
  });

  it("an admin with nothing assigned sees whose the open work is", () => {
    const b = buildBrief({ ...base, isAdmin: true, open: others });
    expect(b.team).toEqual([
      { name: "Nasir Javed", count: 2 },
      { name: "Fahad", count: 1 },
    ]);
  });

  it("someone with work of their own gets no team split, admin or not", () => {
    expect(buildBrief({ ...base, isAdmin: true, open: [...others, task()] }).team).toBeNull();
  });
});

describe("buildBrief: suggestions come with a reason", () => {
  it("a stuck task, overdue work and a release due soon each suggest something", () => {
    const b = buildBrief({
      ...base,
      open: [task({ title: "Login screen", status: "DOING", startedAt: day(-6) }), task({ dueDate: day(-1) })],
      releases: [{ version: "v2.4", startDate: null, endDate: day(5), done: 8, total: 12 }],
    });
    expect(b.suggestions.map((s) => s.id)).toEqual(["unstick", "overdue", "release-notes"]);
    expect(b.suggestions[0]).toMatchObject({ title: "Get “Login screen” moving", reason: "In progress for 6 days" });
    expect(b.suggestions[2].reason).toBe("Ships Mon 30 Nov · 8 of 12 done");
  });

  it("with nothing to go on it still offers what's changed, never an empty list", () => {
    const b = buildBrief({ ...base, doneThisWeek: [task({ status: "DONE", createdAt: day(-2) })] });
    expect(b.suggestions).toEqual([expect.objectContaining({ id: "changed", reason: "1 done, 1 new in the last 7 days" })]);
  });

  it("nothing assigned: a developer is offered something to pick up, an admin who should take it", () => {
    const open = [task({ mine: false, assignees: [] })];
    expect(buildBrief({ ...base, open }).suggestions[0].id).toBe("pick-up");
    expect(buildBrief({ ...base, isAdmin: true, open }).suggestions[0].id).toBe("assign");
  });

  it("never more than three", () => {
    const b = buildBrief({
      ...base,
      open: [task({ status: "DOING", startedAt: day(-9) }), task({ dueDate: day(-2) })],
      releases: [{ version: "v3", startDate: null, endDate: day(3), done: 1, total: 4 }],
    });
    expect(b.suggestions.length).toBeLessThanOrEqual(3);
  });
});

describe("buildBrief: opened from a task", () => {
  it("describes the task and suggests what fits where it's up to", () => {
    const focus = task({ title: "Checkout", status: "TODO", dueDate: day(-2), release: "v2.4" });
    const b = buildBrief({ ...base, open: [focus], focus });
    expect(b.focus).toMatchObject({ title: "Checkout", tone: "danger" });
    expect(b.focus!.facts).toEqual(["To do", "Nasir Javed", "Overdue 2 days", "In v2.4"]);
    expect(b.suggestions.map((s) => s.id).slice(0, 2)).toEqual(["subtasks", "impact"]);
  });

  it("a task in review suggests the PR description and tests", () => {
    const focus = task({ status: "IN_REVIEW", startedAt: day(-1) });
    expect(buildBrief({ ...base, open: [focus], focus }).suggestions.map((s) => s.id)).toEqual(["pr", "tests", "standup"]);
  });
});

describe("stats", () => {
  it("counts the person's open, this week and what needs a look, plus the next release", () => {
    const b = buildBrief({
      ...base,
      open: [task({ status: "DOING", startedAt: day(-1) }), task({ dueDate: day(10) }), task({ dueDate: day(-1) }), task({ mine: false })],
      releases: [{ version: "v2.4", startDate: null, endDate: day(2), done: 3, total: 5 }],
    });
    expect(b.stats.map((s) => [s.key, s.value, s.label])).toEqual([
      ["open", "3", "yours open"],
      ["week", "2", "this week"],
      ["attention", "1", "need a look"],
      ["release", "v2.4", "ships in 2 days"],
    ]);
  });
});

describe("currentRelease", () => {
  it("is the soonest release that hasn't ended and isn't finished", () => {
    const r = currentRelease(
      [
        { version: "old", startDate: null, endDate: day(-3), done: 1, total: 5 },
        { version: "later", startDate: null, endDate: day(20), done: 0, total: 3 },
        { version: "finished", startDate: null, endDate: day(4), done: 3, total: 3 },
        { version: "next", startDate: null, endDate: day(6), done: 1, total: 3 },
      ],
      now,
    );
    expect(r?.version).toBe("next");
  });
});
