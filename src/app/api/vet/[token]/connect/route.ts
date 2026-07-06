import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertWithinRateLimit, clientIpFrom } from "@/server/rate-limit";
import { connectGithub } from "@/server/devsignal/public";
import { vetConnectSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    await assertWithinRateLimit({
      bucket: `vet:connect:${clientIpFrom(request.headers) ?? "unknown"}`,
      max: 30,
      windowMs: 60_000,
      message: "Too many requests — please wait a moment.",
    });
    const body = vetConnectSchema.parse(await request.json());
    const session = await connectGithub(token, body.githubHandle);
    if (!session) return apiError("Assessment not found or expired", 404);
    return apiOk({ session });
  } catch (error) {
    return fromError(error);
  }
}
