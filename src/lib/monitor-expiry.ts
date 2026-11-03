/**
 * Pure rules for the parts of monitoring that are not "is it answering right now":
 * certificate and domain expiry, heartbeat (cron/job) monitors, and maintenance windows.
 * No I/O — the server modules (wiki-monitor-expiry.ts, wiki-monitors/heartbeat.ts) call these.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Expiry ───────────────────────────────────────────────────────────────────

/** Warning tiers, most severe last. A tier is announced once; renewing clears it. */
export const SSL_TIERS = ["30d", "14d", "3d", "expired"] as const;
export const DOMAIN_TIERS = ["30d", "7d", "expired"] as const;
export type ExpiryTier = (typeof SSL_TIERS)[number] | (typeof DOMAIN_TIERS)[number];

/** Whole days left, rounded down; negative once expired. */
export function daysLeft(expiresAt: Date, now: Date): number {
  return Math.floor((expiresAt.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Issuers whose certificates renew themselves around 30 days out (ACME and managed certificates).
 * For these, 30 days left is renewal happening on schedule, not a problem — so warning starts at
 * 14 days, by which time the renewal has evidently failed.
 */
const AUTO_RENEWING_ISSUER = /let'?s ?encrypt|isrg|google trust services|zerossl|amazon|cloudflare/i;

export function isAutoRenewingIssuer(issuer: string | null | undefined): boolean {
  return !!issuer && AUTO_RENEWING_ISSUER.test(issuer);
}

/** The SSL tier for a certificate, allowing for issuers that renew on their own. */
export function sslTier(expiresAt: Date | null, issuer: string | null, now: Date): ExpiryTier | null {
  const tier = expiryTier("ssl", expiresAt, now);
  return tier === "30d" && isAutoRenewingIssuer(issuer) ? null : tier;
}

/** Which warning tier an expiry is in, or null when it is comfortably far off. */
export function expiryTier(kind: "ssl" | "domain", expiresAt: Date | null, now: Date): ExpiryTier | null {
  if (!expiresAt) return null;
  if (expiresAt.getTime() <= now.getTime()) return "expired";
  const d = daysLeft(expiresAt, now);
  if (kind === "ssl") {
    if (d < 3) return "3d";
    if (d < 14) return "14d";
    if (d < 30) return "30d";
    return null;
  }
  if (d < 7) return "7d";
  if (d < 30) return "30d";
  return null;
}

function rank(kind: "ssl" | "domain", tier: string | null): number {
  if (!tier) return -1;
  const list: readonly string[] = kind === "ssl" ? SSL_TIERS : DOMAIN_TIERS;
  return list.indexOf(tier);
}

/**
 * Announce a tier only when it is MORE severe than the last one announced — so a certificate
 * with 20 days left is told about once at 30, once at 14, once at 3, not every day.
 */
export function shouldAnnounceTier(kind: "ssl" | "domain", previous: string | null, next: ExpiryTier | null): boolean {
  return next !== null && rank(kind, next) > rank(kind, previous);
}

/** The most severe of several stored tiers (monitors sharing one domain). */
export function mostSevereTier(kind: "ssl" | "domain", tiers: (string | null)[]): string | null {
  return tiers.reduce<string | null>((best, t) => (rank(kind, t) > rank(kind, best) ? t : best), null);
}

/** "expires in 12 days" / "expires today" / "expired 3 days ago". */
export function expiryPhrase(expiresAt: Date, now: Date): string {
  const d = daysLeft(expiresAt, now);
  if (expiresAt.getTime() <= now.getTime()) {
    const ago = Math.max(0, -d - 1);
    return ago === 0 ? "expired today" : `expired ${ago} day${ago === 1 ? "" : "s"} ago`;
  }
  if (d === 0) return "expires today";
  return `expires in ${d} day${d === 1 ? "" : "s"}`;
}

/** Pull the expiration date out of an RDAP domain response (RFC 9083 `events`). */
export function rdapExpiry(body: unknown): Date | null {
  if (!body || typeof body !== "object") return null;
  const events = (body as { events?: unknown }).events;
  if (!Array.isArray(events)) return null;
  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    const { eventAction, eventDate } = e as { eventAction?: unknown; eventDate?: unknown };
    if (typeof eventAction === "string" && /expir/i.test(eventAction) && typeof eventDate === "string") {
      const d = new Date(eventDate);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

// ─── Maintenance ──────────────────────────────────────────────────────────────

/** Alerts are paused while a maintenance window is open. Checks keep running. */
export function inMaintenance(m: { maintenanceUntil: Date | null }, now: Date): boolean {
  return m.maintenanceUntil !== null && m.maintenanceUntil.getTime() > now.getTime();
}

// ─── Heartbeats ───────────────────────────────────────────────────────────────

export interface HeartbeatFields {
  intervalMinutes: number;
  graceMinutes: number | null;
  lastPingAt: Date | null;
  lastPingOk: boolean | null;
  createdAt: Date;
}

/** Default grace: a fifth of the period, at least 5 minutes, at most an hour. */
export function graceMs(m: Pick<HeartbeatFields, "intervalMinutes" | "graceMinutes">): number {
  const minutes = m.graceMinutes ?? Math.min(60, Math.max(5, Math.round(m.intervalMinutes / 5)));
  return minutes * 60 * 1000;
}

/** When the next ping is due by, grace included. Counted from creation until the first ping. */
export function heartbeatDeadline(m: HeartbeatFields): Date {
  const from = m.lastPingAt ?? m.createdAt;
  return new Date(from.getTime() + m.intervalMinutes * 60 * 1000 + graceMs(m));
}

/**
 * What a heartbeat monitor reports. A job that said it failed is DOWN at once; a ping that
 * is overdue is DOWN; one that has never pinged and is not yet overdue is UNKNOWN (waiting).
 */
export function heartbeatStatus(
  m: HeartbeatFields,
  now: Date,
): { status: "UP" | "DOWN" | "UNKNOWN"; error: string | null } {
  if (m.lastPingAt && m.lastPingOk === false) {
    return { status: "DOWN", error: "The job reported a failure" };
  }
  const deadline = heartbeatDeadline(m);
  if (now.getTime() > deadline.getTime()) {
    return {
      status: "DOWN",
      error: m.lastPingAt ? "No ping since it was due" : "Never pinged",
    };
  }
  if (!m.lastPingAt) return { status: "UNKNOWN", error: "Waiting for the first ping" };
  return { status: "UP", error: null };
}

/**
 * Is a heartbeat monitor due a check? Its own interval, as for any monitor — and also right
 * after the deadline passes, so a missed ping is noticed within a minute rather than up to a
 * whole period later.
 */
export function heartbeatCheckDue(m: HeartbeatFields & { lastCheckedAt: Date | null }, now: Date): boolean {
  if (!m.lastCheckedAt) return true;
  if (now.getTime() - m.lastCheckedAt.getTime() >= m.intervalMinutes * 60 * 1000) return true;
  const deadline = heartbeatDeadline(m).getTime();
  return now.getTime() > deadline && m.lastCheckedAt.getTime() <= deadline;
}
