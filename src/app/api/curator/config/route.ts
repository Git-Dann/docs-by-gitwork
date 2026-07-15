import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { updateCuratorConfig } from "@/server/curator/queries";
import { curatorConfigSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "update curator settings");
    const body = await request.json();
    const patch = curatorConfigSchema.parse(body);
    const config = await updateCuratorConfig(patch);
    return apiOk({ config });
  } catch (error) {
    return fromError(error);
  }
}
