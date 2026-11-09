import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import {
  createOnboardingLink,
  listOnboardingLinks,
} from "@/server/onboarding";
import { onboardingLinkCreateSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { requestWorkspaceId, workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const result = await listOnboardingLinks(await workspaceIdForRequest(request));
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "manage onboarding links");
    const body = onboardingLinkCreateSchema.parse(await request.json().catch(() => ({})));
    const link = await createOnboardingLink(await requestWorkspaceId(user), body);
    return apiOk({ link }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
