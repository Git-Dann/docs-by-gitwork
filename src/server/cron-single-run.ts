import { prisma } from "@/lib/prisma";

/**
 * Run `fn` only if no other process is running the same `key` right now; otherwise return null.
 *
 * For a scheduled job that may be triggered twice at once, e.g. a line in two crontabs (the
 * repo-managed one and an old hand-installed one). Holds a transaction-scoped Postgres advisory
 * lock for the length of `fn`, so the second caller skips instead of repeating the work. It does
 * not queue: a skipped run is simply not needed, because the one holding the lock did it.
 */
export async function runOnce<T>(key: string, fn: () => Promise<T>, timeoutMs = 25_000): Promise<T | null> {
  return prisma.$transaction(
    async (tx) => {
      // pg_try_advisory_xact_lock returns a boolean, so $queryRaw (unlike the void
      // pg_advisory_xact_lock, which must go through $executeRaw).
      const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${`cron:${key}`})) AS locked`;
      if (!rows[0]?.locked) return null;
      return fn();
    },
    { timeout: timeoutMs, maxWait: 5_000 },
  );
}
