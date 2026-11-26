/**
 * Sorting course requests (Luke at Big Wedge: "so I can always submit the most requested").
 */
import { describe, expect, it } from "vitest";
import { computeCourseDemand } from "@/lib/course-demand";
import { DEFAULT_COURSE_SORT, nextCourseSort, sortCourseRequests } from "@/lib/course-request-sort";

const r = (id: string, courseName: string, over: Partial<{ country: string | null; createdAt: string; sentAt: string | null; status: string }> = {}) => ({
  id,
  courseName,
  country: "United Kingdom",
  createdAt: "2026-11-01T09:00:00.000Z",
  sentAt: null,
  status: "NEW",
  ...over,
});

const rows = [
  r("d1", "Dorking", { createdAt: "2026-11-20T09:00:00.000Z" }),
  r("a1", "Allen Park Golf Centre", { createdAt: "2026-11-02T09:00:00.000Z" }),
  r("b1", "Brechin", { country: null, createdAt: "2026-11-10T09:00:00.000Z", sentAt: "2026-11-12T09:00:00.000Z", status: "SENT" }),
  r("a2", "AllenPark", { createdAt: "2026-11-05T09:00:00.000Z" }),
  r("a3", "Allen park", { createdAt: "2026-11-03T09:00:00.000Z" }),
];
const demand = computeCourseDemand(rows);
const ids = (list: Array<{ id: string }>) => list.map((x) => x.id);

describe("sortCourseRequests", () => {
  it("Most requested: the most asked-for course first, its requests together, newest first", () => {
    const out = ids(sortCourseRequests(rows, { key: "demand", dir: "desc" }, demand));
    expect(out.slice(0, 3)).toEqual(["a2", "a3", "a1"]);
    expect(new Set(out.slice(3))).toEqual(new Set(["d1", "b1"]));
  });

  it("Newest first is the default, and dates sort both ways", () => {
    expect(ids(sortCourseRequests(rows, DEFAULT_COURSE_SORT, demand))).toEqual(["d1", "b1", "a2", "a3", "a1"]);
    expect(ids(sortCourseRequests(rows, { key: "submitted", dir: "asc" }, demand))).toEqual(["a1", "a3", "a2", "b1", "d1"]);
  });

  it("names sort A–Z ignoring case", () => {
    expect(ids(sortCourseRequests(rows, { key: "course", dir: "asc" }, demand))).toEqual(["a3", "a1", "a2", "b1", "d1"]);
  });

  it("an empty value goes last whichever way the column is flipped", () => {
    expect(ids(sortCourseRequests(rows, { key: "country", dir: "asc" }, demand)).at(-1)).toBe("b1");
    expect(ids(sortCourseRequests(rows, { key: "country", dir: "desc" }, demand)).at(-1)).toBe("b1");
    expect(ids(sortCourseRequests(rows, { key: "sent", dir: "desc" }, demand))[0]).toBe("b1");
    expect(ids(sortCourseRequests(rows, { key: "sent", dir: "asc" }, demand))[0]).toBe("b1");
  });

  it("clicking a column flips it; a new column starts in its natural direction", () => {
    expect(nextCourseSort(DEFAULT_COURSE_SORT, "submitted")).toEqual({ key: "submitted", dir: "asc" });
    expect(nextCourseSort(DEFAULT_COURSE_SORT, "demand")).toEqual({ key: "demand", dir: "desc" });
    expect(nextCourseSort(DEFAULT_COURSE_SORT, "course")).toEqual({ key: "course", dir: "asc" });
  });
});
