/**
 * A category named QA is treated exactly like any other category.
 *
 * QA was briefly special-cased into a 5px violet strip with its own slim row.
 * Dan's call (Aug 2026) was that it should look and behave like Mobile, Frontend
 * or Backend — same bar, same chevron, same expandable task list — in the
 * internal Gantt and in the client wiki alike.
 *
 * This locks that in, because the special case is an easy thing to re-add and
 * the cost is quiet: QA stops being clickable, its tasks become unreachable, and
 * the client sees a phase of real work rendered as a hairline.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { GanttChart, type GanttBlock } from "../gantt-chart";
import type { TaskStatus } from "@/types/tasks";

const counts = (o: Partial<Record<TaskStatus, number>>): Record<TaskStatus, number> => ({
  BACKLOG: 0, TODO: 0, DOING: 0, IN_REVIEW: 0, UI_DONE: 0, DONE: 0, ...o,
});
const mk = (id: string, name: string, progress: number, n: number): GanttBlock => ({
  id, name, startDate: "2026-04-01", endDate: "2026-08-12", progress,
  tasks: Array.from({ length: n }, (_, i) => ({ title: `${name} task ${i}`, done: false })),
  statusCounts: counts({ DONE: Math.round((progress / 100) * n) }),
});

const DELIVERY = [mk("m", "Mobile", 88, 90), mk("f", "Frontend", 88, 17), mk("b", "Backend", 90, 52)];
const QA = mk("q", "QA", 0, 1);

const render = (blocks: GanttBlock[]) =>
  renderToStaticMarkup(
    React.createElement(GanttChart, { blocks, milestones: [], initialScale: "quarter" }),
  );

/** A full-height delivery bar. */
const BAR = /group absolute top-2 h-7/g;
/** The row-level expand chevron. */
const CHEVRON = /aria-label="(Expand|Collapse) section"/g;

describe("QA renders as a normal category", () => {
  it("gets a full-height bar like every other category", () => {
    const html = render([...DELIVERY, QA]);
    expect((html.match(BAR) ?? []).length).toBe(4);
  });

  it("gets its own chevron, so its tasks can be opened", () => {
    const html = render([...DELIVERY, QA]);
    expect((html.match(CHEVRON) ?? []).length).toBe(4);
  });

  it("shows the same name + progress readout as the others", () => {
    /**
     * Task TITLES are deliberately not asserted here: rows start collapsed, so
     * they only enter the markup once the chevron is clicked. The first version
     * of this test expected them in the static render and failed — the component
     * was right and the expectation was wrong. The chevron test above is what
     * covers reachability.
     */
    const html = render([...DELIVERY, QA]);
    expect(html).toContain("QA");
    expect(html).toContain("0% · 1 task");
    // Singular, like any other one-task category — not "1 tasks".
    expect(html).not.toContain("1 tasks");
  });

  it("carries no slim-strip special case", () => {
    const html = render([...DELIVERY, QA]);
    expect(html).not.toContain("bg-violet-200");
    expect(html).not.toContain("bg-violet-600");
  });

  it("is indistinguishable from a differently-named category", () => {
    // The strongest form: renaming QA changes only the label, not the structure.
    const asQa = render([...DELIVERY, QA]);
    const renamed = render([...DELIVERY, { ...QA, name: "Regression" }]);
    expect(asQa.replaceAll("QA", "Regression")).toBe(renamed);
  });
});
