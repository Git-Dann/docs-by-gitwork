import { NextRequest, after } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { runOnce } from "@/server/cron-single-run";
import { backupConfig } from "@/server/db-backup";
import { runRestoreTest } from "@/server/db-restore-test";

export const dynamic = "force-dynamic";

/** A restore can take longer than run-cron.sh waits (330s), so the work runs after the answer. */
const RESTORE_TIMEOUT_MS = 60 * 60_000;

/**
 * GET /api/cron/db-restore-test  (deploy/crontab, monthly)
 *
 * Restores the newest off-site backup into a throwaway database, compares row counts with
 * production and drops it (src/server/db-restore-test.ts). Answers `{ skipped }` while the
 * backup bucket isn't configured, otherwise `{ started: true }` at once and runs afterwards:
 * the outcome is the `db-restore-ok` / `db-restore-failed` marker, an ops alert on failure, and
 * the Platform popup on Monitors. One at a time (runOnce); a second call while one runs does
 * nothing.
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);
    const config = backupConfig();
    if ("skipped" in config) return apiOk({ skipped: "The restore test is off: set BACKUP_S3_* and BACKUP_ENCRYPTION_KEY to switch it on." });
    after(async () => {
      try {
        const result = await runOnce("db-restore-test", () => runRestoreTest(), RESTORE_TIMEOUT_MS);
        console.info(`[db-restore-test] ${result == null ? "already running" : JSON.stringify(result)}`);
      } catch (err) {
        console.error(`[db-restore-test] ${err instanceof Error ? err.message : err}`);
      }
    });
    return apiOk({ started: true });
  } catch (error) {
    return fromError(error);
  }
}
