import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { createCodeVersion, deleteCodeModule, updateCodeModule } from "@/server/wiki-code";

const moduleUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
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
});

async function resolveClientId(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string; moduleId: string }> }) {
  try {
    const { slug, moduleId } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const updated = await updateCodeModule(clientId, moduleId, moduleUpdateSchema.parse(await req.json()));
    if (!updated) return apiError("Module not found", 404);
    return apiOk(updated);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string; moduleId: string }> }) {
  try {
    const { slug, moduleId } = await params;
    const clientId = await resolveClientId(slug);
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
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const version = await createCodeVersion(clientId, moduleId, versionSchema.parse(await req.json()));
    if (!version) return apiError("Module not found", 404);
    return apiOk(version, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
