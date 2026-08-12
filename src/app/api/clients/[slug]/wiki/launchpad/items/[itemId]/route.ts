/** Internal: move one Launchpad requirement (status / link / note / owner). */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { updateLaunchpadItem } from "@/server/launchpad";
import { resolveInternalLaunchpadTarget } from "@/server/launchpad-access";
import { launchpadItemPatchSchema } from "@/server/validators";
import {
  assertCan,
  canManageClients,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; itemId: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(req);
    assertCan(user, canManageClients, "manage the Launchpad");
    const { slug, itemId } = await params;

    const target = await resolveInternalLaunchpadTarget(slug);
    if (!target) return apiError("Client not found", 404);

    const patch = launchpadItemPatchSchema.parse(await req.json());
    // Stamp who moved it, so the client can see it was us rather than wondering.
    const actor = user?.name?.trim() || user?.email || "Gitwork";
    const launchpad = await updateLaunchpadItem(target.wikiId, itemId, patch, actor);
    if (!launchpad) {
      // Either the section is off, no kit is assigned, or the id isn't in this kit's
      // own snapshot — all "this requirement isn't part of this Launchpad".
      return apiError("That requirement isn't part of this client's Launchpad", 409);
    }
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}
