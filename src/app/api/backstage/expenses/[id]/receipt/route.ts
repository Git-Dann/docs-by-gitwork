import { NextResponse } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { attachReceipt, getReceiptBytes } from "@/server/backstage";

export const dynamic = "force-dynamic";

// Web and iOS both POST multipart/form-data with a single `file` field.
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_BYTES = 2 * 1024 * 1024; // 2MB paranoia ceiling — clients should pre-compress to ~400KB

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return apiError("Missing `file` field in multipart body", 400);
    }
    const mime = file.type || "image/jpeg";
    if (!ALLOWED_MIMES.has(mime)) {
      return apiError(`Unsupported image type: ${mime}`, 415);
    }
    const arrayBuffer = await file.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return apiError(
        `Receipt too large (${arrayBuffer.byteLength} bytes). Compress to under ${MAX_BYTES} bytes before upload.`,
        413,
      );
    }
    const bytes = Buffer.from(arrayBuffer);
    const updated = await attachReceipt(user, id, bytes, mime);
    return apiOk(updated);
  } catch (e) {
    return fromError(e);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const result = await getReceiptBytes(user, id);
    if (!result) {
      return apiError("No receipt attached", 404);
    }
    const arrayBuf = result.bytes.buffer.slice(
      result.bytes.byteOffset,
      result.bytes.byteOffset + result.bytes.byteLength,
    ) as ArrayBuffer;
    return new NextResponse(arrayBuf, {
      status: 200,
      headers: {
        "Content-Type": result.mime,
        "Content-Length": String(result.bytes.byteLength),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    return fromError(e);
  }
}
