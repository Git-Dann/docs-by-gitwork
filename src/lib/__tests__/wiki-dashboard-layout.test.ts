/**
 * The personal dashboard layout: what a saved arrangement can and cannot do, and how the
 * grid closes gaps without reordering anything.
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_LAYOUT,
  STANDUPS_CARD,
  fillRows,
  hideCard,
  isDefaultLayout,
  moveCard,
  readLayout,
  resolveLayout,
  setCardSize,
  showCard,
  spanClasses,
} from "@/lib/wiki-dashboard-layout";

const AVAILABLE = [STANDUPS_CARD, "timeline", "monitors", "intake", "metrics"];

describe("defaults", () => {
  it("is the dashboard as designed: Daily updates full width, Timeline 2, the rest 1", () => {
    const r = resolveLayout(EMPTY_LAYOUT, AVAILABLE);
    expect(r.visible).toEqual([
      { id: "standups", size: 3 },
      { id: "timeline", size: 2 },
      { id: "monitors", size: 1 },
      { id: "intake", size: 1 },
      { id: "metrics", size: 1 },
    ]);
    expect(isDefaultLayout(EMPTY_LAYOUT, AVAILABLE)).toBe(true);
  });
});

describe("a saved layout only arranges cards that exist", () => {
  it("drops a section switched off since, and adds a new one at the end", () => {
    const saved = { order: ["metrics", "gone", "timeline"], sizes: { gone: 3 as const }, hidden: [] };
    const r = resolveLayout(saved, AVAILABLE);
    expect(r.visible.map((c) => c.id)).toEqual(["metrics", "timeline", "standups", "monitors", "intake"]);
  });

  it("can never surface a hidden-from-this-viewer section by naming it", () => {
    const r = resolveLayout({ order: ["secret"], sizes: {}, hidden: ["secret"] }, AVAILABLE);
    expect(r.visible.some((c) => c.id === "secret")).toBe(false);
    expect(r.hidden).toEqual([]);
  });

  it("reads junk from storage as no layout", () => {
    expect(readLayout("x")).toEqual(EMPTY_LAYOUT);
    expect(readLayout({ order: [1, "a", "a"], sizes: { a: 4, b: 2 }, hidden: "no" })).toEqual({
      order: ["a"],
      sizes: { b: 2 },
      hidden: [],
    });
  });
});

describe("editing", () => {
  it("moves a card to where it was dropped", () => {
    const next = moveCard(EMPTY_LAYOUT, AVAILABLE, "metrics", "timeline");
    expect(resolveLayout(next, AVAILABLE).visible.map((c) => c.id)).toEqual([
      "standups",
      "metrics",
      "timeline",
      "monitors",
      "intake",
    ]);
  });

  it("moving down lands after the target", () => {
    const next = moveCard(EMPTY_LAYOUT, AVAILABLE, "standups", "monitors");
    expect(resolveLayout(next, AVAILABLE).visible.map((c) => c.id)).toEqual([
      "timeline",
      "monitors",
      "standups",
      "intake",
      "metrics",
    ]);
  });

  it("a hidden card comes back where it was, not at the end", () => {
    const hidden = hideCard(EMPTY_LAYOUT, "monitors");
    expect(resolveLayout(hidden, AVAILABLE).hidden).toEqual(["monitors"]);
    expect(resolveLayout(hidden, AVAILABLE).visible.map((c) => c.id)).not.toContain("monitors");
    const back = showCard(hidden, "monitors");
    expect(resolveLayout(back, AVAILABLE).visible.map((c) => c.id)).toEqual(AVAILABLE);
  });

  it("a card hidden after being moved comes back at its moved position", () => {
    const moved = moveCard(EMPTY_LAYOUT, AVAILABLE, "metrics", "timeline");
    const back = showCard(hideCard(moved, "metrics"), "metrics");
    expect(resolveLayout(back, AVAILABLE).visible.map((c) => c.id)[1]).toBe("metrics");
  });

  it("a width change sticks and makes the layout non-default", () => {
    const next = setCardSize(EMPTY_LAYOUT, "monitors", 3);
    expect(resolveLayout(next, AVAILABLE).visible.find((c) => c.id === "monitors")?.size).toBe(3);
    expect(isDefaultLayout(next, AVAILABLE)).toBe(false);
  });
});

describe("no gaps — a short row's last card closes it", () => {
  it("3 columns: packs in order and stretches only the card that ends a short row", () => {
    // [3] [2 1] [1 1 ·] → the last row's final card stretches to 2.
    expect(fillRows([3, 2, 1, 1, 1], 3)).toEqual([3, 2, 1, 1, 2]);
  });

  it("a card that does not fit starts a new row; the row it leaves is closed", () => {
    // [1 ·  ·] then [3]: the 1 cannot share with a 3, so it stretches to fill its row.
    expect(fillRows([1, 3], 3)).toEqual([3, 3]);
    expect(fillRows([2, 2, 1], 3)).toEqual([3, 2, 1]);
  });

  it("2 columns: a 3-wide card is 2 wide, and rows pack the same way", () => {
    expect(fillRows([3, 1, 1, 1], 2)).toEqual([2, 1, 1, 2]);
  });

  it("never reorders — spans are returned in the viewer's order, one per card", () => {
    const sizes = [1, 3, 2, 1, 1] as const;
    expect(fillRows([...sizes], 3)).toHaveLength(sizes.length);
    expect(spanClasses([...sizes])).toHaveLength(sizes.length);
  });

  it("emits literal class names Tailwind can see", () => {
    // At 2 columns the 1 and the 2 cannot share a row, so the 1 stretches to 2.
    expect(spanClasses([1, 2])).toEqual(["md:col-span-2 lg:col-span-1", "md:col-span-2 lg:col-span-2"]);
  });
});

describe("dragging never changes a card's shape", () => {
  it("moves cards with a translate only — no scaleX/scaleY", async () => {
    // `CSS.Transform` carries the scale the sorting strategy computes so cards of different
    // widths can swap, which squashed and stretched every card a drag passed over.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "src/components/clients/wiki/wiki-dashboard-grid.tsx"),
      "utf8",
    ).replace(/\/\/.*$/gm, "");
    expect(src).toContain("CSS.Translate.toString(transform)");
    expect(src).not.toContain("CSS.Transform.toString");
  });
});
