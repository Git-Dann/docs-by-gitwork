import { apiOk, fromError } from "@/lib/api-response";
import { assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { getCostingConfigInfo } from "@/server/costing";

export const dynamic = "force-dynamic";

// Prefill: live FX, rate-card presence, sample blended build day rate. Super-Admin only.
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    assertSuperAdmin(user);
    return apiOk(await getCostingConfigInfo(user.workspaceId));
  } catch (e) {
    return fromError(e);
  }
}
