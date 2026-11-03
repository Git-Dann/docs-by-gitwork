/**
 * Internal: add a requirement to ONE client's Launchpad.
 *
 * Written into that client's kit snapshot, never the master template — so one
 * client's bespoke ask can never leak onto everyone else's kit. There is
 * deliberately no `/api/wiki/[token]/…` counterpart: a client answers what is asked
 * of them, they don't change what is asked.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { addLaunchpadCustomItem } from "@/server/launchpad";
import { resolveInternalLaunchpadTarget } from "@/server/launchpad-access";
import { launchpadCustomItemCreateSchema } from "@/server/validators";
import {
  assertCan,
  canManageClients,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the Launchpad");
    const { slug } = await params;
    const target = await resolveInternalLaunchpadTarget(slug);
    if (!target) return apiError("Client not found", 404);

    const { moduleId, ...input } = launchpadCustomItemCreateSchema.parse(await req.json());
    const launchpad = await addLaunchpadCustomItem(target.wikiId, moduleId, input);
    if (!launchpad) {
      return apiError("That module isn't part of this client's Launchpad", 409);
    }
    return apiOk({ launchpad }, { status: 201 });
  } catch (err) {
    return fromError(err);
  }
}
