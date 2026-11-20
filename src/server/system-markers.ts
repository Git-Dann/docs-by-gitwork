/**
 * "When did this last happen?" for the platform's own housekeeping: a scheduled job being
 * called, the last good backup, an alert already sent. One timestamp per name.
 *
 * Stored as a single `RateLimitHit` row per name, under the bucket `system:<name>`, so no new
 * table (Dan, Nov 2026: no new models in this programme). Writing a marker replaces the old row;
 * reading one returns its time. The rate limiter never touches these buckets: it only counts
 * and prunes the bucket it is asked about.
 */

import { prisma } from "@/lib/prisma";

const bucketOf = (name: string) => `system:${name}`;

/** Record that `name` happened now. Never throws: housekeeping must not fail what called it. */
export async function markSystem(name: string, at: Date = new Date()): Promise<void> {
  const bucket = bucketOf(name);
  try {
    await prisma.$transaction([
      prisma.rateLimitHit.deleteMany({ where: { bucket } }),
      prisma.rateLimitHit.create({ data: { bucket, createdAt: at } }),
    ]);
  } catch (err) {
    console.warn(`[system-markers] could not record ${name}: ${err instanceof Error ? err.message : err}`);
  }
}

/** Forget `name` (used to clear an alert latch). Never throws. */
export async function clearSystem(name: string): Promise<void> {
  try {
    await prisma.rateLimitHit.deleteMany({ where: { bucket: bucketOf(name) } });
  } catch (err) {
    console.warn(`[system-markers] could not clear ${name}: ${err instanceof Error ? err.message : err}`);
  }
}

/** When each of `names` last happened (null for never). One query. */
export async function readSystemMarkers(names: readonly string[]): Promise<Record<string, Date | null>> {
  const rows = await prisma.rateLimitHit.findMany({
    where: { bucket: { in: names.map(bucketOf) } },
    select: { bucket: true, createdAt: true },
  });
  const out: Record<string, Date | null> = Object.fromEntries(names.map((n) => [n, null]));
  for (const r of rows) {
    const name = r.bucket.slice("system:".length);
    const prev = out[name];
    if (!prev || r.createdAt > prev) out[name] = r.createdAt;
  }
  return out;
}

/**
 * A daily number kept beside the markers (the database's size), one row per day. The value is
 * in the bucket name (`system:series:<name>:<value>`) because a RateLimitHit row holds nothing
 * else; readings older than `keepDays` are deleted as new ones are written. Never throws.
 */
export async function recordDaily(name: string, value: number, at: Date = new Date(), keepDays = 14): Promise<void> {
  const prefix = `system:series:${name}:`;
  try {
    const dayStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
    await prisma.$transaction([
      // One reading per day: today's replaces any earlier one from today.
      prisma.rateLimitHit.deleteMany({ where: { bucket: { startsWith: prefix }, createdAt: { gte: dayStart } } }),
      prisma.rateLimitHit.deleteMany({ where: { bucket: { startsWith: prefix }, createdAt: { lt: new Date(at.getTime() - keepDays * 86_400_000) } } }),
      prisma.rateLimitHit.create({ data: { bucket: `${prefix}${Math.round(value)}`, createdAt: at } }),
    ]);
  } catch (err) {
    console.warn(`[system-markers] could not record ${name}: ${err instanceof Error ? err.message : err}`);
  }
}

export async function readDaily(name: string): Promise<Array<{ at: Date; value: number }>> {
  const prefix = `system:series:${name}:`;
  const rows = await prisma.rateLimitHit.findMany({
    where: { bucket: { startsWith: prefix } },
    select: { bucket: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return rows
    .map((r) => ({ at: r.createdAt, value: Number(r.bucket.slice(prefix.length)) }))
    .filter((r) => Number.isFinite(r.value));
}
