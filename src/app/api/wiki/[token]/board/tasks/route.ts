/**
 * A client adds a card to their Board — HARDENED posture (src/server/wiki-board-access.ts):
 * token → Board on + right section → wiki sign-in or a Gitwork session → per-IP rate limit.
 * The card is a real task on the team's board at once; only early columns accept new cards.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { createBoardCard } from "@/server/wiki-board";
import { assertBoardWriteRate, boardAccessError, resolveBoardWriter } from "@/server/wiki-board-access";
import { boardCardCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { token } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    await assertBoardWriteRate(req);
    const body = boardCardCreateSchema.parse(await req.json());
    const card = await createBoardCard(access.writer, body);
    return apiOk({ card }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
