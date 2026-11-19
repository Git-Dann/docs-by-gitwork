/**
 * A client adds a card to their Board — HARDENED posture (src/server/wiki-board-access.ts):
 * token → Board on + right section → wiki sign-in or a Gitwork session → per-IP rate limit.
 * The card is a real task on the team's board at once; only early columns accept new cards.
 * A CLIENT's Bug or Feedback is the exception: it is logged in Requests instead (Decision B,
 * §134), and stays a card only when Requests is off for this client.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { cardDescription } from "@/lib/wiki-board";
import { REQUEST_MAX_TITLE } from "@/lib/wiki-request-title";
import { addRequestFromBoard } from "@/server/wiki";
import { createBoardCard, isClientWriter } from "@/server/wiki-board";
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
    // A client's Bug or Feedback goes to Requests, where the team triages it (Decision B, §134).
    if (isClientWriter(access.writer) && (body.itemType === "bug" || body.itemType === "feedback")) {
      const request = await addRequestFromBoard(access.writer.wikiId, {
        type: body.itemType === "bug" ? "BUG" : "FEEDBACK",
        title: body.title.trim().slice(0, REQUEST_MAX_TITLE),
        description: cardDescription(body.description, body.links ?? []),
        priority: body.priority ?? "MEDIUM",
        requestedBy: access.writer.name,
      });
      if (request) return apiOk({ card: null, request: { id: request.id, title: request.title } }, { status: 201 });
    }
    const card = await createBoardCard(access.writer, body);
    return apiOk({ card, request: null }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
