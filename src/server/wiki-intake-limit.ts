/**
 * Abuse protection for the public client-intake API — Postgres-backed, no Redis
 * and no new table, mirroring src/server/pulse-lite/rate-limit.ts.
 *
 * The risk this addresses: the intake token is the ONLY gate on a public write
 * endpoint, so a buggy loop in a client's integration could bury the Requests
 * page in thousands of rows and notify the dev team for each batch. Before this
 * there was no ceiling at all.
 *
 * It counts what actually lands — intake rows created for this wiki in the recent
 * window — rather than raw request rate. That's the honest thing to cap here:
 * a retry loop resending the same `externalRef` is already deduped to zero rows
 * (so it can't flood anything), while genuinely new items are exactly what needs
 * a ceiling. A true requests-per-second limiter would need a counter store; if
 * request volume ever becomes the problem, that's the next step, not this.
 *
 * Caps are deliberately generous: a client backfilling a real backlog should
 * succeed, a runaway loop should not.
 */

import { prisma } from "@/lib/prisma";

/** Carries 429 so `fromError` maps it to "Too Many Requests". */
export class IntakeRateLimitedError extends Error {
  readonly status = 429;
  constructor(message: string) {
    super(message);
    this.name = "IntakeRateLimitedError";
  }
}

/** One big batch (200) plus headroom, so normal bulk syncs pass. */
const PER_WIKI_PER_HOUR = 300;
/** Enough for a substantial first-time backfill spread over a day. */
const PER_WIKI_PER_DAY = 1000;

/**
 * The decision, kept PURE so the thresholds are unit-testable without a database
 * — this codebase tests logic, not mocks. `assertWithinIntakeQuota` below is the
 * thin DB wrapper around it.
 *
 * Returns null when the push is allowed, or the message to reject it with.
 */
export function intakeQuotaBreach(counts: { hour: number; day: number }): string | null {
  if (counts.hour >= PER_WIKI_PER_HOUR) {
    return `Too many requests created in the last hour (limit ${PER_WIKI_PER_HOUR}). Existing items are unaffected — pause the integration and retry later.`;
  }
  if (counts.day >= PER_WIKI_PER_DAY) {
    return `Daily limit of ${PER_WIKI_PER_DAY} new requests reached. Existing items are unaffected — retry tomorrow, or contact Gitwork if you genuinely need a larger backfill.`;
  }
  return null;
}

/** Exposed so tests and docs quote the same numbers as the code. */
export const INTAKE_QUOTA = { perHour: PER_WIKI_PER_HOUR, perDay: PER_WIKI_PER_DAY } as const;

/**
 * Throws if this wiki has already taken its fill of new intake items.
 *
 * Checked BEFORE writing, and counts only rows this API created (`source: "api"`)
 * so requests filed by hand in the wiki UI can never be blocked by a client's
 * misbehaving integration — the team must always be able to log a request.
 */
export async function assertWithinIntakeQuota(wikiId: string): Promise<void> {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);

  const [hour, day] = await Promise.all([
    prisma.clientWikiIntakeItem.count({
      where: { wikiId, source: "api", createdAt: { gte: hourAgo } },
    }),
    prisma.clientWikiIntakeItem.count({
      where: { wikiId, source: "api", createdAt: { gte: dayAgo } },
    }),
  ]);

  const breach = intakeQuotaBreach({ hour, day });
  if (breach) throw new IntakeRateLimitedError(breach);
}
