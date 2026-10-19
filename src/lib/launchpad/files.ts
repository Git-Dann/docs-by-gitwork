/**
 * Launchpad file uploads — what may be attached to a requirement, decided from the
 * BYTES, not from what the uploader claims.
 *
 * Pure and framework-free so the server, the client (the `accept` attribute and an
 * early size message) and the tests share one rule.
 *
 * Three things here are deliberate:
 *
 *  - **An allow-list, by extension AND by sniffed content.** A file must have an
 *    allowed extension and its leading bytes must match that kind. A renamed
 *    `evil.html → logo.png` fails the sniff.
 *  - **No SVG, no HTML, ever.** Both are documents a browser will execute script
 *    in. They are refused by extension and refused by content (a "text" file that
 *    opens with markup is refused too).
 *  - **The stored type is ours.** `mime` comes from the matched kind, never the
 *    multipart `Content-Type`, and downloads are served as attachments with
 *    `nosniff` — belt and braces.
 */

export const LAUNCHPAD_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const LAUNCHPAD_FILE_MAX_PER_ITEM = 10;

type Sniff = (head: Uint8Array) => boolean;

function startsWith(head: Uint8Array, bytes: number[], offset = 0): boolean {
  if (head.length < offset + bytes.length) return false;
  return bytes.every((b, i) => head[offset + i] === b);
}

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

const isPdf: Sniff = (h) => startsWith(h, ascii("%PDF-"));
const isPng: Sniff = (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isJpeg: Sniff = (h) => startsWith(h, [0xff, 0xd8, 0xff]);
const isGif: Sniff = (h) => startsWith(h, ascii("GIF87a")) || startsWith(h, ascii("GIF89a"));
const isWebp: Sniff = (h) => startsWith(h, ascii("RIFF")) && startsWith(h, ascii("WEBP"), 8);
/** docx / xlsx / pptx are zip containers. */
const isZip: Sniff = (h) => startsWith(h, [0x50, 0x4b, 0x03, 0x04]);

/** Plain text: no NUL bytes, and it must not open with markup — a `.txt` that is
 *  really an HTML or SVG document is refused. */
const isPlainText: Sniff = (h) => {
  if (h.includes(0)) return false;
  const text = new TextDecoder("utf-8", { fatal: false })
    .decode(h)
    .replace(/^﻿/, "")
    .trimStart()
    .toLowerCase();
  return !/^<(?:!doctype|html|svg|\?xml|script|body|head|iframe|!--)/.test(text);
};

interface FileKind {
  mime: string;
  sniff: Sniff;
}

const KINDS: Record<string, FileKind> = {
  pdf: { mime: "application/pdf", sniff: isPdf },
  png: { mime: "image/png", sniff: isPng },
  jpg: { mime: "image/jpeg", sniff: isJpeg },
  jpeg: { mime: "image/jpeg", sniff: isJpeg },
  gif: { mime: "image/gif", sniff: isGif },
  webp: { mime: "image/webp", sniff: isWebp },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sniff: isZip,
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sniff: isZip,
  },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sniff: isZip,
  },
  txt: { mime: "text/plain", sniff: isPlainText },
  csv: { mime: "text/csv", sniff: isPlainText },
};

/** For the `<input type="file" accept>` attribute. */
export const LAUNCHPAD_FILE_ACCEPT = Object.keys(KINDS)
  .map((ext) => `.${ext}`)
  .join(",");

export const LAUNCHPAD_FILE_TYPES_LABEL =
  "PDF, PNG, JPG, WebP, GIF, Word, Excel, PowerPoint, TXT or CSV";

/** How many leading bytes the sniff needs. */
export const LAUNCHPAD_SNIFF_BYTES = 512;

export type LaunchpadUploadVerdict =
  | { ok: true; mime: string; filename: string }
  | { ok: false; error: string };

/** Strip any path, control characters and quotes; keep it short. */
export function sanitizeLaunchpadFilename(raw: string | null | undefined): string {
  const base = (String(raw ?? "").split(/[\\/]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f"<>]/g, "")
    .trim();
  if (!base) return "file";
  if (base.length <= 200) return base;
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 && base.length - dot <= 10 ? base.slice(dot) : "";
  return base.slice(0, 200 - ext.length) + ext;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

/** Decide whether an upload may be stored, and as what. */
export function classifyLaunchpadUpload(input: {
  filename: string | null | undefined;
  size: number;
  head: Uint8Array;
}): LaunchpadUploadVerdict {
  const filename = sanitizeLaunchpadFilename(input.filename);
  if (input.size <= 0) return { ok: false, error: "That file is empty." };
  if (input.size > LAUNCHPAD_FILE_MAX_BYTES) {
    return {
      ok: false,
      error: `That file is ${(input.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB. Share a link instead for anything larger.`,
    };
  }
  const ext = extensionOf(filename);
  const kind = Object.prototype.hasOwnProperty.call(KINDS, ext) ? KINDS[ext] : undefined;
  if (!kind) {
    return {
      ok: false,
      error: `That type of file can't be uploaded here. Use ${LAUNCHPAD_FILE_TYPES_LABEL}, or paste a link.`,
    };
  }
  if (!kind.sniff(input.head.subarray(0, LAUNCHPAD_SNIFF_BYTES))) {
    return {
      ok: false,
      error: `That file doesn't look like a real .${ext} file. Re-export it and try again.`,
    };
  }
  return { ok: true, mime: kind.mime, filename };
}

/** `Content-Disposition` for a download — always an attachment, with an ASCII
 *  fallback and the RFC 5987 UTF-8 form. */
export function attachmentDisposition(filename: string): string {
  const safe = sanitizeLaunchpadFilename(filename);
  const fallback = safe.replace(/[^\x20-\x7e]/g, "_").replace(/[\\;]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

/** Human size for the file list. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Thrown for anything wrong with an upload that is the caller's problem — routes
 *  surface it as a 400 via `fromError`, never a 500. */
export class LaunchpadUploadError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "LaunchpadUploadError";
  }
}
