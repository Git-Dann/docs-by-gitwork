import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { saveOnboardingBank } from "@/server/onboarding";
import { onboardingBankSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = onboardingBankSchema.parse(await request.json());
    const session = await saveOnboardingBank(token, body);
    if (!session) return apiError("Onboarding session not found", 404);
    return apiOk({ session });
  } catch (error) {
    return fromError(error);
  }
}
