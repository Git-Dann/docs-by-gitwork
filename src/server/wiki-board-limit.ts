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

import type { Prisma } from "@prisma/client";
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
  /** Moves (each drag that lands), per wiki. */
  movesPerHour: 200,
  /** Cards deleted, per wiki. Deleting is restorable, but a burst of it is a mess for the team to put back. */
  deletesPerHour: 30,
  deletesPerDay: 100,
  /** Key dates on the Schedule added, edited or deleted, per wiki. */
  keyDatesPerHour: 60,
  keyDatesPerDay: 300,
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

/**
 * The client's own writes to their cards, counted per wiki in the rate-limit table: an edit, a
 * move, a delete (a card or a screenshot taken off one), or a screenshot added (one hit per file). Counted and recorded together, inside the
 * board's per-wiki lock (`consumeBoardQuota`), so parallel requests can't all pass the same count.
 */
export type BoardAction = "edit" | "move" | "delete" | "upload" | "keyDate";

const ACTION_LIMITS: Record<BoardAction, { hour: number; day: number | null; noun: [string, string] }> = {
  edit: { hour: BOARD_QUOTA.editsPerHour, day: null, noun: ["change", "changes"] },
  move: { hour: BOARD_QUOTA.movesPerHour, day: null, noun: ["move", "moves"] },
  // Removing a card and removing a screenshot share this bucket: both take something off the board.
  delete: { hour: BOARD_QUOTA.deletesPerHour, day: BOARD_QUOTA.deletesPerDay, noun: ["removal", "removals (cards and screenshots)"] },
  upload: { hour: BOARD_QUOTA.uploadsPerHour, day: BOARD_QUOTA.uploadsPerDay, noun: ["screenshot", "screenshots"] },
  keyDate: { hour: BOARD_QUOTA.keyDatesPerHour, day: BOARD_QUOTA.keyDatesPerDay, noun: ["key date change", "key date changes"] },
};

/** Null when `adding` more of this action fit, otherwise what to tell the client. */
export function boardActionQuotaBreach(action: BoardAction, counts: { hour: number; day: number }, adding = 1): string | null {
  const limit = ACTION_LIMITS[action];
  const nouns = limit.noun[1];
  if (counts.hour + adding > limit.hour) {
    return `That would be more than ${limit.hour} ${nouns} in an hour, the most the board takes. Everything so far is saved; try again in a little while.`;
  }
  if (limit.day !== null && counts.day + adding > limit.day) {
    return `That would be more than ${limit.day} ${nouns} today, the most the board takes in a day. Everything so far is saved; try again tomorrow.`;
  }
  return null;
}

/** Kept for callers and tests that ask about one action by name. */
export const boardEditQuotaBreach = (hour: number) => boardActionQuotaBreach("edit", { hour, day: 0 });
export const boardUploadQuotaBreach = (counts: { hour: number; day: number }, adding: number) =>
  boardActionQuotaBreach("upload", counts, adding);

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
export async function countClientCards(
  clientId: string,
  since: Date,
  db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
): Promise<number> {
  const rows = await db.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM "Task"
    WHERE "clientId" = ${clientId}
      AND "createdAt" >= ${since}
      AND "metadata" ? 'createdByClient'`;
  return Number(rows[0]?.n ?? 0);
}

export async function assertWithinBoardCardQuota(
  clientId: string,
  db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
): Promise<void> {
  const now = Date.now();
  const [hour, day] = await Promise.all([
    countClientCards(clientId, new Date(now - 60 * 60 * 1000), db),
    countClientCards(clientId, new Date(now - 24 * 60 * 60 * 1000), db),
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

export const boardActionBucket = (action: BoardAction, wikiId: string) => `board:${action}:${wikiId}`;

type QuotaDb = Pick<Prisma.TransactionClient, "rateLimitHit">;

/**
 * Check and record `adding` of an action for this wiki, or throw a 429 recording nothing. Call it
 * inside the board's per-wiki lock (`withBoardLock` in wiki-board.ts) with that transaction's
 * client, so the count, the hits and the write they pay for land together or not at all.
 */
export async function consumeBoardQuota(db: QuotaDb, wikiId: string, action: BoardAction, adding = 1): Promise<void> {
  if (adding <= 0) return;
  const bucket = boardActionBucket(action, wikiId);
  const now = Date.now();
  const [hour, day] = await Promise.all([
    db.rateLimitHit.count({ where: { bucket, createdAt: { gte: new Date(now - 60 * 60 * 1000) } } }),
    db.rateLimitHit.count({ where: { bucket, createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } } }),
  ]);
  const breach = boardActionQuotaBreach(action, { hour, day }, adding);
  if (breach) throw new BoardRateLimitedError(breach);
  await db.rateLimitHit.createMany({ data: Array.from({ length: adding }, () => ({ bucket })) });
}

/** Drop hits older than a day for this wiki: nothing older is ever counted. Best effort. */
export function pruneBoardQuota(wikiId: string): void {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  void prisma.rateLimitHit
    .deleteMany({
      where: { bucket: { in: (Object.keys(ACTION_LIMITS) as BoardAction[]).map((a) => boardActionBucket(a, wikiId)) }, createdAt: { lt: cutoff } },
    })
    .catch(() => {});
}
