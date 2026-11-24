import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { MAX_CODE_FILE_CHARS, MAX_CODE_VERSION_CHARS, MAX_FILES_PER_VERSION } from "@/lib/code-upload";
import { deleteCodeVersion, updateCodeVersion } from "@/server/wiki-code";
import { codeActorFor } from "@/server/wiki-code-actor";
import { clientIdForSlug } from "@/server/clients-scope";
import { assertClientWriter } from "@/server/client-write-access";

const fileSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  language: z.string().trim().max(40).optional().nullable(),
  content: z.string().max(MAX_CODE_FILE_CHARS),
});

const versionUpdateSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  notes: z.string().trim().max(5000).optional().nullable(),
  files: z
    .array(fileSchema)
    .min(1)
    .max(MAX_FILES_PER_VERSION)
    .refine((fs) => fs.reduce((n, f) => n + f.content.length, 0) <= MAX_CODE_VERSION_CHARS, {
      message: `All of a version's files together can hold up to ${MAX_CODE_VERSION_CHARS.toLocaleString("en-GB")} characters`,
    }).optional(),
  makeCurrent: z.boolean().optional(),
  makeMaster: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; versionId: string }> }) {
  try {
    const { slug, versionId } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const updated = await updateCodeVersion(clientId, versionId, versionUpdateSchema.parse(await req.json()), await codeActorFor(req));
    if (!updated) return apiError("Version not found", 404);
    return apiOk(updated);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string; versionId: string }> }) {
  try {
    const { slug, versionId } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const ok = await deleteCodeVersion(clientId, versionId, await codeActorFor(req));
    if (!ok) return apiError("Version not found", 404);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
