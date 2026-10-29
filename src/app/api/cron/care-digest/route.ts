import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { postCareDigestForDefaultWorkspace } from "@/server/support-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    await postCareDigestForDefaultWorkspace();
    return apiOk({ posted: true });
  } catch (error) {
    return fromError(error);
  }
}
