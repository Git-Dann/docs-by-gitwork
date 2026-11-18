/**
 * The team puts a removed screenshot back on its card, from the internal wiki. Someone who may
 * manage this client (resolveInternalBoardWriter "manage"), the same as restoring a card. There is
 * no client route: the client takes screenshots off, the team decides what comes back.
 */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { restoreBoardCardImage } from "@/server/wiki-board";
import { resolveInternalBoardWriter } from "@/server/wiki-board-access";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; taskId: string; imageId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, taskId, imageId } = await params;
    const writer = await resolveInternalBoardWriter(req, slug, "manage");
    return apiOk({ card: await restoreBoardCardImage(writer, taskId, imageId) });
  } catch (err) {
    return fromError(err);
  }
}
