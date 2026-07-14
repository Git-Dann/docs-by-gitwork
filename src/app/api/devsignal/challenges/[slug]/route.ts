import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageDevSignal, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { updateChallenge } from "@/server/devsignal/challenge-store";
import { devSignalChallengeUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDevSignal, "edit a DevSignal challenge");
    const { workspace } = await ensureBaseRecords();
    const { slug } = await params;
    const body = devSignalChallengeUpdateSchema.parse(await request.json());
    const challenge = await updateChallenge(workspace.id, slug, body);
    if (!challenge) return apiError("Challenge not found.", 404);
    return apiOk({ challenge });
  } catch (error) {
    return fromError(error);
  }
}
