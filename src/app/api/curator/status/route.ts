import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getCuratorStatus } from "@/server/curator/queries";

export const dynamic = "force-dynamic";

// The Curator maintains the Starters library + Pulse checks — Super-Admin only, matching Starters.
export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "view the curator");
    const status = await getCuratorStatus();
    return apiOk({ status });
  } catch (error) {
    return fromError(error);
  }
}
