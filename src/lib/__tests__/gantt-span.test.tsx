/**
 * Where a feature block sits on a Gantt. Prompted by YG Intelligence's linked timeline:
 * five phases, no dates on any of them, tasks due across Oct–Dec — and not one bar.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { blockSpan } from "../gantt-span";
import { GanttChart, type GanttBlock } from "@/components/tasks/gantt-chart";

describe("a block's span", () => {
  it("uses the block's own dates when it has both, and does not call them estimated", () => {
    expect(blockSpan({ startDate: "2026-08-01", endDate: "2026-08-21" }, ["2026-12-01"])).toEqual({
      startDate: "2026-08-01T00:00:00.000Z",
      endDate: "2026-08-21T00:00:00.000Z",
      estimated: false,
    });
  });

  it("⚠️ an undated block with dated tasks spans first → last task due date, ESTIMATED", () => {
    // YG Intelligence's "Ai" phase: no dates of its own, tasks due 5 Oct – 18 Dec.
    const span = blockSpan(
      { startDate: null, endDate: null },
      [new Date("2026-12-18"), null, new Date("2026-10-05"), new Date("2026-11-02")],
    );
    expect(span).toEqual({
      startDate: "2026-10-05T00:00:00.000Z",
      endDate: "2026-12-18T00:00:00.000Z",
      estimated: true,
    });
  });

  it("no dates anywhere → no span, never an invented one", () => {
    expect(blockSpan({ startDate: null, endDate: null }, [null, undefined])).toBeNull();
  });

  it("a half-dated block keeps the date it has and estimates the other", () => {
    expect(blockSpan({ startDate: "2026-10-01", endDate: null }, ["2026-11-30"])).toMatchObject({
      startDate: "2026-10-01T00:00:00.000Z",
      endDate: "2026-11-30T00:00:00.000Z",
      estimated: true,
    });
  });

  it("never produces a bar that ends before it starts", () => {
    const span = blockSpan({ startDate: "2026-12-01", endDate: null }, ["2026-10-01"])!;
    expect(span.startDate <= span.endDate).toBe(true);
  });
});

describe("the chart draws an estimate as an estimate", () => {
  const counts = { BACKLOG: 2, TODO: 0, DOING: 1, IN_REVIEW: 0, UI_DONE: 0, DONE: 1 };
  const block = (o: Partial<GanttBlock>): GanttBlock => ({
    id: "b1",
    name: "Ai",
    startDate: "2026-10-05T00:00:00.000Z",
    endDate: "2026-12-18T00:00:00.000Z",
    progress: 25,
    tasks: [],
    statusCounts: counts,
    ...o,
  });
  const render = (blocks: GanttBlock[]) =>
    new DOMParser().parseFromString(renderToStaticMarkup(<GanttChart blocks={blocks} milestones={[]} />), "text/html");

  it("dashed, labelled, and the due date marked approximate", () => {
    const doc = render([block({ estimated: true })]);
    const bar = doc.querySelector('[data-estimated="true"]');
    expect(bar?.className).toContain("border-dashed");
    expect(doc.querySelector('[data-legend="estimated"]')?.textContent).toContain("estimated from task due dates");
    expect(doc.body.textContent).toContain("~18 Dec");
  });

  it("a block with real dates looks exactly as before", () => {
    const doc = render([block({ estimated: false })]);
    expect(doc.querySelector("[data-estimated]")).toBeNull();
    expect(doc.querySelector('[data-legend="estimated"]')).toBeNull();
    expect(doc.body.textContent).not.toContain("~18 Dec");
  });
});
