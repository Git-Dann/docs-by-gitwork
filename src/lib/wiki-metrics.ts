/**
 * The client wiki's Metrics section — the rules, with no I/O, so both the loader and the
 * tests use the same ones.
 *
 * ## Two sources, two meanings of "this month"
 *
 * - **monthly** — a Care analytics adapter that fetches a given month (Fellas, Big Wedge,
 *   Firebase). A month's figures are only FINAL once that month is over, so the section
 *   leads with the last COMPLETE month, and a snapshot captured while its month was still
 *   running is never shown as that month's figure. Comparing half of October with all of
 *   September would read as a collapse that never happened.
 * - **current** — a plain JSON endpoint (the Care "Generic JSON API" adapter, or an endpoint
 *   picked off the client's API Docs page). It reports values as they are NOW, so the latest
 *   capture is shown "as of" its date, and a trend compares it with the last capture taken
 *   in the month before.
 *
 * ⚠️ A missing figure is null, never 0. "We have no figure" and "the figure is zero" are
 * different facts, and only one of them is something to tell a client.
 */

export type MetricsMode = "monthly" | "current";

/** One number as an adapter returns it (the `AnalyticsMetric` shape). */
export interface MetricValue {
  key: string;
  label: string;
  value: number;
  unit?: string | null;
  group?: string | null;
}

export interface StoredSnapshot {
  /** "YYYY-MM". */
  period: string;
  /** ISO. */
  capturedAt: string;
  metrics: MetricValue[];
}

export interface WikiMetric {
  key: string;
  label: string;
  value: number;
  unit: string | null;
  group: string | null;
  /** The comparison figure, or null when there is none to compare honestly with. */
  previous: number | null;
  /** Hidden by Gitwork — internal view only; stripped from the client's copy. */
  hidden: boolean;
  /** Shown on the dashboard card (at most FEATURED_MAX). */
  featured: boolean;
  /** One value per `historyPeriods` entry, null where that month has no figure. */
  history: (number | null)[];
}

export interface MetricsConfig {
  hiddenKeys: string[];
  featuredKeys: string[];
  /** The API Docs endpoint used when there is no Care connector. */
  apiEndpoint: { serverUrl: string; path: string } | null;
  /** AES-256-GCM envelope. Server-only — never serialised. */
  apiTokenCipher: string | null;
}

export const FEATURED_MAX = 3;
/** How many months a sparkline covers. */
export const HISTORY_MONTHS = 6;
/** A "current" source older than this is refreshed when someone at Gitwork opens it. */
export const CURRENT_STALE_MS = 6 * 60 * 60 * 1000;

/** "YYYY-MM" of the UTC month `at` falls in. */
export function periodOf(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Shift a "YYYY-MM" by whole months. */
export function addMonths(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return periodOf(d);
}

/** UTC midnight on the 1st of the month AFTER `period` — when that month's figures become final. */
export function periodEnd(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1));
}

/**
 * A monthly snapshot is final only when it was captured after its month ended. A capture
 * taken mid-month (the Care report builder can fetch the current month) is a partial
 * figure and must not stand for the whole month.
 */
export function isFinal(s: Pick<StoredSnapshot, "period" | "capturedAt">): boolean {
  const t = Date.parse(s.capturedAt);
  return Number.isFinite(t) && t >= periodEnd(s.period).getTime();
}

/** A generic JSON adapter reports "now"; every other adapter fetches a month. */
export function modeForAdapter(adapterKey: string | null | undefined): MetricsMode {
  return adapterKey === "generic" ? "current" : "monthly";
}

/** Defensive read of `ClientWiki.metricsConfig` — anything malformed reads as defaults. */
export function readMetricsConfig(raw: unknown): MetricsConfig {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  const ep = o.apiEndpoint && typeof o.apiEndpoint === "object" ? (o.apiEndpoint as Record<string, unknown>) : null;
  const apiEndpoint =
    ep && typeof ep.serverUrl === "string" && typeof ep.path === "string" && ep.serverUrl && ep.path
      ? { serverUrl: ep.serverUrl, path: ep.path }
      : null;
  return {
    hiddenKeys: strings(o.hiddenKeys),
    featuredKeys: strings(o.featuredKeys).slice(0, FEATURED_MAX),
    apiEndpoint,
    apiTokenCipher: typeof o.apiTokenCipher === "string" && o.apiTokenCipher ? o.apiTokenCipher : null,
  };
}

/**
 * A "current" source reports values as of the moment they were fetched, so the month a
 * snapshot belongs to is the month it was CAPTURED in — not the label it was stored under.
 * The Care report builder can store today's values under any month it is asked about, and
 * read as that month they would put October's numbers on August. The latest capture in
 * each month stands for that month.
 */
export function rekeyByCapture(snapshots: StoredSnapshot[]): StoredSnapshot[] {
  const latest = new Map<string, StoredSnapshot>();
  for (const s of snapshots) {
    const t = Date.parse(s.capturedAt);
    if (!Number.isFinite(t)) continue;
    const period = periodOf(new Date(t));
    const held = latest.get(period);
    if (!held || Date.parse(held.capturedAt) < t) latest.set(period, { ...s, period });
  }
  return [...latest.values()];
}

export interface MetricsView {
  /** The month the figures belong to ("monthly") or were captured in ("current"). */
  period: string | null;
  previousPeriod: string | null;
  capturedAt: string | null;
  metrics: WikiMetric[];
  historyPeriods: string[];
  /** True when a refresh would show something newer than what is stored. */
  needsRefresh: boolean;
}

const EMPTY_VIEW = (needsRefresh: boolean): MetricsView => ({
  period: null,
  previousPeriod: null,
  capturedAt: null,
  metrics: [],
  historyPeriods: [],
  needsRefresh,
});

/**
 * What the section shows, from the stored snapshots.
 *
 * Pure: `now` is a parameter, so "is October final yet" is testable without a clock.
 */
export function selectMetricsView(input: {
  mode: MetricsMode;
  snapshots: StoredSnapshot[];
  now: Date;
  hiddenKeys?: string[];
  featuredKeys?: string[];
}): MetricsView {
  const { mode, now } = input;
  const usable =
    mode === "monthly" ? input.snapshots.filter(isFinal) : rekeyByCapture(input.snapshots);
  const byPeriod = new Map(usable.map((s) => [s.period, s]));
  const sorted = [...usable].sort((a, b) => (a.period < b.period ? 1 : -1));

  let headline: StoredSnapshot | undefined;
  let needsRefresh: boolean;
  if (mode === "monthly") {
    const lastComplete = addMonths(periodOf(now), -1);
    headline = sorted.find((s) => s.period <= lastComplete);
    needsRefresh = headline?.period !== lastComplete;
  } else {
    headline = sorted[0];
    const t = headline ? Date.parse(headline.capturedAt) : NaN;
    needsRefresh = !headline || !Number.isFinite(t) || now.getTime() - t > CURRENT_STALE_MS;
  }
  if (!headline) return EMPTY_VIEW(true);

  const prevPeriod = addMonths(headline.period, -1);
  const prev = byPeriod.get(prevPeriod) ?? null;
  const prevByKey = new Map((prev?.metrics ?? []).map((m) => [m.key, m.value]));

  const historyPeriods = Array.from({ length: HISTORY_MONTHS }, (_, i) =>
    addMonths(headline!.period, i - (HISTORY_MONTHS - 1)),
  );

  const hidden = new Set(input.hiddenKeys ?? []);
  const seen = new Set<string>();
  const rows = headline.metrics.filter((m) => {
    // A malformed or duplicated key cannot be trended, hidden or featured reliably.
    if (!m || typeof m.key !== "string" || !Number.isFinite(m.value) || seen.has(m.key)) return false;
    seen.add(m.key);
    return true;
  });

  const visibleKeys = rows.filter((m) => !hidden.has(m.key)).map((m) => m.key);
  const chosen = (input.featuredKeys ?? []).filter((k) => visibleKeys.includes(k));
  // Nothing chosen (or every choice now hidden/gone) → the first visible metrics lead.
  const featured = new Set((chosen.length > 0 ? chosen : visibleKeys).slice(0, FEATURED_MAX));

  const metrics: WikiMetric[] = rows.map((m) => ({
    key: m.key,
    label: m.label || m.key,
    value: m.value,
    unit: m.unit ?? null,
    group: m.group ?? null,
    previous: prevByKey.has(m.key) ? prevByKey.get(m.key)! : null,
    hidden: hidden.has(m.key),
    featured: featured.has(m.key),
    history: historyPeriods.map((p) => {
      const v = byPeriod.get(p)?.metrics.find((x) => x?.key === m.key)?.value;
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    }),
  }));

  return {
    period: headline.period,
    previousPeriod: prev ? prevPeriod : null,
    capturedAt: headline.capturedAt,
    metrics,
    historyPeriods,
    needsRefresh,
  };
}

/**
 * Which months a monthly source should (re)fetch: each of the last HISTORY_MONTHS complete
 * months that has no FINAL snapshot. A partial one is fetched again — that is how the
 * figure taken mid-month by the report builder gets replaced by the real one.
 */
export function periodsToFetch(snapshots: StoredSnapshot[], now: Date): string[] {
  const finalPeriods = new Set(snapshots.filter(isFinal).map((s) => s.period));
  const lastComplete = addMonths(periodOf(now), -1);
  return Array.from({ length: HISTORY_MONTHS }, (_, i) => addMonths(lastComplete, -i)).filter(
    (p) => !finalPeriods.has(p),
  );
}

/** A GET endpoint on the client's API Docs page that can be called as-is. */
export interface MetricEndpointOption {
  serverUrl: string;
  serverLabel: string;
  path: string;
  summary: string;
  auth: boolean;
}

/**
 * The endpoints that can feed the Metrics section, read off the API Docs page content.
 *
 * Only GET, only absolute http(s) servers, and only paths with no `{param}` — a path that
 * needs an id cannot be called on a schedule without one, so offering it would be offering
 * an endpoint that will only ever 404.
 */
export function listMetricEndpoints(content: unknown): MetricEndpointOption[] {
  const c = content && typeof content === "object" ? (content as Record<string, unknown>) : {};
  const servers = (Array.isArray(c.servers) ? c.servers : [])
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
    .map((s) => ({ url: String(s.url ?? "").trim().replace(/\/+$/, ""), label: String(s.label ?? "").trim() }))
    .filter((s) => /^https?:\/\/[^/\s]+/i.test(s.url));
  const endpoints = (Array.isArray(c.endpoints) ? c.endpoints : [])
    .map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>) : {}))
    .filter((e) => String(e.method ?? "").toUpperCase() === "GET")
    .map((e) => ({
      path: String(e.path ?? "").trim(),
      summary: String(e.summary ?? "").trim(),
      auth: e.auth === true,
    }))
    .filter((e) => e.path.startsWith("/") && !/[{}]/.test(e.path));

  const out: MetricEndpointOption[] = [];
  for (const s of servers) {
    for (const e of endpoints) {
      out.push({ serverUrl: s.url, serverLabel: s.label || s.url, path: e.path, summary: e.summary, auth: e.auth });
    }
  }
  return out;
}

/** `serverUrl` + `path`, joined without doubling or dropping the slash. */
export function endpointUrl(ep: { serverUrl: string; path: string }): string {
  return `${ep.serverUrl.replace(/\/+$/, "")}/${ep.path.replace(/^\/+/, "")}`;
}

/** Fractional change, or null when there is nothing honest to compare with. */
export function metricTrend(value: number, previous: number | null) {
  if (previous === null || previous === 0) return null;
  const deltaPct = (value - previous) / Math.abs(previous);
  return {
    deltaPct,
    direction: (deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat") as "up" | "down" | "flat",
  };
}

/** "1,240" / "£3,410" / "62%" — the unit sits where the adapter says. */
export function formatMetric(value: number, unit: string | null): string {
  const n = Number.isInteger(value)
    ? value.toLocaleString("en-GB")
    : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  if (!unit) return n;
  return /^[£$€]$/.test(unit) ? `${unit}${n}` : `${n}${unit === "%" ? "" : " "}${unit}`;
}

/** "September 2026". */
export function periodLabel(period: string): string {
  return new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
