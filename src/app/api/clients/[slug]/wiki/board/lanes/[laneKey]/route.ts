/**
 * Older cards in a Done column, on the team's internal wiki: a developer or above who can open
 * this client (`resolveInternalBoardWriter`). The team's own copy of the cards (§126.5).
 */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { parseDoneLaneQuery } from "@/lib/wiki-board-lane-query";
import { loadBoardLanePage } from "@/server/wiki-board";
import { resolveInternalBoardWriter } from "@/server/wiki-board-access";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; laneKey: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, laneKey } = await params;
    const writer = await resolveInternalBoardWriter(req, slug, "write");
    const query = parseDoneLaneQuery(req.nextUrl.searchParams);
    return apiOk(await loadBoardLanePage(writer.clientId, { ...query, laneKey, audience: "team" }));
  } catch (err) {
    return fromError(err);
  }
}
