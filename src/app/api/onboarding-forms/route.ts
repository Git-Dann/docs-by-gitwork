import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { createOnboardingForm, listOnboardingForms } from "@/server/onboarding-forms";
import { onboardingFormCreateSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
    const result = await listOnboardingForms({ includeArchived });
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageClients, "manage onboarding forms");
    const body = onboardingFormCreateSchema.parse(await request.json());
    const form = await createOnboardingForm(body);
    return apiOk({ form }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
