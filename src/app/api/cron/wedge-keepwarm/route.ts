import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { ensureBaseRecords } from "@/server/bootstrap";
import { prisma } from "@/lib/prisma";
import { pingCourseBackend } from "@/server/bigwedge-course-api";
import { checkCourseFeedWatchdog } from "@/server/wedge-course-feed";
import { runOnce } from "@/server/cron-single-run";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Keep-warm ping for the Big Wedge course backend — a tiny authed DB read so its
 * CockroachDB free tier doesn't idle into a cold start (which otherwise makes the
 * console's first load spin for seconds). Scheduled every 5 minutes in deploy/crontab.
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);
    // Gitwork only, by design: the feed belongs to Gitwork's client Wedge.
    const { workspace } = await ensureBaseRecords();
    const client = await prisma.workspaceClient.findFirst({
      where: { workspaceId: workspace.id, slug: "wedge" },
      select: { id: true },
    });
    if (!client) return apiOk({ pinged: false, reason: "wedge client not found" });

    // Rides on this 5-minute cron to notice the HOURLY course-request feed not running at
    // all — the one failure that run cannot report itself. Never allowed to break the ping.
    // Under a lock: this route may be scheduled twice (the managed crontab plus an old root
    // crontab line, see docs/vps-crons.md), and two watchdogs at once could both post the
    // client's Slack alert before either records it.
    await runOnce("wedge-keepwarm-watchdog", () => checkCourseFeedWatchdog(workspace.id)).catch((err) =>
      console.error("[wedge-keepwarm] course-feed watchdog failed", err),
    );

    const result = await pingCourseBackend(client.id);
    return apiOk({ pinged: true, ...result });
  } catch (err) {
    return fromError(err);
  }
}
