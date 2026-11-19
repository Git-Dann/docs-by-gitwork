/**
 * Older cards in a Done column, on the client's link — the HARDENED posture
 * (src/server/wiki-board-access.ts): the Board on, a link for the Board, a signed-in client user
 * or this client's own team, and a per-IP read limit. Always the CLIENT's copy of the cards, the
 * same copy the page itself shows: their cards, and the team's dev tasks only as a title while
 * the team shows them (§126.5).
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { parseDoneLaneQuery } from "@/lib/wiki-board-lane-query";
import { loadBoardLanePage } from "@/server/wiki-board";
import { assertBoardReadRate, boardAccessError, resolveBoardWriter } from "@/server/wiki-board-access";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; laneKey: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { token, laneKey } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    await assertBoardReadRate(req);
    const query = parseDoneLaneQuery(req.nextUrl.searchParams);
    return apiOk(await loadBoardLanePage(access.writer.clientId, { ...query, laneKey, audience: "client" }));
  } catch (err) {
    return fromError(err);
  }
}
