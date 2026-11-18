/**
 * How much a client can add to their Board, and how often the team hears about it.
 *
 * The Board writes real tasks to the team's board and each one notifies people, so a script, or
 * a client user with a stuck form, could bury the board in cards and the team in push
 * notifications. The per-IP limit on the routes (240 writes a minute) is a wall for a runaway
 * loop on one connection, not a ceiling on what lands. These caps count what actually landed for
 * THIS client, the same way src/server/wiki-intake-limit.ts does for the intake API.
 *
 * The thresholds are pure so they can be tested without a database; the wrappers below only
 * count. Generous for a client planning a release (thirty new cards in an hour is a long
 * session), a wall for anything automated.
 */

import { prisma } from "@/lib/prisma";

export const BOARD_QUOTA = {
  cardsPerHour: 30,
  cardsPerDay: 200,
  feedbackPerHour: 60,
  /** Edits to cards (each is one entry in a card's thread), per wiki. */
  editsPerHour: 120,
  /** Screenshots uploaded, per wiki. */
  uploadsPerHour: 50,
  uploadsPerDay: 200,
  /** The team hears about a client's edits to one card at most once in this window. */
  changeNotifyWindowMs: 10 * 60 * 1000,
  /** The team hears about new client cards at most once in this window, with a count. */
  notifyWindowMs: 10 * 60 * 1000,
} as const;

/** Carries 429 so `fromError` maps it to "Too Many Requests". */
export class BoardRateLimitedError extends Error {
  readonly status = 429;
  constructor(message: string) {
    super(message);
    this.name = "BoardRateLimitedError";
  }
}

/** Null when another card is allowed, otherwise what to tell the client. */
export function boardCardQuotaBreach(counts: { hour: number; day: number }): string | null {
  if (counts.hour >= BOARD_QUOTA.cardsPerHour) {
    return `That's ${BOARD_QUOTA.cardsPerHour} new cards in the last hour, the most the board takes at once. Your cards are all saved; add more in a little while.`;
  }
  if (counts.day >= BOARD_QUOTA.cardsPerDay) {
    return `That's ${BOARD_QUOTA.cardsPerDay} new cards today, the most the board takes in a day. Your cards are all saved; add more tomorrow, or ask Gitwork to import a larger list.`;
  }
  return null;
}

/** Null when more feedback is allowed, otherwise what to tell the client. */
export function boardFeedbackQuotaBreach(hour: number): string | null {
  if (hour >= BOARD_QUOTA.feedbackPerHour) {
    return `That's ${BOARD_QUOTA.feedbackPerHour} comments in the last hour, the most the board takes. Everything you've written is saved; try again in a little while.`;
  }
  return null;
}

/** Null when another edit is allowed, otherwise what to tell the client. */
export function boardEditQuotaBreach(hour: number): string | null {
  if (hour >= BOARD_QUOTA.editsPerHour) {
    return `That's ${BOARD_QUOTA.editsPerHour} changes in the last hour, the most the board takes. Everything you've changed is saved; try again in a little while.`;
  }
  return null;
}

/** Null when `adding` more screenshots fit, otherwise what to tell the client. */
export function boardUploadQuotaBreach(counts: { hour: number; day: number }, adding: number): string | null {
  if (counts.hour + adding > BOARD_QUOTA.uploadsPerHour) {
    return `That would be more than ${BOARD_QUOTA.uploadsPerHour} screenshots in an hour, the most the board takes. Add the rest in a little while.`;
  }
  if (counts.day + adding > BOARD_QUOTA.uploadsPerDay) {
    return `That would be more than ${BOARD_QUOTA.uploadsPerDay} screenshots today, the most the board takes in a day. Add the rest tomorrow.`;
  }
  return null;
}

/** Whether the team should hear about a client's edit to a card, given the last edit before it. */
export function shouldNotifyCardChange(previousChangeAt: Date | null, now: Date): boolean {
  return !previousChangeAt || now.getTime() - previousChangeAt.getTime() >= BOARD_QUOTA.changeNotifyWindowMs;
}

/** Whether the team should be told about new client cards now, given when they last were. */
export function shouldNotifyBoardCards(lastNotifiedAt: Date | null, now: Date): boolean {
  return !lastNotifiedAt || now.getTime() - lastNotifiedAt.getTime() >= BOARD_QUOTA.notifyWindowMs;
}

/**
 * Cards a client added on this board in a window. Read from the marker every client-added card
 * carries (`metadata.createdByClient`), so cards the team makes, or an import writes, never count
 * against the client.
 */
export async function countClientCards(clientId: string, since: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM "Task"
    WHERE "clientId" = ${clientId}
      AND "createdAt" >= ${since}
      AND "metadata" ? 'createdByClient'`;
  return Number(rows[0]?.n ?? 0);
}

export async function assertWithinBoardCardQuota(clientId: string): Promise<void> {
  const now = Date.now();
  const [hour, day] = await Promise.all([
    countClientCards(clientId, new Date(now - 60 * 60 * 1000)),
    countClientCards(clientId, new Date(now - 24 * 60 * 60 * 1000)),
  ]);
  const breach = boardCardQuotaBreach({ hour, day });
  if (breach) throw new BoardRateLimitedError(breach);
}

/** The client's own feedback on this wiki in the last hour. The team's replies never count. */
export async function assertWithinBoardFeedbackQuota(wikiId: string): Promise<void> {
  const hour = await prisma.taskClientFeedback.count({
    // Change entries are written by the board, not typed: they count against edits instead.
    where: { wikiId, authorUserId: null, kind: { not: "change" }, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  const breach = boardFeedbackQuotaBreach(hour);
  if (breach) throw new BoardRateLimitedError(breach);
}

/** The client's edits on this wiki in the last hour: one change entry each. */
export async function assertWithinBoardEditQuota(wikiId: string): Promise<void> {
  const hour = await prisma.taskClientFeedback.count({
    where: { wikiId, authorUserId: null, kind: "change", createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  const breach = boardEditQuotaBreach(hour);
  if (breach) throw new BoardRateLimitedError(breach);
}

const uploadBucket = (wikiId: string) => `board:upload:${wikiId}`;

/**
 * The client's screenshot uploads on this wiki, counted per file in the rate-limit table under the
 * wiki's own bucket (an attachment row doesn't say who uploaded it from where). Checked before
 * anything is stored; `recordBoardUploads` counts them once they are.
 */
export async function assertWithinBoardUploadQuota(wikiId: string, adding: number): Promise<void> {
  const now = Date.now();
  const [hour, day] = await Promise.all([
    prisma.rateLimitHit.count({ where: { bucket: uploadBucket(wikiId), createdAt: { gte: new Date(now - 60 * 60 * 1000) } } }),
    prisma.rateLimitHit.count({ where: { bucket: uploadBucket(wikiId), createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } } }),
  ]);
  const breach = boardUploadQuotaBreach({ hour, day }, adding);
  if (breach) throw new BoardRateLimitedError(breach);
}

export async function recordBoardUploads(wikiId: string, n: number): Promise<void> {
  if (n <= 0) return;
  await prisma.rateLimitHit.createMany({ data: Array.from({ length: n }, () => ({ bucket: uploadBucket(wikiId) })) });
  // Nothing older than a day is ever counted, so it needn't be kept.
  void prisma.rateLimitHit
    .deleteMany({ where: { bucket: uploadBucket(wikiId), createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
    .catch(() => {});
}
