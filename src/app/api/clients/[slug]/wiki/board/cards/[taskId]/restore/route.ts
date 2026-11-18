/** The team puts back a card deleted from a client's Board. Needs 'Manage clients'. */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { restoreBoardCard } from "@/server/wiki-board";
import { resolveInternalBoardWriter } from "@/server/wiki-board-access";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; taskId: string }> }) {
  try {
    const { slug, taskId } = await params;
    const writer = await resolveInternalBoardWriter(req, slug, "manage");
    return apiOk({ card: await restoreBoardCard(writer, taskId) });
  } catch (err) {
    return fromError(err);
  }
}
