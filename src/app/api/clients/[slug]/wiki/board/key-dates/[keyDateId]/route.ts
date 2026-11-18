/**
 * The team edits or deletes a key date on a client's Board Schedule from the internal wiki.
 *   PATCH  needs a developer or above who can open this client.
 *   DELETE also needs 'Manage clients'. Soft: an imported date stays deleted on a re-import.
 */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { deleteKeyDate, updateKeyDate } from "@/server/wiki-board-key-dates";
import { resolveInternalBoardWriter } from "@/server/wiki-board-access";
import { boardKeyDatePatchSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; keyDateId: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, keyDateId } = await params;
    const writer = await resolveInternalBoardWriter(req, slug, "write");
    const body = boardKeyDatePatchSchema.parse(await req.json());
    return apiOk({ keyDate: await updateKeyDate(writer, keyDateId, body) });
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { slug, keyDateId } = await params;
    const writer = await resolveInternalBoardWriter(req, slug, "manage");
    await deleteKeyDate(writer, keyDateId);
    return apiOk({ deleted: keyDateId });
  } catch (err) {
    return fromError(err);
  }
}
