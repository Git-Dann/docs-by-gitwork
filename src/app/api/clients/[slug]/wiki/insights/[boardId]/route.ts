import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { deleteInsightBoard, updateInsightBoard } from "@/server/wiki-insights";
import { boardSchema } from "@/server/validators";

async function resolveClientId(slug: string): Promise<string | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return client?.id ?? null;
}

/** Replaces the board's meta AND its whole content — see the note in wiki-insights.ts. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; boardId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "edit an insight board");
    const { slug, boardId } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const body = boardSchema.parse(await req.json());
    const board = await updateInsightBoard(clientId, boardId, body);
    if (!board) return apiError("Board not found", 404);
    return apiOk(board);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; boardId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "delete an insight board");
    const { slug, boardId } = await params;
    const clientId = await resolveClientId(slug);
    if (!clientId) return apiError("Client not found", 404);
    const ok = await deleteInsightBoard(clientId, boardId);
    if (!ok) return apiError("Board not found", 404);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
