/**
 * Internal: edit or approve one Launchpad legal doc.
 *
 *   PATCH → save the doc's answers and/or its edited body
 *   POST   → approve / withdraw approval
 *
 * Approval here is Gitwork recording it on the client's behalf (e.g. they confirmed
 * on a call). The client's own route is the same shape under /api/wiki/[token].
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import {
  approveLaunchpadDoc,
  unapproveLaunchpadDoc,
  updateLaunchpadDoc,
} from "@/server/launchpad";
import { resolveInternalLaunchpadTarget } from "@/server/launchpad-access";
import { launchpadDocApproveSchema, launchpadDocPatchSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

const NOT_IN_KIT = "That document isn't part of this client's Launchpad";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; docKey: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the Launchpad");
    const { slug, docKey } = await params;
    const target = await resolveInternalLaunchpadTarget(slug);
    if (!target) return apiError("Client not found", 404);

    const body = launchpadDocPatchSchema.parse(await req.json());
    const launchpad = await updateLaunchpadDoc(target.wikiId, docKey, body);
    if (!launchpad) return apiError(NOT_IN_KIT, 409);
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; docKey: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(req);
    assertCan(user, canManageClients, "manage the Launchpad");
    const { slug, docKey } = await params;
    const target = await resolveInternalLaunchpadTarget(slug);
    if (!target) return apiError("Client not found", 404);

    const { approved } = launchpadDocApproveSchema.parse(await req.json());
    const launchpad = approved
      ? await approveLaunchpadDoc(target.wikiId, docKey, user?.email ?? null)
      : await unapproveLaunchpadDoc(target.wikiId, docKey);
    if (!launchpad) return apiError(NOT_IN_KIT, 409);
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}
