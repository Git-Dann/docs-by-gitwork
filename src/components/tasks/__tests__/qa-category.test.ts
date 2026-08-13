import { describe, expect, it } from "vitest";
import { isQaCategory } from "../gantt-chart";

/**
 * Which category becomes the slim QA track.
 *
 * Matched on the category NAME, not on the assignee — Syed is the QA tester but
 * isn't always the one assigned, so an assignee test would silently drop QA work
 * the moment anyone else picked it up. Category is the thing that's always true.
 *
 * Whole-word matching matters in both directions: a category called "Quality" or
 * "Qatar rollout" must stay a normal delivery bar, or a real phase of work
 * quietly shrinks to a 5px strip and disappears from the client's timeline.
 */

describe("isQaCategory", () => {
  it.each(["QA", "qa", "Qa", " QA ", "QA / Testing", "Manual QA", "QA & release", "Testing (QA)"])(
    "treats %s as the QA track",
    (name) => {
      expect(isQaCategory(name)).toBe(true);
    },
  );

  it.each([
    "Quality",
    "Quality Assurance",
    "Qatar rollout",
    "Mobile",
    "Frontend",
    "Backend",
    "Squad",
    "QAuery builder",
  ])("leaves %s as a normal delivery bar", (name) => {
    expect(isQaCategory(name)).toBe(false);
  });

  it("handles a missing name without throwing", () => {
    expect(isQaCategory(null)).toBe(false);
    expect(isQaCategory(undefined)).toBe(false);
    expect(isQaCategory("")).toBe(false);
  });
});
