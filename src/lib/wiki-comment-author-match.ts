/**
 * Matching an old client reply to the wiki user who wrote it — pure, no database.
 *
 * Replies posted before `ClientWikiIntakeComment.authorWikiUserId` existed carry only
 * the author's display name (their wiki-user name, or their email when they had none —
 * see `resolveWikiAccessUser`). commentPermissions deliberately never matches on a name,
 * so those replies were read-only for everyone, including the person who wrote them.
 *
 * ⚠️ The trade-off, accepted for HISTORICAL rows only: we stamp the id once, when the
 * stored name identifies exactly one user of the SAME wiki — by exact (trimmed,
 * case-insensitive) name or email, with nobody else on that wiki sharing it. Anything
 * ambiguous stays null and read-only. New replies are still stamped with the verified
 * id at post time; nothing here loosens the permission rule itself.
 */

export type WikiUserForMatch = { id: string; wikiId: string; name: string | null; email: string };

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * The one wiki user `authorName` unambiguously names on `wikiId`, or null. Users from
 * any other wiki are ignored — a name is only ever matched within the wiki it was
 * posted on.
 */
export function matchCommentAuthor(
  authorName: string,
  wikiId: string,
  users: readonly WikiUserForMatch[],
): string | null {
  const wanted = norm(authorName);
  if (!wanted) return null;
  const candidates = new Set(
    users
      .filter((u) => u.wikiId === wikiId && (norm(u.name) === wanted || norm(u.email) === wanted))
      .map((u) => u.id),
  );
  if (candidates.size !== 1) return null;
  return [...candidates][0] ?? null;
}
