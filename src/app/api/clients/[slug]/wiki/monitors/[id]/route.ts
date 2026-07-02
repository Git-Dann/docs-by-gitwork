import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { updateMonitor, deleteMonitor } from "@/server/wiki-monitors";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(["HTTP", "TCP"]).optional(),
  target: z.string().min(1).optional(),
  method: z.string().optional(),
  expectedStatus: z.number().int().min(100).max(599).nullable().optional(),
  keyword: z.string().max(200).nullable().optional(),
  degradedMs: z.number().int().min(1).max(120000).nullable().optional(),
  intervalMinutes: z.number().int().min(1).max(1440).optional(),
  enabled: z.boolean().optional(),
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
    const updated = await updateMonitor(clientId, id, body);
    if (!updated) return apiError("Monitor not found", 404);
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
    const ok = await deleteMonitor(clientId, id);
    if (!ok) return apiError("Monitor not found", 404);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
