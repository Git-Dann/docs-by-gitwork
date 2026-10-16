/**
 * The client wiki's Platforms section and the renewals it puts on the overview — pure
 * rules, no I/O.
 */

import { isSafeLinkUrl, normalisePlatformLinks, type PlatformLink } from "@/lib/platform-links";

export interface WikiPlatform {
  id: string;
  name: string;
  platformType: string | null;
  url: string | null;
  stagingUrl: string | null;
  repoUrl: string | null;
  links: PlatformLink[];
  /** ISO date (UTC midnight), or null. */
  renewsOn: string | null;
  renewalNote: string | null;
}

export interface WikiPlatformsSection {
  enabled: boolean;
  platforms: WikiPlatform[];
}

export const EMPTY_PLATFORMS: WikiPlatformsSection = { enabled: false, platforms: [] };

/**
 * A URL safe to render as an `<a href>` on a page the client opens, or null.
 *
 * Platform URLs are typed into Portal, often as a bare domain ("app.example.com"), so a
 * scheme-less host gets `https://`. Anything with another scheme (`javascript:`, `data:`)
 * is dropped — `rel="noopener"` does nothing about a script href.
 */
export function safePlatformUrl(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (isSafeLinkUrl(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null; // some other scheme
  const withScheme = `https://${v.replace(/^\/+/, "")}`;
  return /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/.*)?$/i.test(withScheme) && isSafeLinkUrl(withScheme)
    ? withScheme
    : null;
}

/** A platform row as the loader reads it — no logins, no notes. */
export function toWikiPlatform(p: {
  id: string;
  name: string;
  platformType: string | null;
  url: string | null;
  stagingUrl: string | null;
  repoUrl: string | null;
  links: unknown;
  renewsOn: Date | null;
  renewalNote: string | null;
}): WikiPlatform {
  return {
    id: p.id,
    name: p.name,
    platformType: p.platformType?.trim() || null,
    url: safePlatformUrl(p.url),
    stagingUrl: safePlatformUrl(p.stagingUrl),
    repoUrl: safePlatformUrl(p.repoUrl),
    links: normalisePlatformLinks(p.links),
    renewsOn: p.renewsOn ? p.renewsOn.toISOString() : null,
    renewalNote: p.renewalNote?.trim() || null,
  };
}

/**
 * `YYYY-MM-DD` → UTC midnight, "" / undefined → null. An impossible date (2026-02-31) is
 * stored as null rather than rolled into March, which `new Date` would silently do.
 */
export function parseRenewalDate(raw: string | undefined): Date | null {
  const v = raw?.trim();
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === v ? d : null;
}

const DAY_MS = 86_400_000;

/** Whole days from today (UTC) to the renewal date. Negative = already passed. */
export function daysUntil(iso: string, now: Date): number {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d = new Date(iso);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((day - today) / DAY_MS);
}

export interface UpcomingRenewal {
  platformId: string;
  platformName: string;
  what: string;
  renewsOn: string;
  days: number;
}

/** How far ahead the overview looks. Further out than this is not "coming up". */
export const RENEWAL_HORIZON_DAYS = 90;
/** How long a passed date stays on the overview before it is assumed handled. */
export const RENEWAL_OVERDUE_DAYS = 30;

/**
 * The renewals worth showing on the overview: passed in the last month (most urgent — a
 * lapsed domain takes the app offline) or due within the horizon, soonest first.
 *
 * ⚠️ A date further back than RENEWAL_OVERDUE_DAYS is dropped rather than shown as
 * overdue forever: nobody updates the date after renewing, and a permanent red line
 * would teach everyone to ignore the strip.
 */
export function upcomingRenewals(
  platforms: Pick<WikiPlatform, "id" | "name" | "renewsOn" | "renewalNote">[],
  now: Date,
  limit = 3,
): UpcomingRenewal[] {
  return platforms
    .filter((p): p is typeof p & { renewsOn: string } => Boolean(p.renewsOn))
    .map((p) => ({
      platformId: p.id,
      platformName: p.name,
      what: p.renewalNote ?? p.name,
      renewsOn: p.renewsOn,
      days: daysUntil(p.renewsOn, now),
    }))
    .filter((r) => Number.isFinite(r.days) && r.days >= -RENEWAL_OVERDUE_DAYS && r.days <= RENEWAL_HORIZON_DAYS)
    .sort((a, b) => a.days - b.days)
    .slice(0, limit);
}

/** "today" / "tomorrow" / "in 23 days" / "3 days ago". */
export function renewalPhrase(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Amber inside a fortnight, red once passed — the only two states that ask for action. */
export function renewalTone(days: number): "overdue" | "soon" | "later" {
  if (days < 0) return "overdue";
  return days <= 14 ? "soon" : "later";
}
