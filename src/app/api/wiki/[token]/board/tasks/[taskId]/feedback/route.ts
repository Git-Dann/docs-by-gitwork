/**
 * A card's feedback thread on the client's Board: read it, add to it, or sign the card off.
 *   GET  → the thread (client and team entries, labelled by side)
 *   POST → { kind: "comment" | "approved" | "changes_requested", body? }
 * The writer is whoever is signed in; a Gitwork session can comment but not sign off.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { addBoardFeedback, listBoardFeedback } from "@/server/wiki-board";
import { assertBoardWriteRate, boardAccessError, resolveBoardWriter } from "@/server/wiki-board-access";
import { boardFeedbackSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; taskId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const { token, taskId } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    return apiOk({ feedback: await listBoardFeedback(access.writer.clientId, taskId) });
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { token, taskId } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    await assertBoardWriteRate(req);
    const body = boardFeedbackSchema.parse(await req.json());
    const entry = await addBoardFeedback(access.writer, taskId, body);
    return apiOk({ entry }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
