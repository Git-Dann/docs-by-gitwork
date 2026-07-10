import { NextResponse } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { attachWikiIntakeItemImageByToken, getWikiIntakeItemImageBytesByToken } from "@/server/wiki";

export const dynamic = "force-dynamic";

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const MAX_BYTES = 8 * 1024 * 1024; // 8MB ceiling — clients should pre-compress screenshots

export async function POST(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return apiError("Missing `file` field in multipart body", 400);
    }
    const mime = file.type || "image/png";
    if (!ALLOWED_MIMES.has(mime)) {
      return apiError(`Unsupported image type: ${mime}`, 415);
    }
    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return apiError(
        `Image too large (${arrayBuffer.byteLength} bytes). Compress to under ${MAX_BYTES} bytes before upload.`,
        413,
      );
    }
    const bytes = Buffer.from(arrayBuffer);
    const updated = await attachWikiIntakeItemImageByToken(token, id, bytes, mime, file.name || null);
    if (!updated) return apiError("Invalid wiki token or request", 404);
    return apiOk(updated);
  } catch (e) {
    return fromError(e);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  try {
    const { token, id } = await params;
    const thumb = new URL(req.url).searchParams.get("thumb") === "1";
    const result = await getWikiIntakeItemImageBytesByToken(token, id, thumb ? "thumb" : "full");
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
  } catch (e) {
    return fromError(e);
  }
}
