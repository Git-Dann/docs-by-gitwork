/**
 * A client edits or deletes a key date on their Board Schedule — HARDENED posture
 * (src/server/wiki-board-access.ts). Every write is scoped to this wiki's client, so another
 * client's key date is a 404. Only a signed-in client user may delete from here, as with cards;
 * the team deletes from the internal wiki, where 'Manage clients' is checked.
 */
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { deleteKeyDate, updateKeyDate } from "@/server/wiki-board-key-dates";
import { assertBoardWriteRate, boardAccessError, resolveBoardWriter } from "@/server/wiki-board-access";
import { boardKeyDatePatchSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; keyDateId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { token, keyDateId } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    await assertBoardWriteRate(req);
    const body = boardKeyDatePatchSchema.parse(await req.json());
    return apiOk({ keyDate: await updateKeyDate(access.writer, keyDateId, body) });
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { token, keyDateId } = await params;
    const access = await resolveBoardWriter(req, token);
    if (!access.ok) {
      const { message, status } = boardAccessError(access.reason);
      return apiError(message, status);
    }
    await assertBoardWriteRate(req);
    if (!access.writer.wikiUserId) {
      return apiError("Delete key dates from the Board in Foundry, where it can be checked you may.", 403);
    }
    await deleteKeyDate(access.writer, keyDateId);
    return apiOk({ deleted: keyDateId });
  } catch (err) {
    return fromError(err);
  }
}
