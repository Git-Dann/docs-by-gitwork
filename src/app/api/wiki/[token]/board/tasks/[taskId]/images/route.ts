/**
 * A client adds screenshots to a card (multipart, `file` fields). Same access as every Board write
 * (src/server/wiki-board-access.ts). Images only, checked by their bytes, never SVG; 10 MB each,
 * 10 a card, and a per-wiki upload limit (src/server/wiki-board-limit.ts).
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { addBoardCardImages } from "@/server/wiki-board";
import { assertBoardWriteRate, boardAccessError, readBoardImageForm, resolveBoardWriter } from "@/server/wiki-board-access";

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
    const files = await readBoardImageForm(req);
    const card = await addBoardCardImages(access.writer, taskId, files);
    return apiOk({ card }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
