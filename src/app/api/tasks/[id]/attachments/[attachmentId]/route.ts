import { NextResponse } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getTaskAttachmentBytes, deleteTaskAttachment } from "@/server/tasks";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const user = await requireAuthedUser(req);
    const { id, attachmentId } = await params;
    const thumb = new URL(req.url).searchParams.get("thumb") === "1";
    const result = await getTaskAttachmentBytes(user, id, attachmentId, thumb ? "thumb" : "full");
    if (!result) {
      return apiError("Attachment not found", 404);
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
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const user = await requireAuthedUser(req);
    const { id, attachmentId } = await params;
    await deleteTaskAttachment(user, id, attachmentId);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
