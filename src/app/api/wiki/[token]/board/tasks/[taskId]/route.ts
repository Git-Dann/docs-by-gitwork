/**
 * A client edits or deletes one of their cards — HARDENED posture (src/server/wiki-board-access.ts).
 *   PATCH  the card's fields. `boardCardEditSchema` is .strict(): an assignee is a 400. Who works on
 *          a card is the team's to decide, the one thing the client can't change (§126).
 *   DELETE soft-deletes the card (the team can restore it). Only a client user may delete from
 *          here; the team deletes from the internal wiki, where 'Manage clients' is checked.
 * The team's own dev tasks are a 404 to the client, the same as a card that doesn't exist.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { deleteBoardCard, updateBoardCard } from "@/server/wiki-board";
import { assertBoardWriteRate, boardAccessError, resolveBoardWriter } from "@/server/wiki-board-access";
import { boardCardEditSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; taskId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { token, taskId } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    await assertBoardWriteRate(req);
    const body = boardCardEditSchema.parse(await req.json());
    const card = await updateBoardCard(access.writer, taskId, body);
    return apiOk({ card });
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { token, taskId } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    await assertBoardWriteRate(req);
    if (!access.writer.wikiUserId) {
      return apiError("Delete cards from the Board in Foundry, where it can be checked you may.", 403);
    }
    await deleteBoardCard(access.writer, taskId);
    return apiOk({ deleted: taskId });
  } catch (err) {
    return fromError(err);
  }
}
