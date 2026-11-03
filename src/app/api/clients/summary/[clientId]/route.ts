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
import {
  getClientSummaryText,
  setClientSummaryHidden,
  setClientSummaryNote,
} from "@/server/client-summary";

const bodySchema = z.object({
  /** The short line the card shows. Empty string clears it. */
  note: z.string().max(2000).nullable().optional(),
  /** The fuller account, shown only in the record. Empty string clears it. */
  detail: z.string().max(20000).nullable().optional(),
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
    if (body.note === undefined && body.detail === undefined && body.hidden === undefined) {
      return apiError("Nothing to update", 400);
    }
    let found = true;
    if (body.note !== undefined || body.detail !== undefined) {
      const blank = (v: string | null | undefined) => {
        const t = v?.trim() ?? "";
        return t === "" ? null : t;
      };
      // ⚠️ Read the current prose first: a PATCH carrying only one field must not
      // clear the other, and the shared stamp is derived from both.
      const current = await getClientSummaryText(clientId);
      found = await setClientSummaryNote(
        clientId,
        {
          ...(body.note !== undefined ? { note: blank(body.note) } : {}),
          ...(body.detail !== undefined ? { detail: blank(body.detail) } : {}),
        },
        current,
      );
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
