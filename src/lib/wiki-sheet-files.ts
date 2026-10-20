/**
 * Images uploaded into a Sheet's media cell (CLAUDE.md §73.2). Pure — the server, the
 * upload button and the tests share one rule.
 *
 *  - **Images only, decided from the BYTES.** PNG, JPEG, GIF, WebP. The extension must
 *    match the sniffed kind; SVG is refused (a browser runs script in it).
 *  - **The stored type is ours**, from the sniffed kind, never the multipart Content-Type.
 *  - **An uploaded image is a URL like any other media item**: `/api/wiki/files/<key>/<name>`.
 *    The key is a 160-bit random capability, so the path is only ever accepted in exactly
 *    that shape — no other relative URL becomes a media value.
 */

/** The most we STORE per image. Anything bigger is re-encoded down to fit (server side). */
export const SHEET_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/**
 * The most we ACCEPT per upload. A full-resolution screenshot is often 12–20 MB as PNG; it is
 * taken and shrunk to fit SHEET_IMAGE_MAX_BYTES rather than refused. Under nginx's 25M cap.
 */
export const SHEET_IMAGE_INPUT_MAX_BYTES = 24 * 1024 * 1024;

/**
 * A Google Drive file id from a share link (`/file/d/<id>/…`, `open?id=<id>`, `uc?id=<id>`) or
 * a bare id. Null for anything else, so a non-Drive URL is never taken for an id.
 */
export function parseDriveFileId(raw: string): string | null {
  const s = raw.trim();
  if (/^[A-Za-z0-9_-]{20,200}$/.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== "drive.google.com" && host !== "docs.google.com") return null;
  const path = /\/d\/([A-Za-z0-9_-]{20,200})/.exec(u.pathname)?.[1];
  const id = path ?? u.searchParams.get("id");
  return id && /^[A-Za-z0-9_-]{20,200}$/.test(id) ? id : null;
}

export const SHEET_IMAGE_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";

type ImageKind = { ext: string; mime: string };

const KINDS: Record<string, ImageKind> = {
  png: { ext: "png", mime: "image/png" },
  jpg: { ext: "jpg", mime: "image/jpeg" },
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  gif: { ext: "gif", mime: "image/gif" },
  webp: { ext: "webp", mime: "image/webp" },
};

function startsWith(h: Uint8Array, bytes: number[], offset = 0): boolean {
  return h.length >= offset + bytes.length && bytes.every((b, i) => h[offset + i] === b);
}
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** The image kind the bytes actually are, or null. */
export function sniffImage(h: Uint8Array): ImageKind | null {
  if (startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return KINDS.png;
  if (startsWith(h, [0xff, 0xd8, 0xff])) return KINDS.jpg;
  if (startsWith(h, ascii("GIF87a")) || startsWith(h, ascii("GIF89a"))) return KINDS.gif;
  if (startsWith(h, ascii("RIFF")) && startsWith(h, ascii("WEBP"), 8)) return KINDS.webp;
  return null;
}

/** A filename safe to put in a URL path segment and a Content-Disposition header. */
export function cleanImageName(raw: string, ext: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "")
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 60);
  return `${base || "image"}.${ext}`;
}

export type ImageCheck =
  | { ok: true; mime: string; filename: string }
  | { ok: false; error: string };

/** Is this upload an image we keep? Extension and content must agree. */
export function checkSheetImage(bytes: Uint8Array, filename: string): ImageCheck {
  if (bytes.length === 0) return { ok: false, error: "That file is empty." };
  if (bytes.length > SHEET_IMAGE_INPUT_MAX_BYTES) return { ok: false, error: "Images can be up to 24 MB." };
  const kind = sniffImage(bytes.subarray(0, 16));
  if (!kind) return { ok: false, error: "Only PNG, JPEG, GIF or WebP images can be uploaded." };
  const ext = /\.([a-z0-9]+)$/i.exec(filename.trim())?.[1]?.toLowerCase();
  if (ext && KINDS[ext] && KINDS[ext].mime !== kind.mime) {
    return { ok: false, error: `That file is named .${ext} but isn't a ${ext.toUpperCase()} image.` };
  }
  return { ok: true, mime: kind.mime, filename: cleanImageName(filename, kind.ext) };
}

const KEY = /^[a-f0-9]{40}$/;
const UPLOAD_PATH = /^\/api\/wiki\/files\/([a-f0-9]{40})\/([\w.-]{1,80})$/;

export function isSheetFileKey(key: string): boolean {
  return KEY.test(key);
}

export function sheetFileUrl(key: string, filename: string): string {
  return `/api/wiki/files/${key}/${encodeURIComponent(filename)}`;
}

/** The upload path, exactly — anything else (other relative URLs included) is not one. */
export function parseSheetFileUrl(url: string): { key: string; filename: string } | null {
  const m = UPLOAD_PATH.exec(url.trim());
  return m ? { key: m[1], filename: m[2] } : null;
}
