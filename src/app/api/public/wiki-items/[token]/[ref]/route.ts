/**
 * PATCH /api/public/wiki-items/:token/:ref — update one intake item from the
 * client's own system, so a status change their side reflects ours.
 *
 * `:ref` is EITHER our item id OR the `externalRef` they sent on create, so an
 * integrator never has to store our ids to keep things in sync.
 *
 * Same auth as the sibling create route: the per-client intake token, never the
 * workspace API_KEY. The lookup is always scoped to the token's own wiki, so a
 * token cannot touch another client's items even if handed a valid id belonging
 * to one — and an item that isn't theirs is indistinguishable from one that
 * doesn't exist, so the endpoint can't be used to probe for ids.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { updateWikiIntakeItemByToken, wikiIntakeTokenState } from "@/server/wiki";
import { intakeCommonFields } from "@/server/wiki-intake-vocab";
import { resolvePresentedIntakeToken } from "@/server/wiki-intake-keys";

const patchSchema = z
  .object({
    ...intakeCommonFields,
    title: z.string().trim().min(1).max(180).optional(),
    // Every field is optional on a patch — only what's sent is changed.
    type: intakeCommonFields.type.optional(),
    priority: intakeCommonFields.priority.optional(),
    status: intakeCommonFields.status.optional(),
  })
  // An empty body would silently no-op and read as success; say so instead.
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; ref: string }> },
) {
  try {
    const { token: presented, ref } = await params;
    // See the sibling create route: named keys are translated at the edge.
    const token = (await resolvePresentedIntakeToken(presented)) ?? presented;
    const patch = patchSchema.parse(await req.json());
    const item = await updateWikiIntakeItemByToken(token, decodeURIComponent(ref), patch);
    if (!item) {
      // Same reasoning as the create route: a switched-off Requests section is a
      // different fix from a bad token or a wrong ref, so don't report all three
      // identically. An item that exists but belongs to ANOTHER client still
      // reads as "not found" — deliberately, so this can't probe for ids.
      const state = await wikiIntakeTokenState(token);
      if (state === "unknown") return apiError("Invalid intake token", 404);
      if (state === "intake_disabled") {
        return apiError(
          "This client's Requests section is switched off in Foundry, so intake is disabled. The token itself is valid.",
          404,
        );
      }
      return apiError("No item with that id or externalRef for this client", 404);
    }
    return apiOk(item);
  } catch (err) {
    return fromError(err);
  }
}
