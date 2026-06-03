import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import {
  deleteOnboardingForm,
  getOnboardingForm,
  updateOnboardingForm,
} from "@/server/onboarding-forms";
import { onboardingFormUpdateSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const form = await getOnboardingForm(id);
    if (!form) return apiError("Onboarding form not found", 404);
    return apiOk({ form });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageClients, "manage onboarding forms");
    const { id } = await params;
    const body = onboardingFormUpdateSchema.parse(await request.json());
    const form = await updateOnboardingForm(id, body);
    if (!form) return apiError("Onboarding form not found", 404);
    return apiOk({ form });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageClients, "manage onboarding forms");
    const { id } = await params;
    const result = await deleteOnboardingForm(id);
    if (!result) return apiError("Onboarding form not found", 404);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
