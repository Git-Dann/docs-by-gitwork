import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { updateForemanConfig } from "@/server/foreman/queries";
import { foremanConfigSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const body = await request.json();
    const patch = foremanConfigSchema.parse(body);
    const config = await updateForemanConfig(patch);
    return apiOk({ config });
  } catch (error) {
    return fromError(error);
  }
}
