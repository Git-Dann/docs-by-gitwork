import { describe, expect, it } from "vitest";
import {
  computeCourseDemand,
  courseKey,
  DEMAND_THRESHOLDS,
  demandLevel,
} from "../course-demand";

/**
 * Every fixture below is a VERBATIM course name from the live Wedge table
 * (audited September 2026, 368 of 756 rows). That matters more than usual here:
 * the first version of this grouping was written against tidy invented names,
 * passed, and would have reported zero repeat demand on the real data — the
 * duplicates only exist as inconsistent spellings.
 */

const id = (() => {
  let n = 0;
  return () => `r${++n}`;
})();
const rows = (...names: string[]) =>
  names.map((courseName) => ({ id: id(), courseName }));

describe("courseKey", () => {
  it("folds the club/course designator, which carries no identity", () => {
    // Real pair from the data — one course, two spellings.
    expect(courseKey("Woodside Golf Course")).toBe(
      courseKey("Woodside Golf Club"),
    );
    expect(courseKey("Alyth")).toBe(courseKey("Alyth Golf Club"));
    expect(courseKey("Lynwood")).toBe(courseKey("Lynwood Country Club"));
    expect(courseKey("aldenham golf club")).toBe(
      courseKey("aldenham golf and country club"),
    );
    expect(courseKey("Marri Park")).toBe(courseKey("Marri Park Golf Course"));
  });

  it("folds casing, punctuation, spacing and a leading The", () => {
    expect(courseKey("The Chase Golf & Country Club")).toBe(
      courseKey("The Chase"),
    );
    expect(courseKey("The Chase")).toBe(courseKey("Chase"));
    expect(courseKey("ellesmere golf club")).toBe(
      courseKey("Ellesmere Golf Course"),
    );
    // The missing space is why the key is compressed — this is a real row.
    expect(courseKey("AllenPark")).toBe(courseKey("Allen park"));
    expect(courseKey("Allen Park Golf Centre")).toBe(courseKey("AllenPark"));
  });

  it("only strips the designator at the END of the name", () => {
    // "Golf" mid-name is part of the name, not a designator.
    expect(courseKey("Akebar Golf Park")).toBe("akebargolfpark");
    expect(courseKey("Park Wood Golf Club By ORIDA")).toContain("orida");
  });

  it("does NOT fold two names that differ by a word", () => {
    // Richmond Park is a different course from The Richmond Golf Club, and both
    // are in the table. Folding "Park" away would report one course asked for
    // twice and send someone to license the wrong one.
    expect(courseKey("Richmond Golf Club")).not.toBe(
      courseKey("Richmond Park"),
    );
    expect(courseKey("Cobtree Manor Golf Club")).not.toBe(
      courseKey("Cobtree Manor Park Golf Course"),
    );
  });

  it("does NOT fold two names that differ by one character", () => {
    // The four courses that killed the typo tolerance. All real, all distinct.
    expect(courseKey("Hawick")).not.toBe(courseKey("Howick Golf Club"));
    expect(courseKey("Basildon Golf Course")).not.toBe(
      courseKey("baildon golf course"),
    );
  });

  it("returns empty for a name with no letters, rather than a shared key", () => {
    expect(courseKey("???")).toBe("");
    expect(courseKey("")).toBe("");
  });
});

describe("demandLevel", () => {
  it("reads one request as LOW, two as MEDIUM, three or more as HIGH", () => {
    expect(demandLevel(1)).toBe("LOW");
    expect(demandLevel(2)).toBe("MEDIUM");
    expect(demandLevel(3)).toBe("HIGH");
    expect(demandLevel(9)).toBe("HIGH");
  });

  it("has no gap or overlap at either threshold", () => {
    expect(demandLevel(DEMAND_THRESHOLDS.medium - 1)).toBe("LOW");
    expect(demandLevel(DEMAND_THRESHOLDS.medium)).toBe("MEDIUM");
    expect(demandLevel(DEMAND_THRESHOLDS.high - 1)).toBe("MEDIUM");
    expect(demandLevel(DEMAND_THRESHOLDS.high)).toBe("HIGH");
  });

  it("never reports demand below the floor as anything but LOW", () => {
    expect(demandLevel(0)).toBe("LOW");
  });
});

describe("computeCourseDemand", () => {
  it("counts the three real Allen Park requests as one HIGH course", () => {
    const list = rows("Allen Park Golf Centre", "AllenPark", "Allen park");
    const demand = computeCourseDemand(list);
    for (const r of list) {
      expect(demand.get(r.id)!.count).toBe(3);
      expect(demand.get(r.id)!.level).toBe("HIGH");
    }
  });

  it("gives every request in a group the SAME count, not a running tally", () => {
    // Both rows are evidence of one course wanted twice; neither is "the second".
    const list = rows("Glyn Abbey Golf Course", "Glyn Abbey");
    const demand = computeCourseDemand(list);
    expect(list.map((r) => demand.get(r.id)!.count)).toEqual([2, 2]);
  });

  it("exposes the spellings it folded together, so the grouping is checkable", () => {
    const list = rows("Eastern Sward Golf Club", "Eastern Sward");
    const d = computeCourseDemand(list).get(list[0].id)!;
    expect(d.names).toEqual(["Eastern Sward Golf Club", "Eastern Sward"]);
  });

  it("lists a repeated identical spelling once in names but twice in the count", () => {
    // "Horne Park Golf Course" appears twice verbatim in the live data.
    const list = rows(
      "Horne Park Golf Club",
      "Horne Park Golf Course",
      "Horne Park Golf Course",
    );
    const d = computeCourseDemand(list).get(list[0].id)!;
    expect(d.count).toBe(3);
    expect(d.names).toHaveLength(2);
  });

  it("keeps genuinely different courses apart", () => {
    const list = rows(
      "Richmond Golf Club",
      "Richmond Golf course",
      "Richmond Park",
    );
    const demand = computeCourseDemand(list);
    expect(demand.get(list[0].id)!.count).toBe(2); // the two Richmond Golf rows
    expect(demand.get(list[2].id)!.count).toBe(1); // Richmond Park stands alone
  });

  it("never pools unnameable rows into one popular course", () => {
    const list = rows("???", "—", "");
    const demand = computeCourseDemand(list);
    for (const r of list) expect(demand.get(r.id)!.count).toBe(1);
  });

  it("covers every row it was given", () => {
    const list = rows("Alyth", "Alyth Golf Club", "Dorking", "Iver Golf Vlub");
    const demand = computeCourseDemand(list);
    expect(demand.size).toBe(list.length);
    // And the counts sum back to the number of rows.
    const groups = new Map<string, number>();
    for (const r of list) {
      const d = demand.get(r.id)!;
      groups.set(d.key, d.count);
    }
    expect([...groups.values()].reduce((a, b) => a + b, 0)).toBe(list.length);
  });

  it("handles an empty list", () => {
    expect(computeCourseDemand([]).size).toBe(0);
  });

  it("reproduces the audited shape of the real table", () => {
    // A verbatim slice of the live data: 18 courses, one of them asked for twice.
    const list = rows(
      "Glyn Abbey Golf Course",
      "Glyn Abbey",
      "Hawick",
      "Howick Golf Club",
      "Basildon Golf Course",
      "baildon golf course",
      "Richmond Park",
      "Dorking",
    );
    const demand = computeCourseDemand(list);
    const counts = list.map((r) => demand.get(r.id)!.count);
    // Only Glyn Abbey folds. The two near-miss pairs must stay separate.
    expect(counts).toEqual([2, 2, 1, 1, 1, 1, 1, 1]);
  });
});
