import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { deleteCodeVersion, updateCodeVersion } from "@/server/wiki-code";
import { clientIdForSlug } from "@/server/clients-scope";

const fileSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  language: z.string().trim().max(40).optional().nullable(),
  content: z.string().max(500_000),
});

const versionUpdateSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  files: z.array(fileSchema).min(1).max(50).optional(),
  makeCurrent: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; versionId: string }> }) {
  try {
    const { slug, versionId } = await params;
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const updated = await updateCodeVersion(clientId, versionId, versionUpdateSchema.parse(await req.json()));
    if (!updated) return apiError("Version not found", 404);
    return apiOk(updated);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string; versionId: string }> }) {
  try {
    const { slug, versionId } = await params;
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const ok = await deleteCodeVersion(clientId, versionId);
    if (!ok) return apiError("Version not found", 404);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
