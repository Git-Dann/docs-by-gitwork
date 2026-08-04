import { describe, expect, it } from "vitest";
import {
  hasAccentTail,
  parseAccentSegments,
  pickRecommendedIndex,
  romanNumeral,
} from "@/lib/sections/variant-helpers";

describe("romanNumeral", () => {
  it("is 0-based — index 0 is the first numeral", () => {
    expect(romanNumeral(0)).toBe("i");
  });

  it("covers the range a process block realistically renders", () => {
    const first = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(romanNumeral);
    expect(first).toEqual(["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"]);
  });

  it("handles the subtractive pairs, not just additive runs", () => {
    // The classic bug: a greedy additive-only converter yields "iiii" / "viiii" / "xxxx".
    expect(romanNumeral(3)).toBe("iv");
    expect(romanNumeral(8)).toBe("ix");
    expect(romanNumeral(38)).toBe("xxxix");
    expect(romanNumeral(39)).toBe("xl");
    expect(romanNumeral(89)).toBe("xc");
    expect(romanNumeral(399)).toBe("cd");
    expect(romanNumeral(899)).toBe("cm");
  });

  it("rounds the decade / century boundaries correctly", () => {
    expect(romanNumeral(49)).toBe("l");
    expect(romanNumeral(99)).toBe("c");
    expect(romanNumeral(499)).toBe("d");
    expect(romanNumeral(999)).toBe("m");
    expect(romanNumeral(3998)).toBe("mmmcmxcix");
  });

  it("degrades to an empty string on a malformed index rather than printing NaN", () => {
    expect(romanNumeral(-1)).toBe("");
    expect(romanNumeral(Number.NaN)).toBe("");
    expect(romanNumeral(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("truncates a fractional index instead of looping forever", () => {
    expect(romanNumeral(2.7)).toBe("iii");
  });
});

describe("pickRecommendedIndex", () => {
  it("finds the flagged tier", () => {
    expect(pickRecommendedIndex([{}, { highlighted: true }, {}])).toBe(1);
  });

  it("returns -1 when nothing is flagged", () => {
    expect(pickRecommendedIndex([{}, {}])).toBe(-1);
    expect(pickRecommendedIndex([])).toBe(-1);
  });

  it("first wins when a payload carries more than one flag", () => {
    // Two dark faces side by side reads as a bug — the pick has to be deterministic.
    expect(pickRecommendedIndex([{ highlighted: true }, { highlighted: true }])).toBe(0);
  });

  it("only a literal true counts", () => {
    expect(pickRecommendedIndex([{ highlighted: false }, {}])).toBe(-1);
  });
});

describe("parseAccentSegments", () => {
  it("splits the reference headings into plain + accent runs", () => {
    expect(parseAccentSegments("Five angles of *attack.*")).toEqual([
      { text: "Five angles of ", accent: false },
      { text: "attack.", accent: true },
    ]);
    expect(parseAccentSegments("What this is, and what is *not.*")).toEqual([
      { text: "What this is, and what is ", accent: false },
      { text: "not.", accent: true },
    ]);
  });

  it("returns one plain segment for text with no asterisks — existing headings are untouched", () => {
    expect(parseAccentSegments("What shipped")).toEqual([{ text: "What shipped", accent: false }]);
  });

  it("leaves an unpaired asterisk literal", () => {
    expect(parseAccentSegments("Rates * VAT")).toEqual([{ text: "Rates * VAT", accent: false }]);
    expect(parseAccentSegments("Trailing *")).toEqual([{ text: "Trailing *", accent: false }]);
  });

  it("never matches an empty pair", () => {
    expect(parseAccentSegments("Before ** after")).toEqual([{ text: "Before ** after", accent: false }]);
  });

  it("supports an accent run that is not at the end, and more than one", () => {
    expect(parseAccentSegments("*Let* real users *in.*")).toEqual([
      { text: "Let", accent: true },
      { text: " real users ", accent: false },
      { text: "in.", accent: true },
    ]);
  });

  it("does not span a line break", () => {
    expect(parseAccentSegments("one *two\nthree* four")).toEqual([
      { text: "one *two\nthree* four", accent: false },
    ]);
  });

  it("drops nothing but empty runs", () => {
    expect(parseAccentSegments("")).toEqual([]);
    expect(parseAccentSegments("*all of it*")).toEqual([{ text: "all of it", accent: true }]);
  });
});

describe("hasAccentTail", () => {
  it("distinguishes an authored accent tail from plain text", () => {
    expect(hasAccentTail("let real users *in.*")).toBe(true);
    expect(hasAccentTail("let real users in.")).toBe(false);
    expect(hasAccentTail("a * b")).toBe(false);
  });
});
