import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { runDueMonitors } from "@/server/wiki-monitors";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Probe every enabled wiki monitor that's due (its interval has elapsed) and
 * prune old check history. Meant to run frequently — every ~5 min via the VPS
 * host cron (see §23; each monitor self-throttles to its own intervalMinutes).
 * CRON_SECRET-guarded like the other /api/cron/* routes.
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);
    const result = await runDueMonitors();
    return apiOk(result);
  } catch (err) {
    return fromError(err);
  }
}
