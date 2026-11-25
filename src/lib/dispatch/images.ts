/**
 * Pictures Dispatch looks at: a person's attachments, Figma frames, page screenshots. Pure.
 *
 * The type is decided by the file's first bytes, never by its name or the type the browser
 * claimed, so a file that only says it is a picture is refused.
 */

import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from "./limits";

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export function imageMediaType(bytes: Uint8Array): ImageMediaType | null {
  const b = bytes;
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return "image/gif";
  return null;
}

export interface CheckedImage {
  mediaType: ImageMediaType;
  /** base64, no data: prefix. */
  data: string;
}

/**
 * A person's attachments (base64, optionally as data: URLs), checked. Returns the plain-English
 * problem instead when any one isn't a picture, is too big, or there are too many.
 */
export function checkAttachments(raw: readonly string[]): CheckedImage[] | string {
  if (raw.length > MAX_ATTACHMENTS) return `Attach at most ${MAX_ATTACHMENTS} pictures.`;
  const out: CheckedImage[] = [];
  for (const item of raw) {
    const data = item.replace(/^data:[^;,]*;base64,/, "");
    if (!/^[A-Za-z0-9+/]+=*$/.test(data)) return "One of the attachments isn't a picture.";
    const bytes = Buffer.from(data, "base64");
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return "One of the pictures is too large. Try a smaller screenshot.";
    const mediaType = imageMediaType(bytes);
    if (!mediaType) return "One of the attachments isn't a PNG, JPEG, WebP or GIF picture.";
    out.push({ mediaType, data });
  }
  return out;
}
