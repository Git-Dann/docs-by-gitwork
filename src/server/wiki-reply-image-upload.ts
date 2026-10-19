/**
 * Reading a screenshot upload for a reply on a client's request. Same rules as the
 * request's own image routes (`…/intake-items/[id]/image`): an allow-list of image
 * types, an 8MB ceiling, and a 4xx — never a 500 — for anything the caller got wrong.
 */
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";

export const REPLY_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
export const REPLY_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export async function readReplyImageUpload(
  req: Request,
): Promise<{ ok: true; bytes: Buffer; mime: string; filename: string | null } | { ok: false; response: NextResponse }> {
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
