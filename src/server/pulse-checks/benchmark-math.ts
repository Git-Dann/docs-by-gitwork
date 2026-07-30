// ─────────────────────────────────────────────────────────────────────────────
// BENCHMARK MATHS — pure, so the boundary cases are tested rather than reasoned
// about, and so a unit test does not have to import the Prisma client.
//
// The DB side lives in pulse.ts (`getIndustryBenchmarks`). This file holds only
// the arithmetic and the sentence that must travel with it.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The percentile of `score` within `scores`, read as "the share of the corpus
 * this is at least as good as".
 *
 * The ≤ convention is deliberate: a score equal to every peer should read as
 * 100th percentile ("as good as every comparable project"), not 0th. The opposite
 * reading is plausible enough that it has its own test.
 */
export function percentileOf(score: number, scores: number[]): number {
  if (scores.length === 0) return 0;
  const atOrBelow = scores.filter((s) => s <= score).length;
  return Math.round((atOrBelow / scores.length) * 100);
}

/** The median of a score list. Returns 0 for an empty list rather than NaN. */
export function medianOf(scores: number[]): number {
  if (scores.length === 0) return 0;
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/**
 * The plain-English corpus statement that ships WITH the percentile.
 *
 * Not decoration. A percentile without its corpus is exactly the kind of number
 * that gets screenshotted into a board deck and outlives the caveat, so the
 * sentence has to be part of the figure rather than next to it.
 */
export function benchmarkCaveat(peerCount: number, segment: string, widened: boolean): string {
  const what = segment === "all"
    ? "every project scanned in this workspace"
    : `projects scanned as "${segment.replace(/_/g, " ").toLowerCase()}"`;
  return (
    `Compared against ${peerCount} ${what} in the last 12 months. ` +
    (widened
      ? "There were not yet enough scans of this platform specifically, so this ranks against everything — treat it " +
        "as indicative, since different project types have different achievable ceilings. "
      : "") +
    "This is Pulse's own scan history, not an industry survey: it says how this project compares to the others we " +
    "have looked at, which is a different claim from how it compares to the industry."
  );
}
