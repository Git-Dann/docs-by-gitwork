/**
 * The daily Slack update's layout rules. Prompted by a developer (Waqar, Oct 2026):
 * completed subtasks must appear, in-progress work must appear at end of day, and a
 * multi-day task must still give a dev something to report.
 */
import { describe, expect, it } from "vitest";
import { buildDailyUpdatesCard, buildStandupCard } from "@/server/slack/blocks";
import {
  SUBTASK_PREFIX,
  groupForReport,
  reportOwnerIds,
  toRows,
  type ReportTask,
} from "../standup-report";

const parent: ReportTask = { taskId: "p1", title: "Checkout flow", status: "DOING" };
const subDone: ReportTask = { taskId: "s1", title: "Apple Pay button", status: "DONE", parentId: "p1", parentTitle: "Checkout flow" };
const subDoing: ReportTask = { taskId: "s2", title: "Receipt email", status: "DOING", parentId: "p1", parentTitle: "Checkout flow" };
const multiDay: ReportTask = { taskId: "t2", title: "Migrate auth to OAuth", status: "DOING" };
const review: ReportTask = { taskId: "t3", title: "Onboarding copy", status: "IN_REVIEW" };

describe("who a task is reported for", () => {
  it("⚠️ an unassigned subtask belongs to whoever owns its parent", () => {
    expect(reportOwnerIds({ assignees: [], assigneeId: null, parent: { assignees: [{ id: "waqar" }] } })).toEqual(["waqar"]);
    expect(reportOwnerIds({ assignees: [], parent: { assigneeId: "waqar", assignees: [] } })).toEqual(["waqar"]);
  });
  it("a subtask's own assignee wins over the parent's", () => {
    expect(reportOwnerIds({ assignees: [{ id: "sam" }], parent: { assignees: [{ id: "waqar" }] } })).toEqual(["sam"]);
  });
  it("an unassigned top-level task belongs to nobody", () => {
    expect(reportOwnerIds({ assignees: [], assigneeId: null, parent: null })).toEqual([]);
  });
});

describe("grouping for the end of day", () => {
  const groups = groupForReport([parent, subDone, subDoing, multiDay, review], "PM");

  it("reports what shipped, what is still moving and what is in review — in that order", () => {
    expect(groups.map((g) => g.label)).toEqual(["Done today", "In progress", "In review"]);
  });

  it("⚠️ a dev with nothing finished still has their multi-day work to report", () => {
    const g = groupForReport([multiDay], "PM");
    expect(g).toHaveLength(1);
    expect(g[0].label).toBe("In progress");
  });

  it("a finished subtask is listed under its parent, and the parent stays in progress", () => {
    const done = groups.find((g) => g.key === "done")!;
    expect(done.rows).toEqual([
      { kind: "task", taskId: "p1", title: "Checkout flow" },
      { kind: "subtask", taskId: "s1", title: "Apple Pay button" },
    ]);
    const progress = groups.find((g) => g.key === "progress")!;
    expect(progress.rows.map((r) => `${r.kind}:${r.title}`)).toEqual([
      "task:Checkout flow",
      "subtask:Receipt email",
      "task:Migrate auth to OAuth",
    ]);
  });

  it("the morning update reports only what is moving", () => {
    expect(groupForReport([parent, subDone, review], "AM").map((g) => g.key)).toEqual(["progress", "review"]);
  });

  it("every task appears exactly once per group, and nothing else is invented", () => {
    const rows = toRows([parent, subDoing, multiDay]);
    expect(rows.filter((r) => r.kind === "subtask").map((r) => r.taskId)).toEqual(["s2"]);
    expect(rows.filter((r) => r.taskId === "p1")).toHaveLength(1);
  });
});

describe("as posted to Slack", () => {
  it("#updates: subtasks are indented with ↳ under their parent, with status labels", () => {
    const card = buildDailyUpdatesCard({
      phase: "PM",
      dateLabel: "2026-10-15",
      projects: [{ clientName: "Wedge", clientSlug: "wedge", devs: [{ name: "Waqar", tasks: [parent, subDone, subDoing, multiDay] }] }],
    });
    const text = JSON.stringify(card.blocks);
    const body = (card.blocks.find((b) => (b as { type: string }).type === "section" && JSON.stringify(b).includes("Waqar")) as { text: { text: string } }).text.text;
    expect(body).toContain("_Done today_");
    expect(body).toContain("_In progress_");
    expect(body).toContain(`• Checkout flow\n${SUBTASK_PREFIX}Apple Pay button`);
    expect(body).toContain(`${SUBTASK_PREFIX}Receipt email`);
    expect(text).not.toContain("_No tasks._");
  });

  it("per-developer card: a done subtask does not remove its in-progress parent", () => {
    const card = buildStandupCard({
      phase: "PM",
      who: "Waqar",
      workdayLabel: "Thu 2026-10-15",
      tasks: [],
      sections: [
        { label: "Done today", tasks: [{ taskId: "s1", title: "Apple Pay button", parentId: "p1", parentTitle: "Checkout flow", clientSlug: "wedge", status: "DONE" }] },
        { label: "Still in progress", tasks: [{ taskId: "p1", title: "Checkout flow", clientSlug: "wedge", status: "DOING" }] },
      ],
    });
    const sections = card.blocks
      .filter((b) => (b as { type: string }).type === "section")
      .map((b) => (b as { text: { text: string } }).text.text);
    const done = sections.find((t) => t.startsWith("*Done today*"))!;
    const progress = sections.find((t) => t.startsWith("*Still in progress*"))!;
    expect(done).toContain(`• Checkout flow\n${SUBTASK_PREFIX}Apple Pay button`);
    expect(progress).toContain("• Checkout flow");
  });

  it("the indent survives Slack: it is non-breaking spaces, which Slack does not collapse", () => {
    expect(SUBTASK_PREFIX).toMatch(/^ {2,}↳ $/);
  });
});
