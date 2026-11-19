/**
 * GET /api/u/[slug]/avatar — the photo on a public profile (CLAUDE.md §139).
 *
 * The usual avatar route needs a Foundry sign-in, so on a public page it would 401 (the same
 * trap as the client wiki, src/lib/wiki-team-avatar.ts). This serves ONE person's photo, and
 * only while their page is public; anything else is a 404.
 */
import { avatarResponse } from "@/server/avatar-response";
import { publicAvatarUserId } from "@/server/public-profile";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await publicAvatarUserId(slug);
  if (!userId) return new Response("Not found", { status: 404 });
  return avatarResponse(userId, req);
}
