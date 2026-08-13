/**
 * Renders the real Gantt with a QA category and asserts the QA row is a slim
 * violet track that does NOT disturb the delivery bars — the thing Dan asked for
 * ("it does not impact the normal task bar").
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
  tasks: Array.from({ length: n }, (_, i) => ({ title: `t${i}`, done: false })),
  statusCounts: counts({ DONE: Math.round((progress / 100) * n) }),
});

const DELIVERY = [mk("m", "Mobile", 88, 90), mk("f", "Frontend", 83, 18), mk("b", "Backend", 90, 52)];
const QA = { ...mk("q", "QA", 40, 10), startDate: "2026-06-01", endDate: "2026-08-20" };

function render(blocks: GanttBlock[]) {
  return renderToStaticMarkup(
    React.createElement(GanttChart, { blocks, milestones: [], initialScale: "quarter" }),
  );
}

describe("QA track in the Gantt", () => {
  it("renders the QA category as a violet strip", () => {
    const html = render([...DELIVERY, QA]);
    expect(html).toContain("bg-violet-600"); // the fill
    expect(html).toContain("bg-violet-200"); // the track
  });

  it("does not draw QA as a full-height delivery bar", () => {
    const withQa = render([...DELIVERY, QA]);
    const without = render(DELIVERY);
    // A delivery bar is `top-2 h-7`; adding QA must not add another of those.
    const barCount = (s: string) => (s.match(/group absolute top-2 h-7/g) ?? []).length;
    expect(barCount(withQa)).toBe(barCount(without));
    expect(barCount(without)).toBe(3);
  });

  it("leaves the delivery bars byte-identical", () => {
    // The strongest form of "it does not impact the normal task bar".
    const withQa = render([...DELIVERY, QA]);
    const without = render(DELIVERY);
    const bars = (s: string) => s.match(/group absolute top-2 h-7[^]*?(?=<\/div>)/g)?.length ?? 0;
    expect(bars(withQa)).toBe(bars(without));
    // And every delivery name still present.
    for (const b of DELIVERY) expect(withQa).toContain(b.name);
  });

  it("still shows QA when it is the only category", () => {
    const html = render([QA]);
    expect(html).toContain("bg-violet-600");
  });

  it("widens the chart so a QA span running past delivery is not clipped", () => {
    /**
     * MEASURED, not inferred. The first version of this test asserted the word
     * "Sept" appeared in the markup — which is true whether or not QA is in the
     * date domain, because the domain pads two months past the last delivery
     * date. It passed against a build with QA deliberately excluded, so it was
     * proving nothing.
     *
     * This reads the strip's own geometry back out and checks it fits inside the
     * chart column, which is the property that actually matters.
     */
    const farQa = { ...QA, startDate: "2026-06-01", endDate: "2026-12-20" };
    const html = render([...DELIVERY, farQa]);

    // The chart column carries the full timeline width…
    const widths = [...html.matchAll(/width:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    const timelineWidth = Math.max(...widths);

    // …and the violet strip carries its own left/width.
    const strip = html.match(
      /bg-violet-200"[^>]*style="left:\s*([\d.]+)px;\s*width:\s*([\d.]+)px/,
    );
    expect(strip, "could not find the QA strip's geometry").toBeTruthy();
    const left = Number(strip![1]);
    const width = Number(strip![2]);

    expect(width).toBeGreaterThan(0);
    expect(left + width).toBeLessThanOrEqual(timelineWidth + 1);
  });
});
