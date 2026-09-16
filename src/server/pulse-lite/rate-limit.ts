/**
 * Abuse protection for the public lite scanner — Postgres-backed (no Redis).
 *
 * Counts recent rows in PulseLiteScan keyed by source IP and target host. This
 * is intentionally simple: the lite scan is cheap, and the point is to stop a
 * single actor from turning our servers into a free mass-scanning bot.
 */

import { prisma } from "@/lib/prisma";

/** Error carrying a 429 so `fromError` maps it to "Too Many Requests". */
export class RateLimitedError extends Error {
  status = 429;
  constructor(message = "You've run a lot of scans recently — please wait a little while and try again.") {
    super(message);
    this.name = "RateLimitedError";
  }
}

/**
 * Caps, and the reasoning behind each number.
 *
 * ⚠️ Note what did NOT change the cost model: the scan has always run the FULL
 * deterministic suite. The old "curated 10 checks" only filtered what was
 * DISPLAYED, so opening the free tier up did not make a scan more expensive. What
 * rises is volume — the free result is now genuinely worth having and is shareable
 * by URL — so these are sized for more traffic at the same unit cost.
 *
 * Measured per scan (real sites, public options — no AI, no headless browser, no
 * PageSpeed, no GitHub quota): 2.2s for a bare page, 21.2s for stripe.com. Pure
 * outbound HTTP, so the binding constraint is not CPU, it is not starving the
 * internal app that shares this box.
 */
const PER_IP_PER_HOUR = 12; // was 8 — a genuine evaluator scans a handful of sites
const PER_IP_PER_DAY = 40; // was 30
const PER_HOST_PER_HOUR = 12; // stops hammering a single target through us

/**
 * Max scans in flight at once, across everyone.
 *
 * ⚠️ This is the cap that actually protects the product, and it did not exist.
 * The per-IP limits bound one actor; nothing bounded the TOTAL. Eight requests
 * each from a hundred addresses was eight hundred concurrent scans, and the same
 * container serves the authenticated app that paying work runs through — so the
 * failure mode was never "the scanner gets slow", it was "Foundry gets slow".
 *
 * Sized against the actual box: 12 cores, 23Gi RAM, idle load ~0.03. Scans are
 * I/O-bound, so 12 concurrent is comfortable while still refusing a stampede.
 * A refused scan gets a clear, honest 429 with Retry-After — not a queue that
 * silently turns into a timeout.
 */
const MAX_CONCURRENT_SCANS = 12;

/** A scan stuck RUNNING longer than this is presumed dead, not occupying a slot. */
const STALE_RUNNING_MS = 3 * 60 * 1000;

/** What the caller may advertise back to the client. See `rateLimitHeaders`. */
export interface QuotaSnapshot {
  limit: number;
  remaining: number;
  /** Seconds until the oldest counted scan falls out of the hour window. */
  resetSeconds: number;
}

export async function assertWithinLiteScanQuota(
  params: { ip: string | null; targetHost: string },
): Promise<QuotaSnapshot> {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const staleBefore = new Date(now - STALE_RUNNING_MS);

  const [ipHour, ipDay, hostHour, inFlight] = await Promise.all([
    params.ip
      ? prisma.pulseLiteScan.count({ where: { ip: params.ip, createdAt: { gte: hourAgo } } })
      : Promise.resolve(0),
    params.ip
      ? prisma.pulseLiteScan.count({ where: { ip: params.ip, createdAt: { gte: dayAgo } } })
      : Promise.resolve(0),
    prisma.pulseLiteScan.count({ where: { targetHost: params.targetHost, createdAt: { gte: hourAgo } } }),
    // Only scans that are plausibly still alive hold a slot. Without the staleness
    // window a crashed scan would occupy one forever and the cap would ratchet
    // down to zero — a self-inflicted outage that looks like traffic.
    prisma.pulseLiteScan.count({
      where: { status: "RUNNING", createdAt: { gte: staleBefore } },
    }),
  ]);

  if (inFlight >= MAX_CONCURRENT_SCANS) {
    throw new RateLimitedError(
      "A lot of scans are running right now — give it a few seconds and try again.",
    );
  }
  if (ipHour >= PER_IP_PER_HOUR || ipDay >= PER_IP_PER_DAY) {
    throw new RateLimitedError();
  }
  if (hostHour >= PER_HOST_PER_HOUR) {
    throw new RateLimitedError("This site has been scanned several times recently — please try again later.");
  }

  return {
    limit: PER_IP_PER_HOUR,
    remaining: Math.max(0, PER_IP_PER_HOUR - ipHour - 1),
    resetSeconds: 3600,
  };
}

/**
 * Standard rate-limit headers for a public response.
 *
 * ⚠️ Pulse WARNS every site it scans for not sending these (`api_rate_limit_headers`,
 * api-behaviour.ts: "a well-behaved client has no way to pace itself, so it discovers
 * your limit by hitting it") — and sent none of its own. Both the IETF form and the
 * older X- form, because real clients read both.
 */
export function rateLimitHeaders(q: QuotaSnapshot): Record<string, string> {
  return {
    "RateLimit-Policy": `${q.limit};w=3600`,
    "RateLimit-Limit": String(q.limit),
    "RateLimit-Remaining": String(q.remaining),
    "RateLimit-Reset": String(q.resetSeconds),
    "X-RateLimit-Limit": String(q.limit),
    "X-RateLimit-Remaining": String(q.remaining),
  };
}

/** Retry-After for a 429. Advisory, but a client that honours it stops hammering. */
export function retryAfterHeaders(seconds = 30): Record<string, string> {
  return { "Retry-After": String(seconds) };
}

/** Best-effort client IP from standard proxy headers (Vercel sets these). */
export function clientIpFrom(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip");
}
