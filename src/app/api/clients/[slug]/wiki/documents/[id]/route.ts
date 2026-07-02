import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { updateDocument, deleteDocument } from "@/server/wiki-documents";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  url: z.string().url().optional(),
});

async function resolveClientId(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = updateSchema.parse(await req.json());
    const updated = await updateDocument(clientId, id, body);
    if (!updated) return apiError("Document not found", 404);
    return apiOk(updated);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  try {
    const { slug, id } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const ok = await deleteDocument(clientId, id);
    if (!ok) return apiError("Document not found", 404);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
