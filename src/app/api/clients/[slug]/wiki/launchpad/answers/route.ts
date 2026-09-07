/** Internal: save Launchpad field answers (the flat, non-checklist fields). */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { saveLaunchpadAnswers } from "@/server/launchpad";
import { resolveInternalLaunchpadTarget } from "@/server/launchpad-access";
import { launchpadAnswersSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "manage the Launchpad");
    const { slug } = await params;
    const target = await resolveInternalLaunchpadTarget(slug);
    if (!target) return apiError("Client not found", 404);

    const { answers } = launchpadAnswersSchema.parse(await req.json());
    const launchpad = await saveLaunchpadAnswers(target.wikiId, answers);
    if (!launchpad) return apiError("No Launchpad assigned for this client", 409);
    return apiOk({ launchpad });
  } catch (err) {
    return fromError(err);
  }
}
