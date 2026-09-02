/**
 * The course search, end to end through the real section.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { fuzzySearch } from "@/lib/fuzzy-search";

/** Shaped like the live Wedge data: a few active, a lot of sent, a lot added. */
const RECORDS = [
  { id: "1", courseName: "Iver Golf Vlub", country: "England", status: "NEW", notes: null },
  { id: "2", courseName: "HS2 Renovated Course (Home Course)", country: "United Kingdom", status: "NEW", notes: "From Big Wedge Golf" },
  { id: "3", courseName: "Ardlodge", country: "United Kingdom", status: "NEW", notes: null },
  { id: "4", courseName: "Dorking", country: "United Kingdom", status: "ADDED", notes: null },
  { id: "5", courseName: "Royal Ashdown Forest", country: "England", status: "SENT", notes: null },
  { id: "6", courseName: "Wentworth Club", country: "England", status: "ADDED", notes: null },
  { id: "7", courseName: "Sandy Lodge", country: "England", status: "REJECTED", notes: null },
];
const search = (q: string) =>
  fuzzySearch(RECORDS, q, (r) => [r.courseName, r.country, r.notes]);

describe("finding a course regardless of status", () => {
  it("finds an ADDED course — the whole point of the feature", () => {
    // "Has this been added?" must not depend on which tab is selected.
    const hit = search("dorking");
    expect(hit[0].id).toBe("4");
    expect(hit[0].status).toBe("ADDED");
  });

  it("finds a SENT course", () => {
    expect(search("ashdown")[0].status).toBe("SENT");
  });

  it("finds a REJECTED course", () => {
    expect(search("sandy")[0].status).toBe("REJECTED");
  });

  it("copes with the misspelling already in the data", () => {
    // The row says "Vlub"; the user types "club".
    expect(search("iver golf club").map((r) => r.id)).toContain("1");
  });

  it("copes with the user's misspelling", () => {
    expect(search("wentwerth")[0].id).toBe("6");
    expect(search("dokring")[0].id).toBe("4");
  });

  it("works from a few letters", () => {
    expect(search("ard")[0].id).toBe("3");
  });

  it("matches on country too", () => {
    expect(search("england").length).toBeGreaterThan(1);
  });

  it("returns nothing when the course really isn't there", () => {
    // The answer "no" has to be trustworthy, or the feature is worse than useless.
    expect(search("st andrews")).toEqual([]);
  });
});
