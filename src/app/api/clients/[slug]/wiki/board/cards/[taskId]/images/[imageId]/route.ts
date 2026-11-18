/**
 * The team takes a screenshot off a card on a client's Board, from the internal wiki. Someone who may
 * manage this client (resolveInternalBoardWriter "manage", like deleting a card); the image must be
 * on THIS card, and the card on this client. It is kept, not deleted, so it can be put back
 * (removeBoardCardImage, and ./restore).
 */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { removeBoardCardImage } from "@/server/wiki-board";
import { resolveInternalBoardWriter } from "@/server/wiki-board-access";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; taskId: string; imageId: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, taskId, imageId } = await params;
    const writer = await resolveInternalBoardWriter(req, slug, "manage");
    return apiOk({ card: await removeBoardCardImage(writer, taskId, imageId) });
  } catch (err) {
    return fromError(err);
  }
}
