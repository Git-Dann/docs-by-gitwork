import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { postCareDigest } from "@/server/support-notify";
import { forEachWorkspace } from "@/server/workspaces/for-each";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// One digest per workspace that has Care clients, each to that workspace's own Slack route.
export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    const runs = await forEachWorkspace(
      { where: { supportClients: { some: {} } }, select: { id: true } },
      (ws) => postCareDigest(ws.id),
    );
    return apiOk({ posted: true, workspaces: runs.length });
  } catch (error) {
    return fromError(error);
  }
}
