/**
 * Stamp `authorWikiUserId` onto client replies posted before that column existed, so
 * their authors can edit and delete them like any new reply.
 *
 * Lazy and self-terminating, with no migration and no one-shot route: it runs when the
 * shared wiki loads (or a reply on it is changed), only for THAT wiki, only over client
 * replies still unstamped and posted before stamping shipped — a fixed, shrinking set.
 * Once a wiki has none left it costs one indexed read.
 *
 * ⚠️ Exact-unique name matching within one wiki is accepted for historical rows only
 * (see src/lib/wiki-comment-author-match.ts). New replies are stamped with the verified
 * wiki user id at post time and never go through this.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { matchCommentAuthor } from "@/lib/wiki-comment-author-match";

/**
 * Replies posted after this were stamped at post time (the column shipped 19 Oct 2026),
 * so an unstamped one after it is genuinely anonymous and must not be guessed at. The
 * margin past the merge only covers the deploy window; matching stays conservative.
 */
export const AUTHOR_STAMPING_SHIPPED = new Date("2026-10-20T00:00:00Z");

/** Most rows examined per call — keeps a page load cheap on a wiki with a long history. */
export const BACKFILL_BATCH = 200;

const UNSTAMPED_SELECT = {
  id: true,
  authorName: true,
} as const satisfies Prisma.ClientWikiIntakeCommentSelect;

const WIKI_USER_SELECT = {
  id: true,
  wikiId: true,
  name: true,
  email: true,
} as const satisfies Prisma.ClientWikiUserSelect;

export async function backfillCommentAuthors(wikiId: string): Promise<{ examined: number; stamped: number }> {
  try {
    const rows = await prisma.clientWikiIntakeComment.findMany({
      where: {
        authorKind: "CLIENT",
        authorWikiUserId: null,
        deletedAt: null,
        createdAt: { lt: AUTHOR_STAMPING_SHIPPED },
        intakeItem: { wikiId },
      },
      select: UNSTAMPED_SELECT,
      orderBy: { createdAt: "asc" },
      take: BACKFILL_BATCH,
    });
    if (rows.length === 0) return { examined: 0, stamped: 0 };

    const users = await prisma.clientWikiUser.findMany({ where: { wikiId }, select: WIKI_USER_SELECT });
    let stamped = 0;
    for (const row of rows) {
      const userId = matchCommentAuthor(row.authorName, wikiId, users);
      if (!userId) continue; // ambiguous or unknown — stays read-only
      // Guarded on still-null so a concurrent run can never overwrite a stamp.
      const res = await prisma.clientWikiIntakeComment.updateMany({
        where: { id: row.id, authorWikiUserId: null, authorKind: "CLIENT" },
        data: { authorWikiUserId: userId },
      });
      stamped += res.count;
    }
    return { examined: rows.length, stamped };
  } catch (err) {
    // Housekeeping: a failure must never break the page that triggered it.
    console.error("[wiki-intake-comment-backfill] failed", err);
    return { examined: 0, stamped: 0 };
  }
}
