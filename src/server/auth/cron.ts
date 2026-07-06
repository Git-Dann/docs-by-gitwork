import { createHmac, timingSafeEqual } from "node:crypto";
import { UnauthorizedError } from "@/server/auth/effective-user";

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
}
