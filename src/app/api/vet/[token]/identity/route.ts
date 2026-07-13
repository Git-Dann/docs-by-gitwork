import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { submitIdentity } from "@/server/devsignal/public";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    await assertWithinRateLimit({
      bucket: `vet:identity:${clientIpFrom(request.headers) ?? "unknown"}`,
      max: 10,
      windowMs: 60_000,
      message: "Too many requests — please wait a moment.",
    });
    const result = await submitIdentity(token);
    if (!result.ok) return apiError("Assessment not found or expired", 404);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
