import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { deleteWikiEstimate, updateWikiEstimate } from "@/server/wiki-estimates";
import { estimateSchema } from "@/server/validators";

async function resolveClientId(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

/** Replaces the estimate AND its whole phase list — see the note in wiki-estimates.ts. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; estimateId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "edit an estimate");
    const { slug, estimateId } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = estimateSchema.parse(await req.json());
    return apiOk(await updateWikiEstimate(clientId, estimateId, body));
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; estimateId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "delete an estimate");
    const { slug, estimateId } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await deleteWikiEstimate(clientId, estimateId));
  } catch (err) {
    return fromError(err);
  }
}
