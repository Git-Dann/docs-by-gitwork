import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { autosaveIntake, getPublicSession } from "@/server/devsignal/public";
import { vetIntakeSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    await assertWithinRateLimit({
      bucket: `vet:get:${clientIpFrom(request.headers) ?? "unknown"}`,
      max: 120,
      windowMs: 60_000,
      message: "Too many requests — please wait a moment and reload.",
    });
    const session = await getPublicSession(token);
    if (!session) return apiError("Assessment not found", 404);
    return apiOk({ session });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    await assertWithinRateLimit({
      bucket: `vet:patch:${clientIpFrom(request.headers) ?? "unknown"}`,
      max: 120,
      windowMs: 60_000,
      message: "Too many requests — please slow down.",
    });
    const body = vetIntakeSchema.parse(await request.json());
    const session = await autosaveIntake(token, body);
    if (!session) return apiError("Assessment not found or expired", 404);
    return apiOk({ session });
  } catch (error) {
    return fromError(error);
  }
}
