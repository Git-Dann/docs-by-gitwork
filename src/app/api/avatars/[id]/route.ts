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
import { prisma } from "@/lib/prisma";
import { isDataUrl } from "@/lib/avatar";

export const dynamic = "force-dynamic";

/** Parse a `data:[mime][;base64],<payload>` URL into bytes + content type. */
function decodeDataUrl(dataUrl: string): { mime: string; body: Buffer } | null {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const payload = match[3] ?? "";
  try {
    const body = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    if (body.length === 0) return null;
    return { mime, body };
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { avatarImage: true, avatarUrl: true },
  });
  if (!user) return new Response("Not found", { status: 404 });

  if (user.avatarImage && isDataUrl(user.avatarImage)) {
    const decoded = decodeDataUrl(user.avatarImage);
    if (decoded) {
      return new Response(new Uint8Array(decoded.body), {
        headers: {
          "Content-Type": decoded.mime,
          // Avatars change rarely; a short private cache keeps repeat card
          // renders cheap while still picking up a change within a few minutes.
          "Cache-Control": "private, max-age=300",
        },
      });
    }
  }

  // No stored blob — fall back to an external photo URL if one is set.
  if (user.avatarUrl && !isDataUrl(user.avatarUrl) && /^https?:\/\//.test(user.avatarUrl)) {
    return Response.redirect(user.avatarUrl, 302);
  }

  return new Response("Not found", { status: 404 });
}
