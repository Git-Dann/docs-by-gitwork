import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { submitChallenge } from "@/server/devsignal/public";
import { vetChallengeSubmitSchema } from "@/server/validators";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    await assertWithinRateLimit({
      bucket: `vet:challenge:${clientIpFrom(request.headers) ?? "unknown"}`,
      max: 20,
      windowMs: 60_000,
      message: "Too many submissions — please wait a moment.",
    });
    const body = vetChallengeSubmitSchema.parse(await request.json());
    const result = await submitChallenge(token, body);
    if (!result.ok) return apiError("Assessment not found or expired", 404);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
