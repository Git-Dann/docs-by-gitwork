import { describe, expect, it } from "vitest";
import {
  editDistance,
  fuzzyScore,
  fuzzySearch,
  normalise,
} from "../fuzzy-search";

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
    expect(
      fuzzySearch(rows, "scotland", (r) => [r.name, r.country, r.notes]),
    ).toHaveLength(1);
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

/**
 * Searching for a course that is NOT in the table.
 *
 * ── What went wrong (September 2026) ──────────────────────────────────────────
 * Searching the live table for "Jamestown" — which is not in it — returned 33
 * rows, none containing the word. Every one scored on the subsequence fallback
 * against the `notes` field, which holds the original Big Wedge feedback email:
 * 500-850 characters of prose. In a text that long, almost any ordinary sequence
 * of letters can be found in order, so the fallback had quietly become a
 * near-universal match on every row that had a note.
 *
 * The same disease sat one tier up: a 600-character note contains hundreds of
 * words, so one of them is nearly always within edit distance 2 of whatever was
 * typed. That is how "St Andrews" matched an unrelated row — "andrews" was two
 * edits from some word buried in its note.
 *
 * The suite did not catch either, because its only negative case was "zzzzzz" —
 * letters that appear nowhere, and so cannot be a subsequence of anything. A
 * fuzzy matcher has to be tested with a query that LOOKS like the data and still
 * is not in it. Every test below uses fixtures carrying a realistic long note.
 */
describe("a course that is not in the table", () => {
  /** A verbatim-shaped Big Wedge note — the field that caused the bug. */
  const note = (course: string) =>
    "From Big Wedge Golf (16 Jun 2026):\nNew Feedback Received\n\nHello Admin,\n" +
    "A new feedback submission has been received on Big Wedge Golf.\n" +
    "From: Harry Davenport\nEmail: harryd2304@gmail.com\n" +
    "Submitted: 2026-06-16 10:46:35\nFeedback ID: d14df644-b10a-4869-9e40\n" +
    `Message:\nPlease could you add ${course}, it is my home course and the ` +
    "scorecard is showing the wrong nine. I have attached a layout for reference.\n" +
    "This is an automated notification from Big Wedge Golf";

  const ROWS = [
    { name: "Ardlodge", notes: note("Ardlodge") },
    { name: "Dorking", notes: note("Dorking") },
    { name: "Iver Golf Vlub", notes: note("Iver Golf Club") },
    { name: "Neanger Park", notes: note("Neanger Park in Eaglehawk, Bendigo") },
  ];
  const search = (q: string) => fuzzySearch(ROWS, q, (r) => [r.name, r.notes]);

  it.each([
    "Jamestown",
    "Pebble Beach",
    "Augusta National",
    "Torrey Pines",
    "Chambers Bay",
    "Whistling Straits",
    "Muirfield Village",
  ])("finds nothing for %s", (query) => {
    // These read exactly like the data and are absent from it. Each one used to
    // come back with most of the table attached.
    expect(search(query)).toEqual([]);
  });

  it("does not match long prose on a subsequence", () => {
    // "jamestown" IS present in order inside the note's letters; that must not
    // count, because at that length it is coincidence rather than evidence.
    expect(fuzzyScore("jamestown", [ROWS[0].notes])).toBe(0);
  });

  it("does not match long prose on a typo either", () => {
    // Two edits from *something* in several hundred words is near-certain.
    expect(fuzzyScore("andrews", [ROWS[0].notes])).toBe(0);
    expect(fuzzyScore("davenpott", [ROWS[0].notes])).toBe(0);
  });

  it("still searches long prose on solid evidence", () => {
    // The notes carry real detail — a town, a club name — and searching it is the
    // point of including the field. Only the fuzzy tiers are withdrawn.
    expect(search("bendigo").map((r) => r.name)).toEqual(["Neanger Park"]);
    expect(search("harry davenport").length).toBe(ROWS.length);
  });

  it("does not subsequence-match a name far longer than the query", () => {
    // The field-length gate does not cover this: a course NAME is short enough to
    // be matched fuzzily, so the subsequence rule needs its own length bound.
    // "Elmpter Wald Golf ClubGolfclub Elmpter Wald" is a real row, and "tampa" is
    // genuinely present in it letter-by-letter, in order.
    const name = "Elmpter Wald Golf ClubGolfclub Elmpter Wald";
    expect(fuzzyScore("tampa", [name])).toBe(0);
    // The words that are actually in it are still found.
    expect(fuzzyScore("elmpter", [name])).toBeGreaterThan(0);
  });

  it("keeps a subsequence match where the text is short enough to mean it", () => {
    // The rule is a length bound, not a removal: "wtsn" in "Watson" still counts.
    expect(fuzzyScore("wtsn", ["Watson"])).toBeGreaterThan(0);
    expect(fuzzyScore("iverglf", ["Iver Golf Vlub"])).toBeGreaterThan(0);
  });

  it("does not let a two-letter token match inside a word", () => {
    // "st" sits inside "Wyboston", which is how "St Andrews" surfaced a row that
    // has nothing to do with St Andrews.
    expect(fuzzyScore("st", ["Wyboston Lakes Golf"])).toBe(0);
    // A word that actually starts that way is still found.
    expect(fuzzyScore("st", ["St Andrews Links"])).toBeGreaterThan(0);
  });
});

describe("misspelling tolerance", () => {
  it("forgives one edit from four characters, which is the Vlub case", () => {
    // The live table really does contain "Iver Golf Vlub".
    expect(fuzzyScore("club", ["Iver Golf Vlub"])).toBeGreaterThan(0);
  });

  it("forgives two edits only from seven characters up", () => {
    // At six characters two edits is a third of the word — loose enough that
    // "horley" matched forty rows of the live table.
    expect(fuzzyScore("horley", ["Holes"])).toBe(0);
    expect(fuzzyScore("dokring", ["Dorking"])).toBeGreaterThan(0);
  });

  it("prefers the typo match that starts the way the query does", () => {
    // "dokring" is two edits from both, and only one is plausibly what was meant.
    const rows = ["Bowring Park", "Dorking"];
    expect(fuzzySearch(rows, "dokring", (r) => [r])[0]).toBe("Dorking");
  });

  it("ranks a near-exact word above the letters turning up inside a longer word", () => {
    // "iver" sits inside "Riverside". "Iver Golf Vlub" is the row that was meant,
    // and used to come second.
    const rows = ["Dodge Riverside Golf Club", "Iver Golf Vlub"];
    expect(fuzzySearch(rows, "iver golf club", (r) => [r])[0]).toBe(
      "Iver Golf Vlub",
    );
  });
});
