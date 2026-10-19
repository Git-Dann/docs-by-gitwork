/**
 * Internal: edit or remove a requirement Gitwork added to ONE client's Launchpad.
 *
 * Only custom items (`custom: true`, `custom-` id) can be changed here — a template
 * item is part of the agreed kit, and changing it per client belongs in the
 * template. Removing keeps the item's status/link/note row and its files; it only
 * stops the snapshot asking for it.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { removeLaunchpadCustomItem, updateLaunchpadCustomItem } from "@/server/launchpad";
import { resolveInternalLaunchpadTarget } from "@/server/launchpad-access";
import { launchpadCustomItemPatchSchema } from "@/server/validators";
import {
  assertCan,
  canManageClients,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; itemId: string }> };

const NOT_CUSTOM =
  "Only a requirement added for this client can be changed here — template requirements are edited in Settings → Launchpad.";

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the Launchpad");
    const { slug, itemId } = await params;
    const target = await resolveInternalLaunchpadTarget(slug);
    if (!target) return apiError("Client not found", 404);

    const patch = launchpadCustomItemPatchSchema.parse(await req.json());
    const launchpad = await updateLaunchpadCustomItem(target.wikiId, itemId, patch);
    if (!launchpad) return apiError(NOT_CUSTOM, 409);
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the Launchpad");
    const { slug, itemId } = await params;
    const target = await resolveInternalLaunchpadTarget(slug);
    if (!target) return apiError("Client not found", 404);

    const launchpad = await removeLaunchpadCustomItem(target.wikiId, itemId);
    if (!launchpad) return apiError(NOT_CUSTOM, 409);
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}
