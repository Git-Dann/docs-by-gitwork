import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import {
  autosaveOnboarding,
  getOnboardingByTokenPublic,
} from "@/server/onboarding";
import { onboardingAutosaveSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const session = await getOnboardingByTokenPublic(token);
    if (!session) return apiError("Onboarding session not found", 404);
    return apiOk({ session });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = onboardingAutosaveSchema.parse(await request.json());
    const session = await autosaveOnboarding(token, body);
    if (!session) return apiError("Onboarding session not found", 404);
    return apiOk({ session });
  } catch (error) {
    return fromError(error);
  }
}
