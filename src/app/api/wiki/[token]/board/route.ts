/**
 * The Board's cards for the client's share page, which loads them on its own (the wiki carries a
 * summary, CLAUDE.md §140). Same access as every Board read and write (src/server/wiki-board-access.ts);
 * the client's copy, never the team's.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { forPublicBoard, loadWikiBoard } from "@/server/wiki-board";
import { assertBoardReadRate, boardAccessError, resolveBoardWriter } from "@/server/wiki-board-access";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    await assertBoardReadRate(req);
    return apiOk(forPublicBoard(await loadWikiBoard(access.writer.clientId)));
  } catch (err) {
    return fromError(err);
  }
}
