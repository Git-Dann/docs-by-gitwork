import { normalise } from "./fuzzy-search";

/**
 * How many times a course has been asked for, and how loudly.
 *
 * Each `ClientCourseRequest` row is ONE submission from ONE golfer — Big Wedge
 * stamps the submission date into the notes, and rows for the same course carry
 * different ones — so the number of rows naming a course IS its demand. Nothing
 * is stored: the count is derived from the list on every read, which is why it is
 * correct for every request already in the table and for every new one without a
 * backfill or a schema change.
 *
 * Why the names have to be folded together:
 * golfers type the name freehand, so a course arrives spelled several ways and a
 * count keyed on the raw string is always 1. Audited against the live Wedge data
 * (September 2026, 368 rows sampled of 756): keying on the raw name found ZERO
 * repeat requests; folding the club/course designator, punctuation, casing and
 * spacing found 18 courses asked for twice or more, topping out at three —
 * "Allen Park Golf Centre", "AllenPark" and "Allen park", one of which says in
 * its own notes "I requested this over two weeks ago".
 */

/** A course asked for once is not evidence of demand; three golfers is. */
export const DEMAND_THRESHOLDS = { medium: 2, high: 3 } as const;

export const DEMAND_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type DemandLevel = (typeof DEMAND_LEVELS)[number];

export interface CourseDemand {
  /** Number of requests naming this course, this one included. */
  count: number;
  level: DemandLevel;
  /** The fold key, shared by every request counted together. */
  key: string;
  /** Every spelling counted together, so a reader can check the grouping. */
  names: string[];
}

/**
 * The redundant designator at the end of a course name, which carries no
 * identity: "Woodside Golf Course" and "Woodside Golf Club" are one course.
 * Anchored to the END, so a name that merely contains the word is untouched.
 */
const DESIGNATOR =
  /\s+(golf and country club|golf country club|golf club|golf course|golf centre|golf center|golf complex|country club|golf links|golf|gc)$/;

/**
 * The key two requests must share to be counted as the same course.
 *
 * Deliberately strict: it folds only what carries no identity — the trailing
 * designator, a leading "The", punctuation, casing and spacing. It will NOT fold
 * two names that differ by a word or by a typo, and that is the whole point.
 *
 * Do NOT add a typo tolerance here. It was tried, and on the live data a
 * one-character allowance merged Hawick (Scotland) with Howick (New Zealand),
 * and Basildon (Essex) with Baildon (West Yorkshire) — four real, different
 * courses reported as two. `country` cannot rescue it either: the field is
 * polluted with raw UUIDs from the intake and disagrees with itself ("England" /
 * "United Kingdom" / "Scotland") for the same place. Under-counting a genuine
 * misspelling is the safe error; inventing demand sends someone off to license a
 * course nobody asked for.
 */
export function courseKey(name: string): string {
  let key = normalise(name);
  if (key.startsWith("the ")) key = key.slice(4);
  // Loop: "X Golf Club Golf" and similar doubled tails appear in the real data.
  for (let prev = ""; prev !== key;) {
    prev = key;
    key = key.replace(DESIGNATOR, "").trim();
  }
  // Compressed, so "AllenPark" and "Allen park" land on the same key.
  return key.replace(/\s+/g, "");
}

export function demandLevel(count: number): DemandLevel {
  if (count >= DEMAND_THRESHOLDS.high) return "HIGH";
  if (count >= DEMAND_THRESHOLDS.medium) return "MEDIUM";
  return "LOW";
}

/**
 * Demand for every request in `rows`, keyed by request id.
 *
 * Pass the COMPLETE set of requests, never a filtered view — demand is a property
 * of the course across every status. Counting inside the "New" tab would report 1
 * for a course three golfers asked for that was sent months ago.
 */
export function computeCourseDemand<
  T extends { id: string; courseName: string },
>(rows: readonly T[]): Map<string, CourseDemand> {
  const groups = new Map<string, { names: string[]; ids: string[] }>();

  for (const row of rows) {
    // A name that folds to nothing (punctuation only) gets its own group, so
    // unnameable rows are never pooled together as one wildly popular course.
    const key = courseKey(row.courseName) || ` ${row.id}`;
    const group = groups.get(key) ?? { names: [], ids: [] };
    if (!group.names.includes(row.courseName)) group.names.push(row.courseName);
    group.ids.push(row.id);
    groups.set(key, group);
  }

  const byId = new Map<string, CourseDemand>();
  for (const [key, group] of groups) {
    const count = group.ids.length;
    const demand: CourseDemand = {
      count,
      level: demandLevel(count),
      key,
      names: group.names,
    };
    for (const id of group.ids) byId.set(id, demand);
  }
  return byId;
}
