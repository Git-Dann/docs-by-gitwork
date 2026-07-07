import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { enqueueJob } from "@/server/jobs/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/retention  (host cron on the VPS — see CLAUDE.md §23/§25)
 *
 * Enqueues a single deduped RETENTION_SWEEP job; the job worker (`/api/cron/jobs`) runs it. Daily
 * is plenty — aging is measured in days. Deduped, so overlapping ticks don't stack sweeps.
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    const { id, deduped } = await enqueueJob({
      type: "RETENTION_SWEEP",
      payload: {},
      dedupeKey: "retention-sweep",
    });

    return apiOk({ jobId: id, queued: !deduped });
  } catch (error) {
    return fromError(error);
  }
}
