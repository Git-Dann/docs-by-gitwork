import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { duplicateOnboardingForm } from "@/server/onboarding-forms";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageClients, "manage onboarding forms");
    const { id } = await params;
    const form = await duplicateOnboardingForm(id);
    if (!form) return apiError("Onboarding form not found", 404);
    return apiOk({ form }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
