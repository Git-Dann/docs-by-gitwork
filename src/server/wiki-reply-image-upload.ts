/**
 * Reading a screenshot upload for a reply on a client's request. Same rules as the
 * request's own image routes (`…/intake-items/[id]/image`): an allow-list of image
 * types, an 8MB ceiling, and a 4xx — never a 500 — for anything the caller got wrong.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-response";
import { MAX_MENTIONS_PER_COMMENT } from "@/lib/wiki-mentions";

export const REPLY_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
export const REPLY_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export type ReplyImage = { bytes: Buffer; mime: string; filename: string | null };

export async function readReplyImageUpload(
  req: Request,
): Promise<({ ok: true } & ReplyImage) | { ok: false; response: NextResponse }> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { ok: false, response: apiError("Expected a multipart form with a `file` field", 400) };
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return { ok: false, response: apiError("Missing `file` field in multipart body", 400) };
  }
  return readReplyImageFile(file);
}

async function readReplyImageFile(
  file: File,
): Promise<({ ok: true } & ReplyImage) | { ok: false; response: NextResponse }> {
  const mime = file.type || "image/png";
  if (!REPLY_IMAGE_MIMES.has(mime)) {
    return { ok: false, response: apiError(`Unsupported image type: ${mime}`, 415) };
  }
  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > REPLY_IMAGE_MAX_BYTES) {
    return {
      ok: false,
      response: apiError(
        `Image too large (${arrayBuffer.byteLength} bytes). Compress to under ${REPLY_IMAGE_MAX_BYTES} bytes before upload.`,
        413,
      ),
    };
  }
  return { ok: true, bytes: Buffer.from(arrayBuffer), mime, filename: file.name || null };
}

/** Stream stored image bytes back with the same headers the request image route uses. */
export function imageResponse(result: { bytes: Buffer; mime: string } | null): NextResponse {
  if (!result) return apiError("No image attached", 404);
  const arrayBuf = result.bytes.buffer.slice(
    result.bytes.byteOffset,
    result.bytes.byteOffset + result.bytes.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(arrayBuf, {
    status: 200,
    headers: {
      "Content-Type": result.mime,
      "Content-Length": String(result.bytes.byteLength),
      "Cache-Control": "private, max-age=300",
    },
  });
}

/** The text half of a new reply. `body` may be empty — whether that is allowed depends
 *  on whether a screenshot came with it (see `replyHasContent`). */
export const replyFieldsSchema = z.object({
  body: z.string().trim().max(10_000).default(""),
  /** Ids from the mention picker. Re-checked against the wiki's directory by the route. */
  mentionIds: z.array(z.string().max(80)).max(MAX_MENTIONS_PER_COMMENT * 2).optional(),
});

/** A reply needs words, a screenshot, or both. Neither is not a reply. */
export function replyHasContent(body: string, hasImage: boolean): boolean {
  return body.trim().length > 0 || hasImage;
}

export const EMPTY_REPLY_MESSAGE = "Write a reply or attach a screenshot.";

/**
 * Read a new reply. JSON (`{ body, mentionIds }`) as before, or — when a screenshot
 * comes with it — multipart with `body`, `mentionIds` (a JSON array string) and `file`.
 * Sending both in ONE request is what makes a screenshot-only reply safe: the server
 * sees the image when it decides whether the reply is empty, so a reply never exists
 * with neither. A blank reply with no screenshot is still a 400.
 */
export async function readReplyInput(
  req: Request,
): Promise<
  | { ok: true; body: string; mentionIds: string[]; image: ReplyImage | null }
  | { ok: false; response: NextResponse }
> {
  const isMultipart = (req.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data");
  let raw: unknown;
  let image: ReplyImage | null = null;
  if (isMultipart) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return { ok: false, response: apiError("Could not read that reply", 400) };
    }
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      const read = await readReplyImageFile(file);
      if (!read.ok) return read;
      image = { bytes: read.bytes, mime: read.mime, filename: read.filename };
    }
    let mentionIds: unknown = undefined;
    const mentionField = form.get("mentionIds");
    if (typeof mentionField === "string" && mentionField) {
      try {
        mentionIds = JSON.parse(mentionField);
      } catch {
        return { ok: false, response: apiError("`mentionIds` must be a JSON array", 400) };
      }
    }
    const bodyField = form.get("body");
    raw = { body: typeof bodyField === "string" ? bodyField : "", mentionIds };
  } else {
    try {
      raw = await req.json();
    } catch {
      return { ok: false, response: apiError("Expected a JSON body", 400) };
    }
  }
  const parsed = replyFieldsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: apiError("Validation failed", 400) };
  const { body, mentionIds } = parsed.data;
  if (!replyHasContent(body, Boolean(image))) return { ok: false, response: apiError(EMPTY_REPLY_MESSAGE, 400) };
  // A screenshot-only reply has no text, so nobody can be @mentioned in it.
  return { ok: true, body, mentionIds: body ? (mentionIds ?? []) : [], image };
}
