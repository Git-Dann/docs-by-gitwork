/**
 * The Comparisons section as rendered markup.
 *
 * Pins the layout rules that cannot be seen by tsc: a wide table sits in ONE scroller that
 * holds header and body (`.widget-card` is overflow:hidden, §45.2), the feature column is
 * pinned, few columns share the width while many scroll, every glyph carries its meaning
 * in words, and a phone gets a compare-two view rather than only a 45-column scroll.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WikiComparisonsSectionView, defaultCompareColumns } from "../wiki-comparisons-section";
import { ComparisonTable } from "../comparison-table";
import { parseComparisonContent, type ComparisonContent } from "@/lib/wiki-comparisons";
import type { WikiComparison } from "@/types/wiki-comparisons";

function table(columns: number, over: Partial<WikiComparison> = {}): WikiComparison {
  const cols = Array.from({ length: columns }, (_, i) => ({
    id: `c${i}`,
    title: `Plan ${i + 1}`,
    ...(i === 1 ? { highlight: true } : {}),
  }));
  const content = parseComparisonContent(cols, [
    { id: "g", kind: "group", label: "Core" },
    {
      id: "r1",
      kind: "row",
      label: "Sync",
      cells: { c0: { state: "yes" }, c1: { state: "partial" }, c2: { state: "no" }, c3: { state: "text", text: "10 GB" } },
    },
  ]);
  return {
    id: "t1",
    title: "What's in each plan",
    description: "October release",
    orderKey: 0,
    updatedAt: "2026-10-20T00:00:00.000Z",
    ...content,
    ...over,
  };
}

function wrap(node: React.ReactElement): Document {
  const html = renderToStaticMarkup(
    React.createElement(QueryClientProvider, { client: new QueryClient() }, node),
  );
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
}

function section(tables: WikiComparison[], mode: "internal" | "public" = "public"): Document {
  return wrap(
    React.createElement(WikiComparisonsSectionView, {
      slug: "northwind",
      section: { enabled: true, comparisons: tables },
      mode,
    }),
  );
}

function tableOnly(content: ComparisonContent, editing = false): Document {
  return wrap(React.createElement(ComparisonTable, { content, caption: "T", editing }));
}

describe("45 columns", () => {
  const doc = section([table(45)]);
  // The full table is the one without data-comparison-compare above it.
  const full = [...doc.querySelectorAll("table")].find((t) => t.querySelectorAll("thead th").length === 46)!;

  it("renders every column", () => {
    expect(full).toBeTruthy();
    expect(full.querySelectorAll("thead th[scope=col]")).toHaveLength(46);
  });

  it("sits in ONE scroller that holds both the header and the body", () => {
    const scroller = full.closest("[data-comparison-scroller]")!;
    expect(scroller).toBeTruthy();
    expect(scroller.className).toMatch(/overflow-auto/);
    expect(scroller.contains(full.querySelector("thead"))).toBe(true);
    expect(scroller.contains(full.querySelector("tbody"))).toBe(true);
    // Nothing between the table and its scroller scrolls on its own.
    expect(full.parentElement).toBe(scroller);
  });

  it("pins the feature column and the header row", () => {
    const corner = full.querySelector("thead th")!;
    expect(corner.className).toMatch(/\bsticky\b/);
    expect(corner.className).toMatch(/\bleft-0\b/);
    expect(corner.className).toMatch(/\btop-0\b/);
    const rowHead = full.querySelector("tbody th[scope=row]")!;
    expect(rowHead.className).toMatch(/\bsticky\b/);
    expect(rowHead.className).toMatch(/\bleft-0\b/);
  });

  it("scrolls at a fixed comfortable column width instead of crushing the columns", () => {
    const style = (full as HTMLElement).getAttribute("style") ?? "";
    expect(style).toMatch(/table-layout:\s*fixed/);
    expect(style).not.toMatch(/width:\s*100%/);
    const col = full.querySelectorAll("colgroup col")[1] as HTMLElement;
    expect(col.getAttribute("style")).toMatch(/width:\s*1\d\dpx/);
  });

  it("offers a phone compare-two view, defaulting to the leftmost and the featured column", () => {
    const compare = doc.querySelector("[data-comparison-compare]")!;
    expect(compare.className).toMatch(/sm:hidden/);
    const selects = compare.querySelectorAll("select");
    expect(selects).toHaveLength(2);
    expect((selects[0] as HTMLSelectElement).value).toBe("c0");
    expect((selects[1] as HTMLSelectElement).value).toBe("c1");
    // Inputs on a phone are ≥16px or iOS zooms the page on focus.
    expect(selects[0].className).toMatch(/text-\[16px\]/);
    const two = compare.querySelector("table")!;
    expect(two.querySelectorAll("thead th[scope=col]")).toHaveLength(3);
    expect(compare.textContent).toContain("Show all 45 columns");
  });
});

describe("few columns", () => {
  it.each([2, 3, 4, 5])("%i columns share the card width", (n) => {
    const doc = tableOnly(table(n));
    const style = doc.querySelector("table")!.getAttribute("style") ?? "";
    expect(style).toMatch(/width:\s*100%/);
  });

  it("two columns get no compare picker — there is nothing to pick", () => {
    expect(section([table(2)]).querySelector("[data-comparison-compare]")).toBeNull();
  });
});

describe("cells and grammar", () => {
  const doc = tableOnly(table(4));

  it("every glyph says what it means in words", () => {
    const text = doc.querySelector("tbody")!.textContent ?? "";
    expect(text).toContain("Included");
    expect(text).toContain("Partly included");
    expect(text).toContain("Not included");
    expect(text).toContain("10 GB");
  });

  it("'not included' is muted, never the danger colour — absence is not an error", () => {
    const html = doc.body.innerHTML;
    expect(html).not.toMatch(/danger/);
  });

  it("a group renders as one band spanning the whole table", () => {
    const band = doc.querySelector("th[scope=colgroup]")!;
    expect(band.getAttribute("colspan")).toBe("5");
    expect(band.textContent).toContain("Core");
  });

  it("the featured column carries a label and a tint", () => {
    const head = doc.querySelectorAll("thead th[scope=col]")[2] as HTMLElement;
    expect(head.textContent).toContain("Featured");
    expect(head.getAttribute("style")).toMatch(/brand-50/);
  });
});

describe("editing", () => {
  it("the client view has no edit controls at all", () => {
    const doc = section([table(3)], "public");
    expect(doc.body.textContent).not.toContain("Edit");
    expect(doc.querySelector("[aria-label^='Table options']")).toBeNull();
  });

  it("the team view offers Edit and New table", () => {
    const doc = section([table(3)], "internal");
    const labels = [...doc.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toContain("Edit");
    expect(labels.some((l) => l?.includes("New table"))).toBe(true);
  });

  it("at 45 columns the add-column control says why it will not add a 46th", () => {
    const doc = tableOnly(table(45), true);
    const add = doc.querySelector("[aria-label='Add column']")!;
    expect(add.getAttribute("aria-disabled")).toBe("true");
    expect(add.getAttribute("title")).toMatch(/at most 45 columns/);
  });

  it("below 45 the add-column control is live", () => {
    const add = tableOnly(table(3), true).querySelector("[aria-label='Add column']")!;
    expect(add.getAttribute("aria-disabled")).toBe("false");
  });

  it("edit fields are 16px on a phone", () => {
    const doc = tableOnly(table(3), true);
    for (const input of doc.querySelectorAll("input")) {
      expect(input.className).toMatch(/text-\[16px\]/);
    }
  });
});

describe("defaultCompareColumns", () => {
  it("the featured one plus the leftmost other, in table order; else the first two", () => {
    expect(defaultCompareColumns([{ id: "a" }, { id: "b" }, { id: "c", highlight: true }])).toEqual(["a", "c"]);
    expect(defaultCompareColumns([{ id: "a" }, { id: "b" }, { id: "c" }])).toEqual(["a", "b"]);
    expect(defaultCompareColumns([{ id: "a", highlight: true }, { id: "b" }, { id: "c" }])).toEqual(["a", "b"]);
  });
});
