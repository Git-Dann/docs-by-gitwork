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

// Tuneable caps. Generous enough for genuine evaluation, tight enough to deter abuse.
const PER_IP_PER_HOUR = 8;
const PER_IP_PER_DAY = 30;
const PER_HOST_PER_HOUR = 12; // stops hammering a single target through us

export async function assertWithinLiteScanQuota(params: { ip: string | null; targetHost: string }): Promise<void> {
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);

  const [ipHour, ipDay, hostHour] = await Promise.all([
    params.ip
      ? prisma.pulseLiteScan.count({ where: { ip: params.ip, createdAt: { gte: hourAgo } } })
      : Promise.resolve(0),
    params.ip
      ? prisma.pulseLiteScan.count({ where: { ip: params.ip, createdAt: { gte: dayAgo } } })
      : Promise.resolve(0),
    prisma.pulseLiteScan.count({ where: { targetHost: params.targetHost, createdAt: { gte: hourAgo } } }),
  ]);

  if (ipHour >= PER_IP_PER_HOUR || ipDay >= PER_IP_PER_DAY) {
    throw new RateLimitedError();
  }
  if (hostHour >= PER_HOST_PER_HOUR) {
    throw new RateLimitedError("This site has been scanned several times recently — please try again later.");
  }
}

/** Best-effort client IP from standard proxy headers (Vercel sets these). */
export function clientIpFrom(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip");
}
