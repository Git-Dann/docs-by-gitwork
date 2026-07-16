import { apiOk, fromError } from "@/lib/api-response";
import { assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { getCostingConfigInfo, saveCostingConfig } from "@/server/costing";
import { costingConfigSaveSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

// Prefill: live FX, saved config, Rate-Card-seeded dev rates, sample blended rate. Super-Admin only.
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    assertSuperAdmin(user);
    return apiOk(await getCostingConfigInfo(user.workspaceId));
  } catch (e) {
    return fromError(e);
  }
}

// Persist the workspace costing config (advanced levers + editable dev rate table). Super-Admin only.
export async function PUT(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    assertSuperAdmin(user);
    const body = costingConfigSaveSchema.parse(await req.json());
    return apiOk(await saveCostingConfig(user.workspaceId, body));
  } catch (e) {
    return fromError(e);
  }
}
