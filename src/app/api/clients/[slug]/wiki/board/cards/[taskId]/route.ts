/**
 * The team edits or deletes a card on a client's Board from the internal wiki.
 *   PATCH  needs a developer or above who can open this client.
 *   DELETE also needs 'Manage clients'. Soft: the card can be restored.
 */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { deleteBoardCard, updateBoardCard } from "@/server/wiki-board";
import { resolveInternalBoardWriter } from "@/server/wiki-board-access";
import { boardCardEditSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; taskId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, taskId } = await params;
    const writer = await resolveInternalBoardWriter(req, slug, "write");
    const body = boardCardEditSchema.parse(await req.json());
    return apiOk({ card: await updateBoardCard(writer, taskId, body) });
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, taskId } = await params;
    const writer = await resolveInternalBoardWriter(req, slug, "manage");
    await deleteBoardCard(writer, taskId);
    return apiOk({ deleted: taskId });
  } catch (err) {
    return fromError(err);
  }
}
