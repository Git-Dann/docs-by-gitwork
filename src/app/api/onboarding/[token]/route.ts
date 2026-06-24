import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import {
  autosaveOnboarding,
  getOnboardingByTokenPublic,
} from "@/server/onboarding";
import { onboardingAutosaveSchema } from "@/server/validators";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    // Defence-in-depth against token enumeration (tokens are 192-bit, so brute force is
    // already infeasible — this just stops a single IP hammering the public endpoint).
    await assertWithinRateLimit({
      bucket: `onboarding:get:${clientIpFrom(request.headers) ?? "unknown"}`,
      max: 120,
      windowMs: 60_000,
      message: "Too many requests — please wait a moment and reload.",
    });
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
