import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageDevSignal, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { createChallenge, listAllChallenges } from "@/server/devsignal/challenge-store";
import { devSignalChallengeSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDevSignal, "view the DevSignal challenge bank");
    const { workspace } = await ensureBaseRecords();
    return apiOk({ items: await listAllChallenges(workspace.id) });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageDevSignal, "create a DevSignal challenge");
    const { workspace } = await ensureBaseRecords();
    const body = devSignalChallengeSchema.parse(await request.json());
    const challenge = await createChallenge(workspace.id, body, user?.id ?? null);
    return apiOk({ challenge }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
