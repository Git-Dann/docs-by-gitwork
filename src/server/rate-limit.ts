/**
 * Generic Postgres-backed fixed-window rate limiter (no Redis).
 *
 * Counts rows in `RateLimitHit` for a given opaque `bucket` within a time window and
 * throws `RateLimitedError` (HTTP 429 via `fromError`) once the cap is exceeded. Each
 * permitted call records one hit and best-effort prunes the bucket's stale rows.
 *
 * Fail-open by design: any infrastructure error is swallowed so the limiter never blocks
 * a legitimate request because of a transient DB issue. Use it for defence-in-depth on
 * public endpoints, not as a correctness-critical gate.
 */

import { prisma } from "@/lib/prisma";

/** Error carrying a 429 so `fromError` maps it to "Too Many Requests". */
export class RateLimitedError extends Error {
  status = 429;
  constructor(message = "Too many requests — please slow down and try again shortly.") {
    super(message);
    this.name = "RateLimitedError";
  }
}

export async function assertWithinRateLimit(params: {
  bucket: string;
  max: number;
  windowMs: number;
  message?: string;
}): Promise<void> {
  try {
    const since = new Date(Date.now() - params.windowMs);
    const recent = await prisma.rateLimitHit.count({
      where: { bucket: params.bucket, createdAt: { gte: since } },
    });
    if (recent >= params.max) throw new RateLimitedError(params.message);
    await prisma.rateLimitHit.create({ data: { bucket: params.bucket } });
    // Best-effort prune of this bucket's rows that have aged out of the window.
    void prisma.rateLimitHit
      .deleteMany({ where: { bucket: params.bucket, createdAt: { lt: since } } })
      .catch(() => {});
  } catch (error) {
    if (error instanceof RateLimitedError) throw error;
    // Fail-open on any infra error — never block a legitimate request.
  }
}

/** Best-effort client IP from standard proxy headers (Vercel sets these). */
export function clientIpFrom(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip");
}
