/**
 * The team takes a screenshot off a card on a client's Board, from the internal wiki. A developer
 * or above who can open this client (resolveInternalBoardWriter "write"); the image must be on THIS
 * card, and the card on this client (removeBoardCardImage).
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
    const writer = await resolveInternalBoardWriter(req, slug, "write");
    return apiOk({ card: await removeBoardCardImage(writer, taskId, imageId) });
  } catch (err) {
    return fromError(err);
  }
}
