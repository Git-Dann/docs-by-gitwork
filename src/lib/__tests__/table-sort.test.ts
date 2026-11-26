import { describe, expect, it } from "vitest";
import { compareSortValues, dateValue, nextSort, sortRows } from "@/lib/table-sort";

describe("table-sort", () => {
  it("puts empties last in both directions", () => {
    const rows = [{ v: 3 }, { v: null }, { v: 1 }, { v: undefined }, { v: 2 }];
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.v)).toEqual([1, 2, 3, null, undefined]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v)).toEqual([3, 2, 1, null, undefined]);
    // A blank string and an invalid date count as empty too.
    expect(compareSortValues("", "a", "asc")).toBeGreaterThan(0);
    expect(compareSortValues(new Date("nope"), new Date(0), "desc")).toBeGreaterThan(0);
  });

  it("compares text ignoring case and accents, with numbers in natural order", () => {
    const names = ["v10", "Émile", "apple", "v2", "Banana", "emile"];
    expect(sortRows(names, (n) => n, "asc")).toEqual(["apple", "Banana", "Émile", "emile", "v2", "v10"]);
  });

  it("is stable: equal rows keep the order they came in", () => {
    const rows = [
      { id: "a", n: 1 },
      { id: "b", n: 2 },
      { id: "c", n: 1 },
      { id: "d", n: 2 },
    ];
    expect(sortRows(rows, (r) => r.n, "desc").map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
    expect(sortRows(rows, (r) => r.n, "asc").map((r) => r.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("does not mutate the input", () => {
    const rows = [3, 1, 2];
    sortRows(rows, (r) => r, "asc");
    expect(rows).toEqual([3, 1, 2]);
  });

  it("flips the same column, and starts a new one in its natural direction", () => {
    expect(nextSort(null, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort(null, "count", "desc")).toEqual({ key: "count", dir: "desc" });
    expect(nextSort({ key: "count", dir: "desc" }, "count", "desc")).toEqual({ key: "count", dir: "asc" });
    expect(nextSort({ key: "count", dir: "asc" }, "name")).toEqual({ key: "name", dir: "asc" });
  });

  it("reads ISO dates, and anything unreadable is empty", () => {
    expect(dateValue("2026-11-26T10:00:00Z")).toBe(Date.parse("2026-11-26T10:00:00Z"));
    expect(dateValue(null)).toBeNull();
    expect(dateValue("not a date")).toBeNull();
    const rows = ["2026-01-02", null, "2026-03-04"];
    expect(sortRows(rows, dateValue, "desc")).toEqual(["2026-03-04", "2026-01-02", null]);
  });
});
