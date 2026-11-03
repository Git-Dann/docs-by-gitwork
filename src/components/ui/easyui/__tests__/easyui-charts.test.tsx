// @vitest-environment jsdom
/**
 * Render tests for the vendored EasyUI charts (`../funnel-chart.tsx`, `../activity-heatmap.tsx`).
 *
 * They pin the Foundry changes, not EasyUI's design: colours are tokens (so light AND dark mode
 * work), a gain is never printed as a loss, the facts are available as text, the keyboard works,
 * and prefers-reduced-motion switches the entrance animation off.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FunnelChart } from "../funnel-chart";
import { ActivityHeatmap } from "../activity-heatmap";

let host: HTMLDivElement;
let root: Root;

function stubMatchMedia(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  stubMatchMedia(false);
});

afterEach(() => {
  if (root) act(() => root.unmount());
  vi.unstubAllGlobals();
});

const mount = (node: React.ReactNode) => {
  root = createRoot(host);
  act(() => root.render(node));
};

const parse = (html: string) => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
};

/** No literal colour may reach the markup: hex, rgb(), or a fixed Tailwind palette class. */
function expectTokenColoursOnly(html: string) {
  expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  expect(html).not.toMatch(/\b(neutral|rose|emerald|white|black)-?\d*/);
  expect(html).not.toMatch(/\bdark:/);
}

const DOC_STAGES = [
  { label: "Created", value: 120 },
  { label: "Shared with client", value: 50 },
  { label: "Opened", value: 24 },
  { label: "Accepted", value: 6 },
];

describe("FunnelChart (vendored)", () => {
  it("puts every stage, value and share of the first stage in a data table", () => {
    const el = parse(renderToStaticMarkup(<FunnelChart stages={DOC_STAGES} valueLabel="Documents" ariaLabel="Doc funnel" animated={false} />));
    expect(el.querySelector("svg")!.getAttribute("aria-label")).toBe("Doc funnel");
    const rows = [...el.querySelectorAll("table tr")].map((tr) => tr.textContent);
    expect(rows).toEqual([
      "StageDocuments% of first stage",
      "Created120100%",
      "Shared with client5042%",
      "Opened2420%",
      "Accepted65.0%",
    ]);
  });

  it("shows the loss between each pair of stages, and the summary line", () => {
    const el = parse(renderToStaticMarkup(<FunnelChart stages={DOC_STAGES} animated={false} />));
    expect([...el.querySelectorAll("[data-funnel-chip]")].map((t) => t.textContent)).toEqual(["−58%", "−52%", "−75%"]);
    const summary = el.querySelector("[data-funnel-summary]")!.textContent!;
    expect(summary).toContain("5.0% overall conversion");
    expect(summary).toContain("Biggest drop: Opened → Accepted −75%");
  });

  it("never prints a gain as a loss", () => {
    const el = parse(
      renderToStaticMarkup(
        <FunnelChart stages={[{ label: "Opened", value: 10 }, { label: "Accepted", value: 12 }]} animated={false} />,
      ),
    );
    expect(el.querySelector("[data-funnel-chip]")!.textContent).toBe("+20%");
    expect(el.querySelector("[data-funnel-summary]")!.textContent).not.toContain("Biggest drop");
  });

  it("colours bars along the brand scale and uses tokens everywhere else", () => {
    const html = renderToStaticMarkup(<FunnelChart stages={DOC_STAGES} animated={false} />);
    const fills = [...parse(html).querySelectorAll("[data-funnel-bar]")].map((b) => b.getAttribute("fill"));
    expect(fills[0]).toBe("color-mix(in oklch, var(--brand-400), var(--brand-800) 0%)");
    expect(fills[3]).toBe("color-mix(in oklch, var(--brand-400), var(--brand-800) 100%)");
    expectTokenColoursOnly(html);
  });

  it("grows its bars in from zero by default (the motion reduced-motion turns off)", () => {
    const el = parse(renderToStaticMarkup(<FunnelChart stages={DOC_STAGES} />));
    const widths = [...el.querySelectorAll("[data-funnel-bar]")].map((b) => parseFloat(b.getAttribute("width")!));
    expect(widths).toEqual([0, 0, 0, 0]);
  });

  it("gives each instance its own gradient ids", () => {
    const html = renderToStaticMarkup(
      <>
        <FunnelChart stages={DOC_STAGES} animated={false} />
        <FunnelChart stages={DOC_STAGES} animated={false} />
      </>,
    );
    const ids = [...parse(html).querySelectorAll("linearGradient")].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ArrowDown walks the stages and the tooltip names what is counted", () => {
    mount(<FunnelChart stages={DOC_STAGES} valueLabel="Documents" animated={false} />);
    const svg = host.querySelector("svg")!;
    act(() => svg.focus());
    act(() => {
      svg.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    act(() => {
      svg.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    const tip = host.querySelector("[data-easyui-tooltip]")!.textContent!;
    expect(tip).toContain("Shared with client");
    expect(tip).toContain("Documents50");
    expect(tip).toContain("Lost next−26 (−52%)");
  });
});

/** 14 days, Mon 5 Oct → Sun 18 Oct 2026. */
const DAYS = Array.from({ length: 14 }, (_, i) => {
  const date = new Date(Date.UTC(2026, 9, 5 + i)).toISOString().slice(0, 10);
  const value = [1, 4, 2, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0][i];
  return { date, value };
});

describe("ActivityHeatmap (vendored)", () => {
  const props = { data: DAYS, weeks: 2, weekStart: 1 as const, endDate: "2026-10-18", unit: "tasks completed" };

  it("draws one cell per day, Monday-first, and states the total and the peak", () => {
    const html = renderToStaticMarkup(<ActivityHeatmap {...props} animated={false} />);
    const el = parse(html);
    expect(el.querySelectorAll("rect[data-level]")).toHaveLength(14);
    expect(el.querySelector("[data-heatmap-summary]")!.textContent).toBe("15 tasks completed in the last 2 weeks");
    expect(el.textContent).toContain("Peak Tue, 13 Oct 2026 · 8");
  });

  it("uses tokens only, so it reads on cream and on navy", () => {
    const html = renderToStaticMarkup(<ActivityHeatmap {...props} animated={false} />);
    expectTokenColoursOnly(html);
    const el = parse(html);
    const empty = el.querySelector('rect[data-level="0"]') as SVGRectElement;
    expect(empty.getAttribute("style")).toContain("var(--text-1) 6%");
    // Levels are EasyUI's quantiles of the non-zero days, so assert on whichever is highest here.
    const shaded = [...el.querySelectorAll("rect[data-level]")].filter((r) => r.getAttribute("data-level") !== "0");
    expect(shaded.length).toBe(4);
    for (const r of shaded) expect(r.getAttribute("style")).toMatch(/color-mix\(in srgb, var\(--brand-600\) \d+%, transparent\)/);
  });

  it("reads the active day out through the live region as the arrow keys move", () => {
    mount(<ActivityHeatmap {...props} animated={false} />);
    const svg = host.querySelector("svg")!;
    act(() => svg.focus());
    // First arrow lands on the last column's first row (Mon 12 Oct), then up/down move a day.
    act(() => {
      svg.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Tue, 13 Oct 2026: 8 tasks completed");
    act(() => {
      svg.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    });
    expect(host.querySelector('[role="status"]')!.textContent).toBe("Tue, 6 Oct 2026: 4 tasks completed");
  });

  it("animates cells in by default, and ships the reduced-motion override for the keyframes", () => {
    const html = renderToStaticMarkup(<ActivityHeatmap {...props} />);
    expect(parse(html).querySelectorAll("rect.cj-cell").length).toBe(14);
    expect(html).toContain("@media (prefers-reduced-motion: reduce){.cj-cell{animation:none}}");
  });
});
