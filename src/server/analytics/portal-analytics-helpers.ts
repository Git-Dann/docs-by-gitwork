/**
 * Pure, dependency-free helpers for Portal analytics — UTC date bucketing + tallies.
 * Kept separate from `portal-analytics.ts` (which pulls in Prisma + the auth/roster graph) so
 * these can be unit-tested in isolation, matching the repo's pure-function split (e.g. curator).
 */

const MS_PER_DAY = 86_400_000;

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Monday (inclusive) of the ISO week containing `d`. */
export function startOfIsoWeek(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const sinceMonday = (day + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday));
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function bucketKey(d: Date, bucket: "day" | "week"): string {
  return ymd(bucket === "week" ? startOfIsoWeek(d) : startOfUtcDay(d));
}

/** Every bucket key in [from, to], so the time-series has no gaps for the sparkline. */
function seedBuckets(from: Date, to: Date, bucket: "day" | "week"): Map<string, { created: number; completed: number }> {
  const seeded = new Map<string, { created: number; completed: number }>();
  let cursor = bucket === "week" ? startOfIsoWeek(from) : startOfUtcDay(from);
  const end = startOfUtcDay(to);
  // Guard against a runaway loop on absurd ranges (still generous: ~5y of days).
  for (let i = 0; cursor <= end && i < 2000; i += 1) {
    seeded.set(ymd(cursor), { created: 0, completed: 0 });
    cursor = new Date(cursor.getTime() + (bucket === "week" ? 7 : 1) * MS_PER_DAY);
  }
  return seeded;
}

/**
 * Pure gapless throughput series: created + completed counts per bucket across [from, to],
 * sorted ascending. Every bucket in range is present even with zero activity (no sparkline gaps).
 */
export function buildThroughput(
  createdDates: Date[],
  completedDates: Date[],
  from: Date,
  to: Date,
  bucket: "day" | "week",
): Array<{ bucket: string; created: number; completed: number }> {
  const buckets = seedBuckets(from, to, bucket);
  for (const d of createdDates) {
    const b = buckets.get(bucketKey(d, bucket));
    if (b) b.created += 1;
  }
  for (const d of completedDates) {
    const b = buckets.get(bucketKey(d, bucket));
    if (b) b.completed += 1;
  }
  return [...buckets.entries()]
    .map(([b, v]) => ({ bucket: b, created: v.created, completed: v.completed }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/** Pure per-dev completion/lead tally from the completed-task rows (m-n + legacy, deduped). */
export function tallyDevOutput(
  rows: Array<{ startedAt: Date | null; completedAt: Date | null; assigneeId: string | null; assignees: { id: string }[] }>,
  devIds: string[],
): Map<string, { completed: number; leadSum: number; leadN: number }> {
  const devSet = new Set(devIds);
  const out = new Map<string, { completed: number; leadSum: number; leadN: number }>();
  for (const t of rows) {
    const lead = t.startedAt && t.completedAt ? Math.max(0, t.completedAt.getTime() - t.startedAt.getTime()) : null;
    const ids = new Set<string>(t.assignees.map((a) => a.id));
    if (t.assigneeId) ids.add(t.assigneeId);
    for (const id of ids) {
      if (!devSet.has(id)) continue;
      const cur = out.get(id) ?? { completed: 0, leadSum: 0, leadN: 0 };
      cur.completed += 1;
      if (lead != null) {
        cur.leadSum += lead;
        cur.leadN += 1;
      }
      out.set(id, cur);
    }
  }
  return out;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
