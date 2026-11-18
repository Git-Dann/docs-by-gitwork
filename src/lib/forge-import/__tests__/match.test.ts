import { describe, expect, it } from "vitest";
import { compareTitles, normaliseTitle, sequenceRatio, strippedTitle, titled } from "../match";

describe("title normalisation", () => {
  it("ignores case, punctuation, '&' and a trailing platform tag", () => {
    expect(normaliseTitle("Ai Caddy Integration?")).toBe(normaliseTitle("AI Caddy Integration"));
    expect(normaliseTitle("Comments & Banter")).toBe("comments and banter");
    expect(normaliseTitle("Bag management Updates - IOS")).toBe("bag management updates");
    expect(normaliseTitle("Green Maps (Front / Middle / Back)")).toBe("green maps front middle back");
  });

  it("drops the team's own prefixes only in the stripped form", () => {
    expect(strippedTitle("Review Item: General Feedback and Updates")).toBe("general feedback and updates");
    expect(strippedTitle("Subtask 4.2: Strokes gained")).toBe("strokes gained");
    expect(normaliseTitle("Review Item: General Feedback")).toContain("review item");
  });
});

describe("sequenceRatio matches Python's difflib", () => {
  // Reference values from difflib.SequenceMatcher(None, a, b).ratio().
  it.each([
    ["bag management", "bag management updates", 0.777778],
    ["targeted notification", "targeted notifications", 0.976744],
    ["update user profile", "update user profile model", 0.863636],
    ["rate course", "rate course", 1],
    ["abcd", "bcda", 0.75],
    ["green maps front middle back", "green maps", 0.526316],
    ["create handicap page in user profile", "user profile handicap screen", 0.375],
  ])("%s / %s", (a, b, want) => {
    expect(sequenceRatio(a, b)).toBeCloseTo(want, 5);
  });
});

describe("matching real Big Wedge titles to Wedge board tasks", () => {
  const cmp = (a: string, b: string) => compareTitles(titled(a), titled(b))?.kind ?? null;

  it("calls the same title exact, whatever the punctuation", () => {
    expect(cmp("Ai Caddy Integration?", "AI Caddy Integration")).toBe("exact");
    expect(cmp("Round & Score Migration", "Round & Score Migration")).toBe("exact");
    expect(cmp("Group Management", "Group Management QA - IOS")).not.toBe("exact");
  });

  it("only ever calls a renamed or split task probable, never exact", () => {
    expect(cmp("Targeted Notification", "Targeted Notifications")).toBe("probable");
    expect(cmp("Bag Management", "Bag management Updates - IOS")).toBe("probable");
    expect(cmp("Advertising (3rd Party)", "End-of-Round Advertising (3rd Party)")).toBe("probable");
    expect(cmp("Update User Profile", "Update User Profile Model")).toBe("probable");
  });

  it("does not match unrelated work that shares a word", () => {
    expect(cmp("Rate Course", "Rate Limiting on Course Search API")).toBeNull();
    expect(cmp("Offline Score Cards", "Offline-first P3: offline round lifecycle (start, score, finish) with outbox sync - IOS")).toBeNull();
    expect(cmp("Strokes Gained", "Calculate Strokes gained.")).toBeNull();
  });
});

describe("a platform's slice of the work is never an exact match", () => {
  it('"Bag Management - iOS" is probable for the feature "Bag Management", never exact', () => {
    const m = compareTitles(titled("Bag Management"), titled("Bag Management - iOS"));
    expect(m).toMatchObject({ kind: "probable" });
    expect(m!.why).toMatch(/platform/);
  });

  it("the same title with the same platform tag is still exact", () => {
    expect(compareTitles(titled("Bag Management - iOS"), titled("bag management - IOS"))).toMatchObject({ kind: "exact" });
  });

  it("stays fast and bounded on a pathological title", () => {
    const huge = "word ".repeat(5_000);
    const t0 = performance.now();
    compareTitles(titled(huge), titled(huge.slice(1)));
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
