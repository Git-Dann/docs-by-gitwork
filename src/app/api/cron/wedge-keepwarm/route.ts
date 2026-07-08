import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { ensureBaseRecords } from "@/server/bootstrap";
import { prisma } from "@/lib/prisma";
import { pingCourseBackend } from "@/server/bigwedge-course-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Keep-warm ping for the Big Wedge course backend — a tiny authed DB read so its
 * CockroachDB free tier doesn't idle into a cold start (which otherwise makes the
 * console's first load spin for seconds). Run from the VPS host cron every ~5 min:
 *   (every 5 min) curl -s -H "Authorization: Bearer $CRON_SECRET" \
 *     https://foundry.gitwork.co.uk/api/cron/wedge-keepwarm
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);
    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findFirst({
      where: { workspaceId: workspace.id, slug: "wedge" },
      select: { id: true },
    });
    if (!client) return apiOk({ pinged: false, reason: "wedge client not found" });

    const result = await pingCourseBackend(client.id);
    return apiOk({ pinged: true, ...result });
  } catch (err) {
    return fromError(err);
  }
}
