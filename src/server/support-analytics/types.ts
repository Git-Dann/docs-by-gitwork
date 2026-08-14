import { fetchScannableUrl } from "@/server/pulse-lite/url-guard";

// ─── Care analytics — shared adapter types ──────────────────────────────────────
//
// Each Care client can connect a product-analytics API (their SaaS backend) so the
// monthly support report auto-fills usage metrics. Every client's API is shaped
// differently, so we normalise each one to a flat list of `AnalyticsMetric`s via a
// per-client `AnalyticsAdapter`. The report builder renders whatever metrics come
// back and shows month-over-month trends — no hard-coded fields.

/** One normalised number on a report (e.g. "Active subscriptions" = 1,240). */
export interface AnalyticsMetric {
  /** Stable id used to match the same metric across months for trends. */
  key: string;
  /** Human label shown on the report. */
  label: string;
  value: number;
  /** Previous-period value, merged in by the runner for trend display. */
  previous?: number;
  /** Optional prefix/suffix unit, e.g. "£" or "%". */
  unit?: string;
  /** Optional section grouping, e.g. "Subscriptions" / "Players". */
  group?: string;
}

/** A single month's snapshot for one connection. */
export interface AnalyticsSnapshot {
  /** e.g. "May 2026". */
  periodLabel: string;
  metrics: AnalyticsMetric[];
}

/** One Firestore metric to count per month (e.g. docs created in `users`). */
export interface FirebaseMetricSpec {
  /** Display label, e.g. "Subscribers". */
  label: string;
  /** Firestore collection (or collection-group) path. */
  collection: string;
  /** Timestamp field used to scope the month, e.g. "createdAt". */
  timestampField: string;
  /** Optional report grouping. */
  group?: string;
  /** Optional unit prefix/suffix, e.g. "£". */
  unit?: string;
  /** Treat `collection` as a collectionGroup query (sub-collections). */
  collectionGroup?: boolean;
  /** Optional equality filters applied before the date range. */
  where?: Array<{ field: string; value: string | number | boolean }>;
}

/** What an adapter needs to fetch a month — resolved from the connection. */
export interface AnalyticsFetchContext {
  baseUrl: string;
  apiToken?: string;
  /** Four-digit year, e.g. 2026. */
  year: number;
  /** 1–12. */
  month: number;
  /** Firebase adapter — service-account JSON + metric specs from the connection. */
  serviceAccountJson?: string;
  firebaseMetrics?: FirebaseMetricSpec[];
}

/** A per-product adapter. Register in `index.ts`. */
export interface AnalyticsAdapter {
  /** Stable key stored on the connection's scraperConfig. */
  key: string;
  /** Label shown in the connector dropdown. */
  label: string;
  /** Pre-filled base URL when this adapter is chosen. */
  defaultBaseUrl: string;
  /** Whether the API needs a bearer token to return data. */
  requiresToken: boolean;
  /** One-line hint shown under the connector form. */
  hint?: string;
  fetchMonth(ctx: AnalyticsFetchContext): Promise<AnalyticsSnapshot>;
}

/** Shape of the analytics connection's scraperConfig. */
export interface AnalyticsConnectionConfig {
  adapter?: string;
  baseUrl?: string;
  apiToken?: string;
  /** Generic adapter only — endpoint path to GET. */
  endpoint?: string;
  /** Firebase adapter — service-account JSON (stored server-side on the connection). */
  serviceAccountJson?: string;
  /** Firebase adapter — collections to count per month. */
  firebaseMetrics?: FirebaseMetricSpec[];
}

/**
 * Authenticated JSON GET with consistent error surfacing.
 *
 * ⚠️ The URL is not ours. It comes from `AccountConnection.scraperConfig.baseUrl`, typed into the
 * Care → Connectors form, so a plain `fetch` here is a server-side request to an address a user
 * chose — reachable from inside the VPS network, cloud metadata at 169.254.169.254 included. It
 * now goes through the same guard Pulse uses on scan targets, which also **pins DNS**, so the
 * check cannot be defeated by re-resolving between validation and connection, and re-runs on
 * every call rather than only when the connector was saved. Same rule as the wiki intake webhook
 * (`CLAUDE.md` §40.1): a host that resolved publicly last month can be repointed today.
 *
 * `sameOriginRedirectsOnly` is not optional here. This request carries the client's analytics
 * bearer token, and every redirect hop reuses the same headers — so without it, a connector URL
 * that 302s to somewhere else hands that host a live customer credential.
 */
export async function getJson<T>(url: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Foundry/1.0",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetchScannableUrl(
    url,
    { headers, cache: "no-store" },
    {},
    { sameOriginRedirectsOnly: true },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${url} → ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
}

/** Zero-padded "YYYY-MM" prefix for matching API rows. */
export function monthPrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}
