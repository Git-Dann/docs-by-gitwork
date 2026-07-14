import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { createDataRequest } from "@/server/devsignal/public";
import { vetDataRequestSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

/** Candidate data-rights request: explanation / appeal / erasure (GDPR). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    await assertWithinRateLimit({
      bucket: `vet:request:${clientIpFrom(request.headers) ?? "unknown"}`,
      max: 10,
      windowMs: 60_000,
      message: "Too many requests — please wait a moment.",
    });
    const body = vetDataRequestSchema.parse(await request.json());
    const result = await createDataRequest(token, body);
    if (!result.ok) return apiError("Assessment not found or expired", 404);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
