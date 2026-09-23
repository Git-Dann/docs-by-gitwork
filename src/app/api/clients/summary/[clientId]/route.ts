/**
 * Edit one card on the summary board — the hand-written note, or whether it shows.
 *
 * Gated on `canManageClients`: the note sits beside derived figures and is read as
 * Gitwork's own judgement on a client, so it is not something any viewer may rewrite.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { setClientSummaryHidden, setClientSummaryNote } from "@/server/client-summary";

const bodySchema = z.object({
  /** Empty string clears the note — and clears its timestamp with it. */
  note: z.string().max(2000).nullable().optional(),
  hidden: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "edit the client summary");
    const { clientId } = await params;
    const body = bodySchema.parse(await req.json());
    if (body.note === undefined && body.hidden === undefined) {
      return apiError("Nothing to update", 400);
    }
    let found = true;
    if (body.note !== undefined) {
      const trimmed = body.note?.trim() ?? "";
      found = await setClientSummaryNote(clientId, trimmed === "" ? null : trimmed);
    }
    if (found && body.hidden !== undefined) {
      found = await setClientSummaryHidden(clientId, body.hidden);
    }
    // ⚠️ A write that matched no row is a 404, never a silent 200. The board refetches
    // on success, so reporting ok would show the edit vanishing with no explanation.
    if (!found) return apiError("No such client in this workspace", 404);
    return apiOk({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}
