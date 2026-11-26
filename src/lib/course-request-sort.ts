/**
 * Sorting course requests (Luke at Big Wedge, Nov 2026: "so I can always submit the most
 * requested"). Pure, so the table, the phone cards and the tests agree.
 *
 * - Demand sorts by how many golfers asked for the course (the same count the Demand column
 *   shows), and keeps one course's requests together, newest first, so "Most requested" reads as
 *   a list of courses, not a shuffle.
 * - An empty value (no country, never sent) goes last in BOTH directions: flipping the order
 *   never pushes the blanks to the top.
 * - Ties keep the list's own order, so a stable, predictable result.
 */
import type { CourseDemand } from "@/lib/course-demand";

export type CourseSortKey = "submitted" | "demand" | "course" | "country" | "sent" | "status";
export type CourseSortDir = "asc" | "desc";
export interface CourseSort {
  key: CourseSortKey;
  dir: CourseSortDir;
}

/** Newest first: the order the list has always had. */
export const DEFAULT_COURSE_SORT: CourseSort = { key: "submitted", dir: "desc" };

/** The direction a column starts in when first clicked: counts and dates high-to-recent first. */
export const FIRST_DIR: Record<CourseSortKey, CourseSortDir> = {
  submitted: "desc",
  demand: "desc",
  course: "asc",
  country: "asc",
  sent: "desc",
  status: "asc",
};

export const COURSE_SORT_LABEL: Record<CourseSortKey, string> = {
  submitted: "Submitted",
  demand: "Demand",
  course: "Course",
  country: "Country",
  sent: "Sent",
  status: "Status",
};

/** Clicking a column: the same one flips, a new one starts in its natural direction. */
export function nextCourseSort(current: CourseSort, key: CourseSortKey): CourseSort {
  return current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: FIRST_DIR[key] };
}

const STATUS_ORDER: Record<string, number> = { NEW: 0, SENT: 1, ADDED: 2, REJECTED: 3 };

interface Sortable {
  id: string;
  courseName: string;
  country: string | null;
  createdAt: string;
  sentAt?: string | null;
  status: string;
}

const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

export function sortCourseRequests<T extends Sortable>(
  rows: readonly T[],
  sort: CourseSort,
  demand: ReadonlyMap<string, CourseDemand>,
  /** Countries that aren't readable (raw ids) count as empty, as the table shows "—". */
  countryOf: (r: T) => string | null = (r) => r.country,
): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const order = new Map(rows.map((r, i) => [r.id, i]));
  const byText = (a: string | null, b: string | null) => {
    const x = a?.trim() || null;
    const y = b?.trim() || null;
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return sign * x.localeCompare(y, "en-GB", { sensitivity: "base", numeric: true });
  };
  const byNumber = (a: number | null, b: number | null) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return sign * (a - b);
  };
  const cmp = (a: T, b: T): number => {
    switch (sort.key) {
      case "submitted":
        return byNumber(time(a.createdAt), time(b.createdAt));
      case "sent":
        return byNumber(time(a.sentAt), time(b.sentAt));
      case "course":
        return byText(a.courseName, b.courseName);
      case "country":
        return byText(countryOf(a), countryOf(b));
      case "status":
        return byNumber(STATUS_ORDER[a.status] ?? 9, STATUS_ORDER[b.status] ?? 9);
      case "demand": {
        const da = demand.get(a.id);
        const db = demand.get(b.id);
        const n = byNumber(da?.count ?? 1, db?.count ?? 1);
        if (n) return n;
        // Same demand: keep each course's requests together, newest first within it.
        const k = (da?.key ?? a.id).localeCompare(db?.key ?? b.id);
        if (k) return k;
        return (time(b.createdAt) ?? 0) - (time(a.createdAt) ?? 0);
      }
    }
  };
  return [...rows].sort((a, b) => cmp(a, b) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
