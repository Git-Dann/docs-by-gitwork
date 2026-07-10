import { NextResponse } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { attachWikiIntakeItemImage, getWikiIntakeItemImageBytes } from "@/server/wiki";

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

async function resolveClientId(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { slug, id } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
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
    const updated = await attachWikiIntakeItemImage(clientId, id, bytes, mime, file.name || null);
    return apiOk(updated);
  } catch (e) {
    return fromError(e);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  try {
    const { slug, id } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const thumb = new URL(req.url).searchParams.get("thumb") === "1";
    const result = await getWikiIntakeItemImageBytes(clientId, id, thumb ? "thumb" : "full");
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
