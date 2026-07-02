import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import {
  loadWikiDocuments,
  createLinkDocument,
  createFileDocument,
  setWikiDocumentsEnabled,
  MAX_DOCUMENT_BYTES,
} from "@/server/wiki-documents";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { z } from "zod";

export const maxDuration = 60;

const linkSchema = z.object({
  title: z.string().min(1),
  url: z.string().url("Enter a valid URL"),
});
const toggleSchema = z.object({ enabled: z.boolean() });

async function resolveClientId(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await loadWikiDocuments(clientId));
  } catch (err) {
    return fromError(err);
  }
}

// JSON body → add a link; multipart form (title + file) → upload a file.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const title = (form.get("title") as string | null)?.trim() ?? "";
      if (!(file instanceof File)) return apiError("No file uploaded", 400);
      if (file.size > MAX_DOCUMENT_BYTES) {
        return apiError(`File too large (max ${Math.floor(MAX_DOCUMENT_BYTES / 1024 / 1024)}MB)`, 413);
      }
      const data = Buffer.from(await file.arrayBuffer());
      const doc = await createFileDocument(clientId, {
        title,
        data,
        fileName: file.name || "file",
        fileMime: file.type || "application/octet-stream",
      });
      return apiOk(doc);
    }

    const body = linkSchema.parse(await req.json());
    return apiOk(await createLinkDocument(clientId, body));
  } catch (err) {
    return fromError(err);
  }
}

// Toggle the Documents section on/off (sidebar Add New / delete).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const { enabled } = toggleSchema.parse(await req.json());
    await setWikiDocumentsEnabled(clientId, enabled);
    return apiOk({ enabled });
  } catch (err) {
    return fromError(err);
  }
}
