/**
 * Who may edit or delete a reply on a client's request.
 *
 * Pure and framework-free: the server enforces it on every PATCH/DELETE, and the same
 * rule decides which replies show Edit/Delete — so the button and the route can never
 * disagree about who owns a reply.
 *
 * The rule:
 *   • A deleted reply can't be touched again.
 *   • A Gitwork user may edit only a reply they wrote themselves (matched on their
 *     Foundry user id, never on a name). An admin may also DELETE anyone's reply — a
 *     moderation action — but never rewrite someone else's words.
 *   • A client may edit or delete only a CLIENT reply stamped with THEIR wiki user id.
 *     Matching on the display name would let one "Sam" edit another "Sam"'s reply, and
 *     a reply posted before the id was stamped has no owner we can prove — so it stays
 *     read-only on the client's side.
 *   • Nobody else (an API-key caller, an anonymous viewer) gets either.
 */

export type CommentViewer =
  | { kind: "team"; userId: string; isAdmin: boolean }
  | { kind: "client"; wikiUserId: string }
  | null;

export interface CommentOwnership {
  authorKind: "TEAM" | "CLIENT";
  authorUserId: string | null;
  authorWikiUserId: string | null;
  deletedAt: Date | string | null;
}

export interface CommentPermissions {
  canEdit: boolean;
  canDelete: boolean;
}

const NONE: CommentPermissions = { canEdit: false, canDelete: false };

export function commentPermissions(comment: CommentOwnership, viewer: CommentViewer): CommentPermissions {
  if (!viewer || comment.deletedAt) return NONE;
  if (viewer.kind === "team") {
    const own = Boolean(comment.authorUserId) && comment.authorUserId === viewer.userId;
    return { canEdit: own, canDelete: own || viewer.isAdmin };
  }
  const own =
    comment.authorKind === "CLIENT" &&
    Boolean(comment.authorWikiUserId) &&
    comment.authorWikiUserId === viewer.wikiUserId;
  return { canEdit: own, canDelete: own };
}
