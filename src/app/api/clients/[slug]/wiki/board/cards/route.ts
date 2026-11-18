/**
 * The team adds a card to a client's Board from the internal wiki, with the same fields as the
 * client (src/server/wiki-board.ts `createBoardCard`). A developer or above who can open this
 * client (`resolveInternalBoardWriter`).
 */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { createBoardCard } from "@/server/wiki-board";
import { resolveInternalBoardWriter } from "@/server/wiki-board-access";
import { boardCardCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const writer = await resolveInternalBoardWriter(req, slug, "write");
    const body = boardCardCreateSchema.parse(await req.json());
    const card = await createBoardCard(writer, body);
    return apiOk({ card }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
