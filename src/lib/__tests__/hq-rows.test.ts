import { describe, expect, it } from "vitest";
import { rowHeight, rowsOf } from "../hq-rows";

describe("HQ row height: no half-empty tiles", () => {
  it("takes the shortest tile, so taller ones scroll rather than leaving gaps", () => {
    expect(rowHeight([200, 480, 320], 180, 452)).toBe(200);
  });
  it("never goes below the floor or above the cap", () => {
    expect(rowHeight([90, 400], 180, 452)).toBe(180);
    expect(rowHeight([900, 700], 180, 452)).toBe(452);
  });
  it("falls back to the floor when nothing is measured yet", () => {
    expect(rowHeight([], 140, 220)).toBe(140);
    expect(rowHeight([0, NaN], 140, 220)).toBe(140);
  });
  it("groups tiles into rows", () => {
    expect(rowsOf(5, 3)).toEqual([[0, 1, 2], [3, 4]]);
    expect(rowsOf(4, 2)).toEqual([[0, 1], [2, 3]]);
  });
});
