/**
 * A client adds a key date to their Board Schedule — HARDENED posture
 * (src/server/wiki-board-access.ts): the Board on, a link for the Board, a signed-in client user
 * or this client's team, a per-IP rate limit, then a per-wiki quota inside the board's lock.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { createKeyDate } from "@/server/wiki-board-key-dates";
import { assertBoardWriteRate, boardAccessError, resolveBoardWriter } from "@/server/wiki-board-access";
import { boardKeyDateCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    await assertBoardWriteRate(req);
    const body = boardKeyDateCreateSchema.parse(await req.json());
    return apiOk({ keyDate: await createKeyDate(access.writer, body) });
  } catch (err) {
    return fromError(err);
  }
}
