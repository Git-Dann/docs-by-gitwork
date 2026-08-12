/**
 * Client-facing: the client moves one requirement (status / link / note).
 *
 * Hardened posture — token + wiki-access cookie + the item must belong to THIS
 * wiki's own kit snapshot (checked inside `updateLaunchpadItem`, which rejects any
 * id that isn't in the frozen structure).
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { updateLaunchpadItem } from "@/server/launchpad";
import {
  assertLaunchpadWriteRate,
  launchpadAccessError,
  resolveLaunchpadWriter,
} from "@/server/launchpad-access";
import { launchpadItemPatchSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; itemId: string }> },
) {
  try {
    const { token, itemId } = await params;
    const access = await resolveLaunchpadWriter(req, token);
    if (!access.ok) {
      const { message, status } = launchpadAccessError(access.reason);
      return apiError(message, status);
    }
    await assertLaunchpadWriteRate(req);

    const patch = launchpadItemPatchSchema.parse(await req.json());
    const launchpad = await updateLaunchpadItem(
      access.writer.wikiId,
      itemId,
      patch,
      access.writer.actorName,
    );
    if (!launchpad) {
      return apiError("That requirement isn't part of this Launchpad", 409);
    }
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}
