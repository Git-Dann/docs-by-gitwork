import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { runOnce } from "@/server/cron-single-run";
import { runDbBackup } from "@/server/db-backup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/db-backup  (deploy/crontab, daily)
 *
 * Off-site, encrypted pg_dump to the BACKUP_S3_* bucket (src/server/db-backup.ts). Answers
 * `{ skipped }` while that isn't configured. One at a time: a second call while a backup runs
 * returns `{ running: true }`.
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);
    const result = await runOnce("db-backup", () => runDbBackup(), 290_000);
    return apiOk(result ?? { running: true });
  } catch (error) {
    return fromError(error);
  }
}
