/**
 * The Venn's presentation options, added so RoundUp's derived diagram can say what it
 * counts without changing how an authored Charts board behaves.
 *
 * ⚠️ The defect these exist for: on GAIA Bloom's real page, panel 01 read "2 in flight"
 * while the Venn read "In flight 0". Both numbers were correct — the panel counts
 * ITEMS, a circle counts WORKSTREAMS, and her two in-progress tasks belong to no
 * workstream. The page contradicted itself on screen, which no test could catch because
 * each number was individually right.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InsightVennChart } from "../insight-charts";

const SETS = [
  { key: "A" as const, label: "Delivered", color: "blue" as const },
  { key: "B" as const, label: "In flight", color: "emerald" as const },
  { key: "C" as const, label: "Planned", color: "amber" as const },
];
const ITEMS = [
  { id: "1", label: "Enforcement layer", region: "A" as const, note: null },
  { id: "2", label: "My Tasks", region: "AC" as const, note: null },
];

const text = (html: string) => {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? "";
};

describe("the unit is stated", () => {
  it("defaults to items, so an authored Charts board is unchanged", () => {
    const body = text(renderToStaticMarkup(<InsightVennChart sets={SETS} items={ITEMS} />));
    expect(body).toContain("how many items sit in each region");
  });

  it("says workstreams when that is what a circle counts", () => {
    const body = text(
      renderToStaticMarkup(<InsightVennChart sets={SETS} items={ITEMS} unit="workstreams" />),
    );
    expect(body).toContain("how many workstreams sit in each region");
    expect(body).not.toContain("how many items sit");
  });
});

describe("empty regions", () => {
  // ⚠️ Assert on the region HEADINGS, not on em-dashes. `regionLabel` itself contains
  // one ("Both — Delivered + Planned"), so counting em-dashes counts the labels of the
  // populated rows too — my first version expected 5 and got 11.
  it("are listed by default — on an authored board an empty region is a finding", () => {
    const body = text(renderToStaticMarkup(<InsightVennChart sets={SETS} items={ITEMS} />));
    expect(body).toContain("Only — In flight");
    expect(body).toContain("All three");
  });

  it("are dropped when asked, because the diagram already prints their 0", () => {
    const body = text(
      renderToStaticMarkup(<InsightVennChart sets={SETS} items={ITEMS} hideEmptyRegions />),
    );
    expect(body).not.toContain("Only — In flight");
    expect(body).not.toContain("All three");
    // The populated ones survive, headings and all.
    expect(body).toContain("Enforcement layer");
    expect(body).toContain("My Tasks");
  });
});

describe("width", () => {
  const widthOf = (html: string) => /max-width:\s*(\d+)px/.exec(html)?.[1] ?? null;

  it("defaults to the viewBox width — the design size is the cap", () => {
    // 560 is the geometry's own width; 420 is the min-width that drives the scroller.
    expect(widthOf(renderToStaticMarkup(<InsightVennChart sets={SETS} items={ITEMS} />))).toBe(
      "560",
    );
  });

  it("can be capped smaller for a figure that is one panel among several", () => {
    expect(
      widthOf(renderToStaticMarkup(<InsightVennChart sets={SETS} items={ITEMS} maxWidth={340} />)),
    ).toBe("340");
  });

  it("drops its min-width to match, or the cap does nothing", () => {
    // ⚠️ The component used to hardcode min-w-[420px], so any cap below 420 was
    // silently overridden and the prop appeared to have no effect. Measured: the
    // figure stayed 420 when asked for 340.
    const html = renderToStaticMarkup(<InsightVennChart sets={SETS} items={ITEMS} maxWidth={340} />);
    expect(/min-width:\s*340px/.test(html), html.slice(0, 400)).toBe(true);
  });

  it("never scales a figure UP past its own design size", () => {
    // A bigger cap would stretch the drawing rather than give it whitespace, which is
    // the unbounded-figure defect §52.7 records.
    expect(
      widthOf(renderToStaticMarkup(<InsightVennChart sets={SETS} items={ITEMS} maxWidth={900} />)),
    ).toBe("560");
  });
});
