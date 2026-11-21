import { describe, expect, it } from "vitest";
import { careSectionCount, careSectionNumbers } from "@/lib/care-sections";

describe("careSectionNumbers", () => {
  it("numbers panes in render order", () => {
    expect(careSectionNumbers([true, true, true])).toEqual(["01", "02", "03"]);
  });

  it("a hidden pane leaves no hole", () => {
    // The whole point: Reports showed a lone `02` whenever its first pane was hidden.
    expect(careSectionNumbers([false, true, true])).toEqual(["", "01", "02"]);
    expect(careSectionNumbers([true, false, true])).toEqual(["01", "", "02"]);
  });

  it("a hidden pane gets an empty string, not a number it must not use", () => {
    // Returning "00" or the next number would make a stray render look correct. "" is visibly
    // wrong, which is what you want from a bug you did not mean to ship.
    expect(careSectionNumbers([false])).toEqual([""]);
  });

  it("continues someone else's sequence", () => {
    // ConnectorsView renders inside the cockpit's Settings panel, after up to two other panes.
    expect(careSectionNumbers([true, true], 3)).toEqual(["03", "04"]);
  });

  it("pads past nine without losing the padding before it", () => {
    expect(careSectionNumbers(Array(11).fill(true))).toEqual([
      "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11",
    ]);
  });

  it("an empty list is an empty list", () => {
    expect(careSectionNumbers([])).toEqual([]);
  });
});

describe("careSectionCount", () => {
  it("counts only what renders", () => {
    expect(careSectionCount([true, false, true])).toBe(2);
    expect(careSectionCount([])).toBe(0);
  });

  it("agrees with careSectionNumbers, which is the whole reason it exists", () => {
    /*
     * The Settings panel needs to know where ConnectorsView's run ends so the Portal link can
     * carry on from it. Doing that with separate arithmetic is exactly the bug this replaces, so
     * the two must be derived from the same input and cannot be allowed to disagree.
     */
    for (const shown of [[], [true], [false], [true, false, true], [false, false], Array(7).fill(true)]) {
      const numbers = careSectionNumbers(shown).filter(Boolean);
      expect(numbers.length).toBe(careSectionCount(shown));
    }
  });
});
