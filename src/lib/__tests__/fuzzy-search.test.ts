import { describe, expect, it } from "vitest";
import { editDistance, fuzzyScore, fuzzySearch, normalise } from "../fuzzy-search";

/**
 * The real question this answers is "did we already add this course?", asked
 * against ~750 rows by someone with half the name and no idea how it was spelled
 * when it arrived. The test data is taken from actual Wedge rows.
 */

const COURSES = [
  "Iver Golf Vlub", // a real row — "Club" misspelled on the way in
  "HS2 Renovated Course (Home Course)",
  "home course",
  "Ardlodge",
  "Dorking",
  "Royal Ashdown Forest",
  "Sandy Lodge",
  "Wentworth Club",
  "St Andrews Links",
  "Ashford Manor",
];
const find = (q: string) => fuzzySearch(COURSES, q, (c) => [c]);

describe("normalise", () => {
  it("flattens case, accents and punctuation", () => {
    expect(normalise("Château  D'Or (West)")).toBe("chateau d or west");
  });
  it("is empty for a blank query", () => {
    expect(normalise("   ")).toBe("");
    expect(normalise("!!!")).toBe("");
  });
});

describe("editDistance", () => {
  it("counts substitutions, insertions and deletions", () => {
    expect(editDistance("club", "vlub")).toBe(1);
    expect(editDistance("ardlodge", "ardlodg")).toBe(1);
    expect(editDistance("dorking", "dorking")).toBe(0);
  });
  it("bails out past the cap instead of computing the whole matrix", () => {
    expect(editDistance("a", "abcdefghij", 2)).toBe(3);
  });
});

describe("finding a course", () => {
  it("finds it from the first few letters", () => {
    expect(find("ard")[0]).toBe("Ardlodge");
    expect(find("dork")[0]).toBe("Dorking");
  });

  it("finds it despite a misspelling", () => {
    // The row itself is misspelled; the user types it correctly.
    expect(find("iver golf club")).toContain("Iver Golf Vlub");
    // And the reverse: user misspells a correct row.
    expect(find("ardlodg")[0]).toBe("Ardlodge");
    expect(find("wentwerth")[0]).toBe("Wentworth Club");
  });

  it("tolerates a transposition", () => {
    expect(find("dokring")[0]).toBe("Dorking");
  });

  it("matches a word anywhere in the name, not just the start", () => {
    expect(find("lodge")).toContain("Sandy Lodge");
    expect(find("forest")).toContain("Royal Ashdown Forest");
  });

  it("is case- and punctuation-insensitive", () => {
    expect(find("ST ANDREWS")[0]).toBe("St Andrews Links");
    expect(find("st. andrews")[0]).toBe("St Andrews Links");
  });

  it("ranks the exact name above a partial one", () => {
    const results = find("home course");
    expect(results[0]).toBe("home course");
  });

  it("narrows as you add words, never widens", () => {
    const one = find("ash");
    const two = find("ashdown forest");
    expect(two.length).toBeLessThanOrEqual(one.length);
    expect(two[0]).toBe("Royal Ashdown Forest");
  });

  it("requires EVERY word to match — one bad token disqualifies the row", () => {
    // Otherwise typing more would keep dragging in rows that match only "golf".
    expect(find("dorking wentworth")).toEqual([]);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(find("zzzzzz")).toEqual([]);
  });

  it("returns everything for a blank query, in the original order", () => {
    expect(find("")).toEqual(COURSES);
    expect(find("   ")).toEqual(COURSES);
  });

  it("does not let a 3-letter query match on a typo", () => {
    // Tolerance at 3 chars is 0: forgiving "abc" would match almost anything.
    expect(find("xyz")).toEqual([]);
  });
});

describe("field weighting", () => {
  it("ranks a name match above a match in a later field", () => {
    const rows = [
      { name: "Sandy Lodge", country: "England", notes: "" },
      { name: "Dorking", country: "England", notes: "near Sandy Lodge" },
    ];
    const out = fuzzySearch(rows, "sandy", (r) => [r.name, r.country, r.notes]);
    expect(out[0].name).toBe("Sandy Lodge");
  });

  it("still finds a row when only a later field matches", () => {
    const rows = [{ name: "Dorking", country: "Scotland", notes: "" }];
    expect(fuzzySearch(rows, "scotland", (r) => [r.name, r.country, r.notes])).toHaveLength(1);
  });
});

describe("fuzzyScore", () => {
  it("scores an exact match above a prefix, and a prefix above a subsequence", () => {
    const exact = fuzzyScore("dorking", ["Dorking"]);
    const prefix = fuzzyScore("dork", ["Dorking"]);
    const sub = fuzzyScore("dkng", ["Dorking"]);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(sub);
    expect(sub).toBeGreaterThan(0);
  });

  it("is 0 for an empty query so callers can skip filtering", () => {
    expect(fuzzyScore("", ["Dorking"])).toBe(0);
  });
});
