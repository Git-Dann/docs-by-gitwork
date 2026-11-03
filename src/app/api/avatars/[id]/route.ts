/**
 * GET /api/avatars/[id] — stream a user's uploaded avatar image.
 *
 * The raw image (a base64 `data:` URL) is stored privately in `User.avatarImage`
 * and NEVER returned in API list/DTO payloads — only here, decoded to bytes.
 * `User.avatarUrl` carries the short served path (this route) so that every list
 * that embeds an avatar carries a ~30-char string, not a multi-MB blob.
 *
 * Auth: same-origin <img> requests from /app carry the `gitwork_api_session`
 * cookie, which the middleware validates for /api/*; we also require a signed-in
 * session here. If the user has no uploaded image but has an external avatarUrl
 * (e.g. a Google photo), we redirect to it.
 */

import { auth } from "@/auth";
import { avatarResponse } from "@/server/avatar-response";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  return avatarResponse(id, req);
}
