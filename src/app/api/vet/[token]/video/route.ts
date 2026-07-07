import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { submitVideo } from "@/server/devsignal/public";
import { vetVideoSubmitSchema } from "@/server/validators";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    await assertWithinRateLimit({
      bucket: `vet:video:${clientIpFrom(request.headers) ?? "unknown"}`,
      max: 10,
      windowMs: 60_000,
      message: "Too many submissions — please wait a moment.",
    });
    const body = vetVideoSubmitSchema.parse(await request.json());
    const result = await submitVideo(token, body);
    if (!result.ok) return apiError("Assessment not found or expired", 404);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
