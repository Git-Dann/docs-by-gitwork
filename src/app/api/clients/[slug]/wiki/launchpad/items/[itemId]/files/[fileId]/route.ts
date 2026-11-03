/**
 * Internal: download or remove one file on a Launchpad requirement.
 *
 * GET mirrors the internal Launchpad GET (any signed-in team member who can open the
 * client's wiki); DELETE needs `canManageClients`. Downloads are always attachments
 * with `nosniff` — see `launchpadFileResponse`.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { deleteLaunchpadItemFile, getLaunchpadItemFile } from "@/server/launchpad";
import { resolveInternalLaunchpadTarget } from "@/server/launchpad-access";
import { launchpadFileResponse } from "@/server/launchpad-files-http";
import {
  assertCan,
  canManageClients,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; itemId: string; fileId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { slug, itemId, fileId } = await params;
    const target = await resolveInternalLaunchpadTarget(slug);
    if (!target) return apiError("Client not found", 404);
    const file = await getLaunchpadItemFile(target.wikiId, itemId, fileId, {
      requireEnabled: false,
    });
    if (!file) return apiError("File not found", 404);
    return launchpadFileResponse(file);
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await getEffectiveUserOrNull(req);
    assertCan(user, canManageClients, "manage the Launchpad");
    const { slug, itemId, fileId } = await params;
    const target = await resolveInternalLaunchpadTarget(slug);
    if (!target) return apiError("Client not found", 404);
    const name = user?.name?.trim() || user?.email || "Gitwork";
    const launchpad = await deleteLaunchpadItemFile(target.wikiId, itemId, fileId, {
      kind: "team",
      name,
    });
    if (!launchpad) return apiError("File not found", 404);
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}
