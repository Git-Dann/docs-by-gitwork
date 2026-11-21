import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { UnauthorizedError } from "@/server/auth/effective-user";
import { cronNameFromPath } from "@/lib/cron-watch";
import { markSystem } from "@/server/system-markers";

/**
 * Constant-time string compare. timingSafeEqual requires equal-length buffers and
 * would itself leak length, so both sides are HMAC'd to a fixed 32 bytes first —
 * this both normalises length and keeps the comparison constant-time.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cron-auth-compare").update(a).digest();
  const hb = createHmac("sha256", "cron-auth-compare").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Authorize a VPS host-cron request to an /api/cron/* endpoint.
 *
 * Fail-CLOSED: if CRON_SECRET is unset the request is rejected. The previous
 * per-route guard was `if (secret) { …check… }`, which failed OPEN — an unset or
 * mistyped secret silently disabled auth and let anyone trigger backups, retention,
 * archival, sync, etc. Also compares in constant time (was `!==`, timing-attackable).
 *
 * Throws UnauthorizedError (→ 401 via fromError); callers keep their try/catch.
 * Note: this means local runs must set CRON_SECRET to hit /api/cron/* by hand.
 */
export function assertCron(request: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new UnauthorizedError("CRON_SECRET is not configured");
  }
  const header = request.headers.get("Authorization") ?? "";
  if (!timingSafeEqualStr(header, `Bearer ${secret}`)) {
    throw new UnauthorizedError();
  }
  // Record that the scheduler called this job, for the watchdog that notices a job has
  // stopped (src/server/cron-watchdog.ts, CLAUDE.md §144).
  //
  // ⚠️ This was `void markSystem(...)` and the marker NEVER landed — so the watchdog called
  // every job stopped while the box's own cron log showed all of them running, and
  // /api/health?cron=1 answered 503 on every probe. An alarm that cries wolf is worse than no
  // alarm, which §144 says in its own words about the latches.
  //
  // The tell was that EVERY other `markSystem` call in the codebase is awaited and lands, and
  // this one — the only un-awaited one — is the only one that does not: `cron-watch-since` and
  // `cron-alert:*`, written from the jobs worker, persist fine. `assertCron` is synchronous and
  // called by ~21 route handlers, so it cannot await; work merely started during a request is
  // not guaranteed to run once the response is sent. `after()` is what this codebase already
  // uses for post-response work (§36), and it is the one form that is guaranteed to finish.
  const name = cronNameFromPath(new URL(request.url).pathname);
  if (!name) return;
  try {
    after(() => markSystem(`cron:${name}`));
  } catch {
    // `after()` throws outside a request scope. assertCron is only ever called from a route
    // handler, but a direct call in a test or a script must not be made to fail by its own
    // bookkeeping — and markSystem never throws either.
    void markSystem(`cron:${name}`);
  }
}
