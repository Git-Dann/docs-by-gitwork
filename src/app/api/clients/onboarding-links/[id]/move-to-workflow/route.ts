import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { moveOnboardingToWorkflow } from "@/server/onboarding";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageClients, "manage onboarding links");
    const { id } = await params;
    const result = await moveOnboardingToWorkflow(id);
    return apiOk({ slug: result.slug });
  } catch (error) {
    return fromError(error);
  }
}
