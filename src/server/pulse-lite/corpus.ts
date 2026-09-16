/**
 * The public-scan corpus — anonymous score statistics that outlive the raw rows.
 *
 * Every anonymous scan is a data point, and until now every one was thrown away:
 * `PulseLiteScan` has a 7-day `expiresAt` and the reconcile cron deletes it, with
 * nothing aggregating first. That is the corpus the competition has and Pulse was
 * deleting on a schedule.
 *
 * Two deliberate choices:
 *
 *  1. **Written at scan completion, not at prune time.** Several crons in this
 *     deployment have never run (docs/vps-crons.md records the curator, foreman,
 *     retention and jobs workers as "NOTHING — never runs"). A corpus that depends
 *     on a cron is a corpus that stays empty.
 *
 *  2. **A histogram, not the scores.** Ten 10-point buckets give percentiles while
 *     retaining nothing about any individual scan — no URL, no host, no IP, no
 *     email. The privacy posture of the 7-day delete is unchanged; only the
 *     statistics survive.
 *
 * Everything below the DB write is pure, so the maths is testable without a
 * database — which matters, because there isn't one locally.
 */

import { prisma } from "@/lib/prisma";

export const BUCKET_COUNT = 10;

/** Sentinel for the cross-segment row. See the schema comment on `segment`. */
export const ALL_SEGMENTS = "ALL";

/** Index 0 = 0-9, 9 = 90-100. 100 belongs in the top bucket, not an 11th. */
export function bucketFor(score: number): number {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return Math.min(BUCKET_COUNT - 1, Math.floor(clamped / 10));
}

export function emptyBuckets(): number[] {
  return Array.from({ length: BUCKET_COUNT }, () => 0);
}

/**
 * Coerce whatever came out of the Json column into a valid bucket array.
 *
 * Defensive on purpose: this reads a `Json` column, so a hand-edited or
 * partially-written value must degrade to zeroes rather than poisoning the
 * arithmetic with NaN — a corrupt percentile is worse than an absent one.
 */
export function normaliseBuckets(raw: unknown): number[] {
  const out = emptyBuckets();
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < BUCKET_COUNT; i++) {
    const v = raw[i];
    out[i] = typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  }
  return out;
}

/** Fold one score into a histogram. Pure. */
export function addScore(buckets: number[], score: number): number[] {
  const next = normaliseBuckets(buckets);
  next[bucketFor(score)] += 1;
  return next;
}

export interface Distribution {
  scanCount: number;
  scoreSum: number;
  buckets: number[];
}

/**
 * What share of the corpus scored BELOW this score, as a whole percent.
 *
 * Returns null when the corpus is too small to say anything honest. That is the
 * point: CLAUDE.md is emphatic that a figure ships with its caveat, and the worst
 * possible version of this feature is a confident percentile drawn from nine scans.
 *
 * Resolution is inherently 10 points — the score's own bucket is counted as half,
 * the standard midpoint convention for a histogram, rather than pretending to know
 * where inside the bucket it fell.
 */
export function percentileOf(score: number, dist: Distribution, minimumCorpus = 30): number | null {
  const buckets = normaliseBuckets(dist.buckets);
  const total = buckets.reduce((a, b) => a + b, 0);
  if (total < minimumCorpus) return null;

  const idx = bucketFor(score);
  const below = buckets.slice(0, idx).reduce((a, b) => a + b, 0);
  const within = buckets[idx];
  return Math.round(((below + within / 2) / total) * 100);
}

/** Mean score across the corpus, or null when there is nothing to average. */
export function meanOf(dist: Distribution): number | null {
  if (dist.scanCount <= 0) return null;
  return Math.round(dist.scoreSum / dist.scanCount);
}

/**
 * The sentence that must travel with any figure derived from this corpus.
 *
 * A percentile gets screenshotted into a deck and outlives its context, so the
 * caveat is generated WITH the number rather than left to whoever renders it —
 * the exact mistake the existing benchmark made (it computed a caveat and threw it
 * away before it reached a screen).
 */
export function corpusCaveat(dist: Distribution, segment: string): string {
  const scope = segment && segment !== ALL_SEGMENTS
    ? `${segment.toLowerCase().replace(/_/g, " ")} sites`
    : "sites";
  return (
    `Based on ${dist.scanCount} free Pulse scans of ${scope} run through this scanner — `
    + `Gitwork's own scan history, not an industry survey. Sites scanned here are `
    + `self-selected, so treat this as a rough bearing rather than a market benchmark.`
  );
}

/** "YYYY-MM" for a given instant, UTC. */
export function monthKeyFor(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Record one completed public scan in the corpus.
 *
 * Best-effort and never throws: this runs after a visitor's scan has already
 * succeeded, and a statistics write must never turn a good scan into a failure.
 * Writes two rows — the segment's and the all-segments row — so a percentile can be
 * given against either.
 */
export async function recordScanInCorpus(params: {
  score: number | null;
  segment: string | null;
  at?: Date;
}): Promise<void> {
  const { score, segment } = params;
  if (score == null || !Number.isFinite(score)) return;
  const month = monthKeyFor(params.at ?? new Date());

  // The all-segments row is always written; the specific segment as well when known.
  const segments: string[] = segment && segment !== ALL_SEGMENTS ? [ALL_SEGMENTS, segment] : [ALL_SEGMENTS];

  for (const seg of segments) {
    try {
      const existing = await prisma.pulseScoreDistribution.findUnique({
        where: { month_segment: { month, segment: seg } },
        select: { id: true, buckets: true },
      });
      if (existing) {
        await prisma.pulseScoreDistribution.update({
          where: { id: existing.id },
          data: {
            scanCount: { increment: 1 },
            scoreSum: { increment: Math.round(score) },
            buckets: addScore(normaliseBuckets(existing.buckets), score),
          },
        });
      } else {
        await prisma.pulseScoreDistribution.create({
          data: {
            month,
            segment: seg,
            scanCount: 1,
            scoreSum: Math.round(score),
            buckets: addScore(emptyBuckets(), score),
          },
        });
      }
    } catch {
      // Statistics are not worth failing a visitor's scan over. A lost data point
      // is acceptable; a 500 on a successful scan is not.
    }
  }
}

/** Read the corpus for a segment, falling back to all-segments. Null when empty. */
export async function readCorpus(segment: string | null, month?: string): Promise<{
  dist: Distribution;
  segment: string;
  widened: boolean;
} | null> {
  const wanted = segment && segment !== ALL_SEGMENTS ? [ALL_SEGMENTS, segment] : [ALL_SEGMENTS];
  const rows = await prisma.pulseScoreDistribution.findMany({
    where: { ...(month ? { month } : {}), segment: { in: wanted } },
    select: { segment: true, scanCount: true, scoreSum: true, buckets: true },
  });
  if (rows.length === 0) return null;

  const fold = (subset: typeof rows): Distribution => ({
    scanCount: subset.reduce((a, r) => a + r.scanCount, 0),
    scoreSum: subset.reduce((a, r) => a + r.scoreSum, 0),
    buckets: subset.reduce<number[]>(
      (acc, r) => normaliseBuckets(r.buckets).map((v, i) => v + (acc[i] ?? 0)),
      emptyBuckets(),
    ),
  });

  if (segment && segment !== ALL_SEGMENTS) {
    const segmented = rows.filter((r) => r.segment === segment);
    if (segmented.length > 0) {
      const dist = fold(segmented);
      // Only use the narrow segment when it is genuinely big enough to mean
      // something; otherwise widen — and SAY that it was widened.
      if (dist.scanCount >= 30) return { dist, segment, widened: false };
    }
  }
  const all = rows.filter((r) => r.segment === ALL_SEGMENTS);
  if (all.length === 0) return null;
  return { dist: fold(all), segment: ALL_SEGMENTS, widened: Boolean(segment) && segment !== ALL_SEGMENTS };
}
