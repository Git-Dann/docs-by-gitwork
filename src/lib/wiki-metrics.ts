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
 * - **so far** — a monthly adapter can opt in (`monthToDate`) to also show the month still
 *   running, as its own block labelled "so far". It is never the headline, never compared
 *   with a whole month and never drawn on a sparkline, for the reason above: half a month
 *   beside a whole one reads as a fall that did not happen.
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
  /** A sum of money — always shown to two decimals (47.70, never 47.7). */
  money?: boolean;
  /**
   * Shown in ONE card with the other metrics that name the same `id` — "Monthly" and
   * "Yearly" side by side under "Subscriptions". Each stays its own metric underneath, so
   * it still trends, hides and charts on its own.
   */
  card?: MetricCard | null;
}

export interface MetricCard {
  id: string;
  /** The card's label, e.g. "Subscriptions". */
  title: string;
  /** This metric's caption inside it, e.g. "Monthly". */
  part: string;
  /**
   * A ranked list ("Most played courses") rather than a figure with a breakdown: every part is
   * a row, none is the headline, and it is hidden as one (`listHideKey`) and never featured.
   */
  list?: boolean;
}

/** The one key that hides a whole list — its items are hidden together, never one by one. */
export function listHideKey(cardId: string): string {
  return `list:${cardId}`;
}

/** Hidden by its own key, or — for a list item — by its list's key. */
export function isHiddenMetric(m: { key: string; card?: unknown }, hidden: Set<string>): boolean {
  if (hidden.has(m.key)) return true;
  const card = readMetricCard(m.card);
  return Boolean(card?.list && hidden.has(listHideKey(card.id)));
}

/** A stored `card`, or null when it is missing or malformed. */
export function readMetricCard(raw: unknown): MetricCard | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  return typeof c.id === "string" && c.id && typeof c.title === "string" && typeof c.part === "string"
    ? { id: c.id, title: c.title, part: c.part, ...(c.list === true ? { list: true } : {}) }
    : null;
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
  money?: boolean;
  card?: MetricCard | null;
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

/**
 * A month's figures as it closed, for metrics the source can only report AS OF NOW.
 *
 * Big Wedge's subscription counts, MRR and revenue total are today's state whatever range is
 * asked (see `revenueIsRangeScoped`), so the read that finalises a month cannot give them. The
 * last capture taken DURING that month can: the running month is refreshed every 15 minutes, so
 * that is within 15 minutes of month end. Those `keys` are carried from it into the final figures
 * when the final read lacks them. Nothing is carried from a capture taken outside the month.
 */
export function carryMonthEndFigures(
  fresh: MetricValue[],
  partial: StoredSnapshot | undefined,
  keys: string[] | undefined,
): MetricValue[] {
  if (!keys?.length || !partial) return fresh;
  const t = Date.parse(partial.capturedAt);
  const start = periodEnd(addMonths(partial.period, -1)).getTime();
  if (!Number.isFinite(t) || t < start || isFinal(partial)) return fresh;
  const have = new Set(fresh.map((m) => m.key));
  const carried = partial.metrics.filter((m) => keys.includes(m?.key) && !have.has(m.key));
  return carried.length ? [...fresh, ...carried] : fresh;
}

/**
 * A stored month that can stand as that month's figures: final AND carrying at least one
 * number. Older adapters stored an EMPTY month when a read failed; treating that as final
 * would show "nothing happened" for it and never fetch it again (CLAUDE.md §35).
 */
export function isSettled(s: StoredSnapshot): boolean {
  return isFinal(s) && Array.isArray(s.metrics) && s.metrics.length > 0;
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

/** One figure of the month still running. Deliberately no `previous` and no `history`. */
export interface MonthToDateMetric {
  key: string;
  label: string;
  value: number;
  unit: string | null;
  group: string | null;
  money?: boolean;
  card?: MetricCard | null;
  hidden: boolean;
}

export interface MonthToDateView {
  /** "YYYY-MM" — the current month. */
  period: string;
  /** ISO — when it was read. The figures are as of this moment. */
  capturedAt: string;
  metrics: MonthToDateMetric[];
}

/**
 * The running month's capture, when there is one worth showing: this month, not final, and
 * carrying numbers. Anything older than this month is a partial capture of a month that has
 * since ended — that is a figure to be REPLACED, not shown as "so far".
 */
export function selectMonthToDate(
  snapshots: StoredSnapshot[],
  now: Date,
  hiddenKeys: string[] = [],
): MonthToDateView | null {
  const period = periodOf(now);
  const snap = snapshots.find(
    (s) => s.period === period && !isFinal(s) && Array.isArray(s.metrics) && s.metrics.length > 0,
  );
  if (!snap) return null;
  const hidden = new Set(hiddenKeys);
  const seen = new Set<string>();
  const metrics: MonthToDateMetric[] = [];
  for (const m of snap.metrics) {
    if (!m || typeof m.key !== "string" || !Number.isFinite(m.value) || seen.has(m.key)) continue;
    seen.add(m.key);
    metrics.push({
      key: m.key,
      label: m.label || m.key,
      value: m.value,
      unit: m.unit ?? null,
      group: m.group ?? null,
      money: m.money === true,
      card: readMetricCard(m.card),
      hidden: isHiddenMetric(m, hidden),
    });
  }
  return metrics.length ? { period, capturedAt: snap.capturedAt, metrics } : null;
}

/**
 * How old the running month's figures may get: 15 minutes (it was six hours, then an hour): the month still running is
 * the one people compare with the client's own live admin, and six hours behind read as wrong
 * (Big Wedge, 30 Oct 2026: 131 subscriptions in Foundry, 134 in their admin). It is refreshed
 * in the background (`refreshRunningMonths`), so a client reading it never waits on a fetch.
 */
export const MONTH_TO_DATE_STALE_MS = 15 * 60 * 1000;

/** True when the running month has no capture, or one older than MONTH_TO_DATE_STALE_MS. */
export function monthToDateStale(snapshots: StoredSnapshot[], now: Date): boolean {
  const period = periodOf(now);
  const snap = snapshots.find((s) => s.period === period);
  const t = snap ? Date.parse(snap.capturedAt) : NaN;
  return !Number.isFinite(t) || now.getTime() - t > MONTH_TO_DATE_STALE_MS;
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
  /** The month still running — only for a monthly adapter that opted in. */
  monthToDate: MonthToDateView | null;
}

const EMPTY_VIEW = (needsRefresh: boolean): MetricsView => ({
  period: null,
  previousPeriod: null,
  capturedAt: null,
  metrics: [],
  historyPeriods: [],
  needsRefresh,
  monthToDate: null,
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
  /** Also show the month still running (monthly mode only). */
  monthToDate?: boolean;
}): MetricsView {
  const { mode, now } = input;
  const withMtd = mode === "monthly" && input.monthToDate === true;
  const monthToDate = withMtd ? selectMonthToDate(input.snapshots, now, input.hiddenKeys) : null;
  const mtdStale = withMtd && monthToDateStale(input.snapshots, now);
  const usable =
    mode === "monthly"
      ? input.snapshots.filter(isSettled)
      : rekeyByCapture(input.snapshots.filter((s) => Array.isArray(s.metrics) && s.metrics.length > 0));
  const byPeriod = new Map(usable.map((s) => [s.period, s]));
  const sorted = [...usable].sort((a, b) => (a.period < b.period ? 1 : -1));

  let headline: StoredSnapshot | undefined;
  let needsRefresh: boolean;
  if (mode === "monthly") {
    const lastComplete = addMonths(periodOf(now), -1);
    headline = sorted.find((s) => s.period <= lastComplete);
    // Also refresh when a month in the window is stored but not usable — partial or empty.
    // A month that was never stored does not count: it may predate the client's data, and
    // asking for it on every open would be calls that can only fail.
    const window = new Set(Array.from({ length: HISTORY_MONTHS }, (_, i) => addMonths(lastComplete, -i)));
    const unsettled = input.snapshots.some((s) => window.has(s.period) && !isSettled(s));
    needsRefresh = headline?.period !== lastComplete || unsettled;
  } else {
    headline = sorted[0];
    const t = headline ? Date.parse(headline.capturedAt) : NaN;
    needsRefresh = !headline || !Number.isFinite(t) || now.getTime() - t > CURRENT_STALE_MS;
  }
  if (!headline) return { ...EMPTY_VIEW(true), monthToDate };

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

  // A list item is never featured: it is one row of a ranking, not a figure on its own.
  const visibleKeys = rows
    .filter((m) => !isHiddenMetric(m, hidden) && !readMetricCard(m.card)?.list)
    .map((m) => m.key);
  const chosen = (input.featuredKeys ?? []).filter((k) => visibleKeys.includes(k));
  // Nothing chosen (or every choice now hidden/gone) → the first visible metrics lead.
  const featured = new Set((chosen.length > 0 ? chosen : visibleKeys).slice(0, FEATURED_MAX));

  const metrics: WikiMetric[] = rows.map((m) => ({
    key: m.key,
    label: m.label || m.key,
    value: m.value,
    unit: m.unit ?? null,
    group: m.group ?? null,
    money: m.money === true,
    card: readMetricCard(m.card),
    previous: prevByKey.has(m.key) ? prevByKey.get(m.key)! : null,
    hidden: isHiddenMetric(m, hidden),
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
    needsRefresh: needsRefresh || mtdStale,
    monthToDate,
  };
}

/**
 * Which months a monthly source should (re)fetch: each of the last HISTORY_MONTHS complete
 * months that has no FINAL snapshot. A partial one is fetched again — that is how the
 * figure taken mid-month by the report builder gets replaced by the real one.
 */
export function periodsToFetch(
  snapshots: StoredSnapshot[],
  now: Date,
  /** `force`: fetch the running month even when it is fresh — the "Refresh now" button. */
  opts: { monthToDate?: boolean; force?: boolean } = {},
): string[] {
  const finalPeriods = new Set(snapshots.filter(isSettled).map((s) => s.period));
  const lastComplete = addMonths(periodOf(now), -1);
  const months = Array.from({ length: HISTORY_MONTHS }, (_, i) => addMonths(lastComplete, -i)).filter(
    (p) => !finalPeriods.has(p),
  );
  // The running month first: it is the one someone opened the page to see.
  return opts.monthToDate && (opts.force || monthToDateStale(snapshots, now)) ? [periodOf(now), ...months] : months;
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
export function formatMetric(value: number, unit: string | null, money = false): string {
  const n = money
    ? // Money keeps its pence: 47.70, not 47.7.
      value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : Number.isInteger(value)
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

/** One tile on the page: a single metric, or several that share a card. */
export type MetricTileGroup<T> =
  | { kind: "single"; metric: T }
  | { kind: "card"; id: string; title: string; parts: T[] };

/**
 * Metrics laid out as tiles, in the order they come. Metrics naming the same card become one
 * tile where the first of them stood. A card with only one visible part is just that metric —
 * a "Subscriptions" card holding a lone "Monthly" would hide what the number is.
 */
export function tilesFor<T extends { card?: MetricCard | null }>(metrics: T[]): MetricTileGroup<T>[] {
  const out: MetricTileGroup<T>[] = [];
  const cards = new Map<string, { kind: "card"; id: string; title: string; parts: T[] }>();
  for (const m of metrics) {
    const c = m.card;
    if (!c) {
      out.push({ kind: "single", metric: m });
      continue;
    }
    const held = cards.get(c.id);
    if (held) {
      held.parts.push(m);
      continue;
    }
    const tile = { kind: "card" as const, id: c.id, title: c.title, parts: [m] };
    cards.set(c.id, tile);
    out.push(tile);
  }
  // A one-part card is just a figure — unless it is a list, which is a list however short.
  return out.map((t) =>
    t.kind === "card" && t.parts.length === 1 && !(t.parts[0].card as MetricCard | null | undefined)?.list
      ? { kind: "single", metric: t.parts[0] }
      : t,
  );
}

// ─── Viewing a chosen period (the page's time-frame control) ─────────────────────────────
//
// Everything below works on figures the page ALREADY has: each whole-month metric carries
// its last HISTORY_MONTHS values, and the running month rides alongside. So choosing
// "August" needs no fetch and cannot disagree with the trend line drawn from the same data.

/** The month still running, as a period option's value. */
export const SO_FAR = "so-far";

export interface PeriodOption {
  /** "YYYY-MM", or SO_FAR. */
  value: string;
  /** "October so far" / "September 2026". */
  label: string;
  /** Short form for the segmented control: "Oct so far" / "Sep". */
  short: string;
}

/** One metric as it stood in the chosen period. */
export interface PeriodMetric {
  key: string;
  label: string;
  value: number;
  unit: string | null;
  group: string | null;
  money?: boolean;
  card?: MetricCard | null;
  /** The month before; null when there is none; undefined for the running month (never compared). */
  previous: number | null | undefined;
  /** Values up to and including the period, oldest first, with their periods. */
  history: { period: string; value: number }[];
}

interface PeriodSource {
  metrics: WikiMetric[];
  historyPeriods: string[];
  monthToDate: MonthToDateView | null;
}

/** Newest first: the running month, then each whole month that has a visible figure. */
export function metricPeriodOptions(src: PeriodSource): PeriodOption[] {
  const out: PeriodOption[] = [];
  const mtd = src.monthToDate;
  if (mtd && mtd.metrics.some((m) => !m.hidden)) {
    const month = periodLabel(mtd.period).split(" ")[0];
    out.push({ value: SO_FAR, label: `${month} so far`, short: `${month.slice(0, 3)} so far` });
  }
  const visible = src.metrics.filter((m) => !m.hidden);
  for (let i = src.historyPeriods.length - 1; i >= 0; i--) {
    const p = src.historyPeriods[i];
    if (!visible.some((m) => m.history[i] !== null && m.history[i] !== undefined)) continue;
    out.push({ value: p, label: periodLabel(p), short: periodLabel(p).split(" ")[0].slice(0, 3) });
  }
  return out;
}

/**
 * The visible metrics as they stood in `period` (or the running month for SO_FAR). A metric
 * with no figure that month is left out — never shown as 0.
 */
export function metricsAt(src: PeriodSource, period: string): PeriodMetric[] {
  if (period === SO_FAR) {
    return (src.monthToDate?.metrics ?? [])
      .filter((m) => !m.hidden)
      .map((m) => ({ ...m, previous: undefined, history: [] }));
  }
  const i = src.historyPeriods.indexOf(period);
  if (i < 0) return [];
  const out: PeriodMetric[] = [];
  for (const m of src.metrics) {
    if (m.hidden) continue;
    const value = m.history[i];
    if (value === null || value === undefined) continue;
    const prev = i > 0 ? m.history[i - 1] : null;
    const history: { period: string; value: number }[] = [];
    for (let j = 0; j <= i; j++) {
      const v = m.history[j];
      if (v !== null && v !== undefined) history.push({ period: src.historyPeriods[j], value: v });
    }
    out.push({
      key: m.key,
      label: m.label,
      value,
      unit: m.unit,
      group: m.group,
      money: m.money,
      card: m.card,
      previous: prev ?? null,
      history,
    });
  }
  return out;
}

/** How many headline cards the page leads with. */
export const HEADLINE_COUNT = 4;

/**
 * The tiles that lead the page. Gitwork's ★ picks first, in the order chosen; then one tile
 * from each group in turn (so a page leads with users AND golf AND revenue, not four user
 * counts); then whatever is left, in order. Indices into `tiles`, in display order.
 */
export function headlineTileIndexes<T extends { key: string; group: string | null }>(
  tiles: MetricTileGroup<T>[],
  featuredKeys: string[],
  n = HEADLINE_COUNT,
): number[] {
  const keysOf = (t: MetricTileGroup<T>) => (t.kind === "single" ? [t.metric.key] : t.parts.map((p) => p.key));
  const groupOf = (t: MetricTileGroup<T>) => (t.kind === "single" ? t.metric.group : t.parts[0]?.group) ?? "";
  const picked: number[] = [];
  // A list is never a headline figure — it has no single number to lead with.
  const isList = (i: number) => {
    const t = tiles[i];
    return t?.kind === "card" && Boolean((t.parts[0] as { card?: MetricCard | null })?.card?.list);
  };
  const take = (i: number) => {
    if (picked.length < n && i >= 0 && !picked.includes(i) && !isList(i)) picked.push(i);
  };
  for (const k of featuredKeys) take(tiles.findIndex((t) => keysOf(t).includes(k)));
  // One from each group in turn, each group's tiles in their own order.
  const queues = [...new Set(tiles.map(groupOf))].map((g) =>
    tiles.flatMap((t, i) => (groupOf(t) === g && !picked.includes(i) ? [i] : [])),
  );
  while (picked.length < n && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const i = q.shift();
      if (i !== undefined) take(i);
    }
  }
  tiles.forEach((_, i) => take(i));
  return picked;
}
