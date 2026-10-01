/**
 * GET /api/cron/member-purge — delete memberships archived longer than the
 * retention window. Daily, CRON_SECRET-guarded, scheduled in docs/vps-crons.md.
 *
 * ⚠️ This is a tidy-up, not a security control. An archived member already has no
 * access, and one past the window can no longer be restored, whether or not this
 * has run. If the crontab line is missing, nothing becomes less safe — rows just
 * linger. Deletes memberships only, never Users: see purgeExpiredMembers().
 */
import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { purgeExpiredMembers } from "@/server/team";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // The shared cron gate, same as every other /api/cron/* route.
    assertCron(request);
    const result = await purgeExpiredMembers();
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}
