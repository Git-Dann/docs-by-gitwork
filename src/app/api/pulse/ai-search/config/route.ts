import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { aiSearchConfigSchema } from "@/server/validators";
import { assertAtLeastAdmin, assertInternal, requireAuthedUser } from "@/server/auth/effective-user";
import { setAiSearchConfig } from "@/server/ai-search";

export const dynamic = "force-dynamic";

/** PUT /api/pulse/ai-search/config — which Search Console and GA4 properties to read. Admins. */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    assertInternal(user);
    assertAtLeastAdmin(user);
    const config = aiSearchConfigSchema.parse(await request.json());
    return apiOk({ config: await setAiSearchConfig(user.workspaceId, config) });
  } catch (error) {
    return fromError(error);
  }
}
