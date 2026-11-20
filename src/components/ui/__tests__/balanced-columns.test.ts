import { describe, expect, it } from "vitest";
import { placeCards } from "@/components/ui/balanced-columns";

describe("placeCards", () => {
  it("puts each card in the shorter column, left on a tie", () => {
    const { placements } = placeCards([100, 300, 100, 100], 20);
    expect(placements.map((p) => p.column)).toEqual([0, 1, 0, 0]);
    expect(placements.map((p) => p.top)).toEqual([0, 0, 120, 240]);
  });

  it("answers one tall card with several short ones so the columns end close", () => {
    // The Staff profile shape: a tall Overview, then shorter cards.
    const heights = [900, 300, 250, 280, 260, 300];
    const { placements, height } = placeCards(heights, 20);
    const ends = [0, 0];
    placements.forEach((p, i) => (ends[p.column] = p.top + heights[i]));
    expect(Math.abs(ends[0] - ends[1])).toBeLessThan(300);
    expect(height).toBe(Math.max(...ends));
  });

  it("is empty for no cards", () => {
    expect(placeCards([], 20)).toEqual({ placements: [], height: 0 });
  });
});
