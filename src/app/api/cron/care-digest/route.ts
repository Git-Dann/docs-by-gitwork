import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { postCareDigestForEveryWorkspace } from "@/server/support-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    const workspaces = await postCareDigestForEveryWorkspace();
    return apiOk({ posted: true, workspaces });
  } catch (error) {
    return fromError(error);
  }
}
