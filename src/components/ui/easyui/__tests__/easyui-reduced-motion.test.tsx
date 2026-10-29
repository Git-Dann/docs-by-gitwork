// @vitest-environment jsdom
/**
 * Under prefers-reduced-motion the vendored charts render with no entrance animation.
 *
 * framer-motion reads the media query once per process, so stubbing `matchMedia` mid-run doesn't
 * reach it; this file mocks `useReducedMotion` instead, which is exactly the switch both
 * components read.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => true,
}));

const { ActivityHeatmap } = await import("../activity-heatmap");
const { FunnelChart } = await import("../funnel-chart");

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

describe("prefers-reduced-motion", () => {
  it("heatmap cells get no entrance animation class", () => {
    const html = renderToStaticMarkup(
      <ActivityHeatmap data={[{ date: "2026-10-05", value: 2 }]} weeks={1} weekStart={1} endDate="2026-10-11" />,
    );
    expect(html).not.toContain("cj-cell\"");
    expect(html).not.toMatch(/class="cj-cell/);
  });

  it("funnel bars start at their final size rather than growing in", () => {
    const html = renderToStaticMarkup(
      <FunnelChart stages={[{ label: "A", value: 10 }, { label: "B", value: 5 }]} />,
    );
    const el = document.createElement("div");
    el.innerHTML = html;
    const bars = [...el.querySelectorAll("[data-funnel-bar]")];
    // Animated, the bars render at width 0 and spring out; reduced, they are drawn at full size.
    expect(bars.map((b) => parseFloat(b.getAttribute("width")!))).toEqual([480, 240]);
  });
});
