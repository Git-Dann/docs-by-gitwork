import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { runAvailabilityDigest } from "@/server/availability-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One combined leave + absence digest per weekday morning (Mon = week roll-up,
// Tue–Fri = out today; weekends skipped; silent when nobody's off). CRON_SECRET-guarded.
//
// NOTE: crons are host-triggered on the VPS (see CLAUDE.md §23) — wire this into
// the host scheduler at ~08:30 on weekdays for the digest to fire.
export async function GET(request: NextRequest) {
  try {
    assertCron(request);
    const { posted } = await runAvailabilityDigest();
    return apiOk({ posted });
  } catch (e) {
    return fromError(e);
  }
}
