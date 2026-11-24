import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { createCodeVersion, deleteCodeModule, lockCodeModule, unlockCodeModule, updateCodeModule } from "@/server/wiki-code";
import { codeActorFor } from "@/server/wiki-code-actor";
import { clientIdForSlug } from "@/server/clients-scope";
import { assertClientWriter } from "@/server/client-write-access";

const moduleUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  /** true locks (Gitwork only); false unlocks, and needs `confirm: "Unlock Code"`. */
  locked: z.boolean().optional(),
  confirm: z.string().max(40).optional(),
});

const fileSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  language: z.string().trim().max(40).optional().nullable(),
  content: z.string().max(500_000),
});

const versionSchema = z.object({
  label: z.string().trim().min(1).max(60),
  notes: z.string().trim().max(5000).optional().nullable(),
  files: z.array(fileSchema).min(1).max(50),
  makeCurrent: z.boolean().optional(),
  /** Add it to a variant's line instead of the Master line. */
  variantId: z.string().trim().min(1).max(40).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; moduleId: string }> }) {
  try {
    const { slug, moduleId } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const body = moduleUpdateSchema.parse(await req.json());
    const actor = await codeActorFor(req);
    const updated =
      body.locked === true
        ? await lockCodeModule(clientId, moduleId, actor)
        : body.locked === false
          ? await unlockCodeModule(clientId, moduleId, body.confirm ?? "", actor)
          : await updateCodeModule(clientId, moduleId, { name: body.name, description: body.description });
    if (!updated) return apiError("Module not found", 404);
    return apiOk(updated);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string; moduleId: string }> }) {
  try {
    const { slug, moduleId } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const ok = await deleteCodeModule(clientId, moduleId);
    if (!ok) return apiError("Module not found", 404);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}

// Add a new version (with files) to this module.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; moduleId: string }> }) {
  try {
    const { slug, moduleId } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const version = await createCodeVersion(clientId, moduleId, versionSchema.parse(await req.json()), await codeActorFor(req));
    if (!version) return apiError("Module not found", 404);
    return apiOk(version, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
