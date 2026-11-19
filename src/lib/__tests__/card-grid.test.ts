import { describe, expect, it } from "vitest";
import { cardGrid, emptySlots, xlColumns } from "@/lib/card-grid";

describe("cardGrid — no empty slots on the last row", () => {
  it("four cards are 2×2 at xl, not 3 + 1 (the Monitors audit finding)", () => {
    expect(xlColumns(4)).toBe(2);
    expect(cardGrid(4).container).not.toContain("xl:grid-cols-3");
  });

  for (let n = 1; n <= 13; n++) {
    it(`${n} card(s) leave no empty slot at md or xl`, () => {
      const g = cardGrid(n);
      // One card is a one-column grid at every width.
      expect(emptySlots(n, n === 1 ? 1 : 2, g.item, "md")).toBe(0);
      expect(emptySlots(n, xlColumns(n), g.item, "xl")).toBe(0);
    });
  }

  it("a two-wide grid closes an odd last row", () => {
    const g = cardGrid(3, 2);
    expect(g.container).not.toContain("xl:grid-cols-3");
    expect(g.item(2)).toBe("md:col-span-2");
    expect(emptySlots(3, 2, g.item, "md")).toBe(0);
  });

  it("only the last card ever stretches", () => {
    const g = cardGrid(7);
    for (let i = 0; i < 6; i++) expect(g.item(i)).toBe("");
    expect(g.item(6)).toContain("xl:col-span-3");
  });

  it("a single card takes the full width with no column classes", () => {
    expect(cardGrid(1).container).toBe("grid grid-cols-1 gap-3");
  });
});
