import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { ensureBaseRecords } from "@/server/bootstrap";
import { runWedgeCourseFeed } from "@/server/wedge-course-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Hourly pull of Big Wedge course requests into the Wedge wiki — see
 * src/server/wedge-course-feed.ts. Installed in the VPS host crontab
 * (docs/vps-crons.md):
 *   15 * * * * /opt/apps/foundry/run-cron.sh wedge-course-feed
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);
    const { workspace } = await ensureBaseRecords();
    const results = await runWedgeCourseFeed(workspace.id);
    return apiOk({ results });
  } catch (err) {
    return fromError(err);
  }
}
