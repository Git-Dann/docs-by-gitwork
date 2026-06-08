import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { postCareDigestForDefaultWorkspace } from "@/server/support-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${secret}`) {
        return apiError("Unauthorized", 401);
      }
    }

    await postCareDigestForDefaultWorkspace();
    return apiOk({ posted: true });
  } catch (error) {
    return fromError(error);
  }
}
