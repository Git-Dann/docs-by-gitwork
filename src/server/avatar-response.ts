/**
 * Turn a user's stored avatar into an HTTP response. Shared by the signed-in route
 * (`/api/avatars/[id]`) and the client wiki's route (`/api/wiki/[token]/avatars/[userId]`),
 * so the two cannot drift. Authorisation is the CALLER's job — this only reads and streams.
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isDataUrl } from "@/lib/avatar";

/**
 * Avatars are drawn at 24–96px, but they are stored as uploaded — a phone photo is
 * megabytes. Sent as stored, a client on a slow connection spent 85 seconds on ONE
 * 1.9 MB avatar while the page's own scripts were cut off, and the wiki failed to load
 * ("Application error: a client-side exception", Big Wedge, 22 Oct 2026). So the image
 * is shrunk on the way out to at most AVATAR_PX square, as WebP: a few KB.
 */
export const AVATAR_PX = 256;

/** Raster formats sharp can safely shrink. Anything else (SVG, GIF) goes out as stored. */
const RESIZABLE = /^image\/(jpe?g|png|webp|avif|heic|heif)$/i;

/** Shrunk avatars by content hash, so a photo is resized once, not on every view. */
const resized = new Map<string, Buffer>();
const RESIZED_MAX = 300;

/** The image as it should be served: shrunk when it is a large raster, else as stored. */
export async function shrinkAvatar(
  mime: string,
  body: Buffer,
): Promise<{ mime: string; body: Buffer }> {
  if (!RESIZABLE.test(mime)) return { mime, body };
  const key = createHash("sha1").update(body).digest("hex");
  const hit = resized.get(key);
  if (hit) return { mime: "image/webp", body: hit };
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(body, { failOn: "none" })
      .rotate() // honour the phone's EXIF orientation before it is stripped
      .resize(AVATAR_PX, AVATAR_PX, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    // Never serve a "shrunk" copy that is bigger than the original.
    if (out.length >= body.length) return { mime, body };
    if (resized.size >= RESIZED_MAX) resized.delete(resized.keys().next().value as string);
    resized.set(key, out);
    return { mime: "image/webp", body: out };
  } catch {
    // An image sharp cannot read still goes out as stored — a broken resize must not
    // become a missing photo.
    return { mime, body };
  }
}

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
export async function avatarResponse(userId: string, req?: Request): Promise<Response> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarImage: true, avatarUrl: true },
  });
  if (!user) return new Response("Not found", { status: 404 });

  if (user.avatarImage && isDataUrl(user.avatarImage)) {
    const decoded = decodeDataUrl(user.avatarImage);
    if (decoded) {
      const served = await shrinkAvatar(decoded.mime, decoded.body);
      const etag = `"${createHash("sha1").update(served.body).digest("hex").slice(0, 20)}"`;
      const headers = {
        "Content-Type": served.mime,
        // Avatars change rarely; a short private cache keeps repeat renders cheap
        // while still picking up a change within a few minutes, and the ETag makes
        // the revalidation after that a 304 rather than the image again.
        "Cache-Control": "private, max-age=300",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
      };
      if (req?.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
      return new Response(new Uint8Array(served.body), { headers });
    }
  }

  // No stored blob — fall back to an external photo URL if one is set.
  if (user.avatarUrl && !isDataUrl(user.avatarUrl) && /^https?:\/\//.test(user.avatarUrl)) {
    return Response.redirect(user.avatarUrl, 302);
  }

  return new Response("Not found", { status: 404 });
}
