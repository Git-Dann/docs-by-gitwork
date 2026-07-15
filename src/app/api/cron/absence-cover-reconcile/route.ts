import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { expireEndedCovers } from "@/server/absences";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Ends absence covers whose period has passed — removes the cover dev from the
// tasks we added them to and drops the temporary client access, so the absent
// person's board is exactly as they left it. Manual "End cover" does the same on
// demand; this is the auto-on-return-date path. CRON_SECRET-guarded.
//
// NOTE: crons are host-triggered on the VPS (see CLAUDE.md §23) — this must be
// wired into the host scheduler (daily) for auto-revert to fire.
export async function GET(request: NextRequest) {
  try {
    assertCron(request);
    const { ended } = await expireEndedCovers();
    return apiOk({ ended });
  } catch (e) {
    return fromError(e);
  }
}
