/**
 * Who is looking at a request's replies — the identity commentPermissions decides on.
 *
 * Internal (`/app`): the signed-in Foundry user, with admin rank.
 * Public (the shared wiki): a signed-in client wiki user first (verified through their
 * access cookie, exactly as the reply route stamps them); otherwise a Gitwork user
 * previewing the page, who may change only their own replies there — admin moderation
 * happens in the app, not on the client's page.
 */
import { auth } from "@/auth";
import { isAtLeast } from "@/types/auth";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { resolveWikiAccessUser } from "@/server/wiki-access";
import type { CommentViewer } from "@/lib/wiki-comment-permissions";

export function internalCommentViewer(user: Pick<EffectiveUser, "id" | "role"> | null): CommentViewer {
  if (!user) return null;
  return { kind: "team", userId: user.id, isAdmin: isAtLeast(user.role, "ADMIN") };
}

export async function publicCommentViewer(
  wikiId: string | null,
  accessCookie: string | undefined | null,
): Promise<CommentViewer> {
  if (!wikiId) return null;
  const clientUser = await resolveWikiAccessUser(wikiId, accessCookie);
  if (clientUser) return { kind: "client", wikiUserId: clientUser.id };
  const session = await auth();
  const userId = session?.user?.id;
  return userId ? { kind: "team", userId, isAdmin: false } : null;
}
