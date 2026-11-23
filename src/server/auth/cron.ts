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
  // `assertCron` is synchronous and called by ~21 route handlers, so it cannot await the write.
  // Work merely started during a request is not guaranteed to run once the response has been
  // sent, so the marker goes through `after()` — the form this codebase already uses for
  // post-response work (§36), and the one that is guaranteed to finish.
  //
  // ⚠️ This replaced a bare `void markSystem(...)` in #894, and that PR's reasoning was WRONG.
  // It argued the `void` form was why no marker had landed and why /api/health?cron=1 answered
  // 503. The real cause was §145: a 0-byte `run-cron.sh` shipped on 20 Nov, so for two days
  // NOTHING called these routes at all. Nothing here was ever reached, and the `void` form was
  // never shown to be at fault. Keep the change on its own merits, above — but do not cite this
  // line as the fix for that outage, and do not infer from it that the watchdog was wrong. The
  // watchdog was right throughout; #894 read a cron log that had stopped changing and said
  // otherwise. See §145 for what actually happened.
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
