import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { moveOnboardingToWorkflow } from "@/server/onboarding";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { requestWorkspaceId } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "manage onboarding links");
    const { id } = await params;
    const result = await moveOnboardingToWorkflow(await requestWorkspaceId(user), id);
    return apiOk({ slug: result.slug });
  } catch (error) {
    return fromError(error);
  }
}
