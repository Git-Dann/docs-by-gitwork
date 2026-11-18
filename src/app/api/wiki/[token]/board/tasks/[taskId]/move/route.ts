/**
 * A client moves a card between columns on their Board, Done included (Dan, Nov 2026). The card
 * must be this wiki's client's, and one they may act on: the team's dev tasks are a 404.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { moveBoardCard } from "@/server/wiki-board";
import { assertBoardWriteRate, boardAccessError, resolveBoardWriter } from "@/server/wiki-board-access";
import { boardMoveSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; taskId: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { token, taskId } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    await assertBoardWriteRate(req);
    const body = boardMoveSchema.parse(await req.json());
    const card = await moveBoardCard(access.writer, taskId, body);
    return apiOk({ card });
  } catch (err) {
    return fromError(err);
  }
}
