/**
 * Turn a user's stored avatar into an HTTP response. Shared by the signed-in route
 * (`/api/avatars/[id]`) and the client wiki's route (`/api/wiki/[token]/avatars/[userId]`),
 * so the two cannot drift. Authorisation is the CALLER's job — this only reads and streams.
 */
import { prisma } from "@/lib/prisma";
import { isDataUrl } from "@/lib/avatar";

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

/** The uploaded image, or a redirect to an external photo URL, or 404. */
export async function avatarResponse(userId: string): Promise<Response> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarImage: true, avatarUrl: true },
  });
  if (!user) return new Response("Not found", { status: 404 });

  if (user.avatarImage && isDataUrl(user.avatarImage)) {
    const decoded = decodeDataUrl(user.avatarImage);
    if (decoded) {
      return new Response(new Uint8Array(decoded.body), {
        headers: {
          "Content-Type": decoded.mime,
          // Avatars change rarely; a short private cache keeps repeat renders cheap
          // while still picking up a change within a few minutes.
          "Cache-Control": "private, max-age=300",
          "X-Content-Type-Options": "nosniff",
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
