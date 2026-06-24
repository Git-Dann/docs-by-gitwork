import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { submitOnboarding } from "@/server/onboarding";
import { onboardingSubmitSchema } from "@/server/validators";
import { notifyOnboardingSubmitted } from "@/server/onboarding-notify";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    await assertWithinRateLimit({
      bucket: `onboarding:submit:${clientIpFrom(request.headers) ?? "unknown"}`,
      max: 10,
      windowMs: 60_000,
      message: "Too many submissions — please wait a moment and try again.",
    });
    onboardingSubmitSchema.parse(await request.json());
    const session = await submitOnboarding(token);
    if (!session) return apiError("Onboarding session not found", 404);

    // Fire-and-forget Slack notification. Don't block submission on failure.
    notifyOnboardingSubmitted(token).catch(() => {});

    return apiOk({ session });
  } catch (error) {
    return fromError(error);
  }
}
