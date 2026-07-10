import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { addTaskAttachment } from "@/server/tasks";

export const dynamic = "force-dynamic";

// Web and iOS both POST multipart/form-data with a single `file` field.
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const MAX_BYTES = 8 * 1024 * 1024; // 8MB ceiling — clients should pre-compress screenshots

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
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
        `Attachment too large (${arrayBuffer.byteLength} bytes). Compress to under ${MAX_BYTES} bytes before upload.`,
        413,
      );
    }
    const bytes = Buffer.from(arrayBuffer);
    const created = await addTaskAttachment(user, id, bytes, mime, file.name || null);
    return apiOk(created, { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
