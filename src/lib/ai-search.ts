/**
 * AI search: how Gitwork shows up when buyers search, on Google and through AI assistants.
 * Pure rules shared by the server, the page and the demo, so they cannot disagree.
 *
 * Two sources today, both read live and never stored:
 *  - Google Search Console: the average position of every query we appeared for.
 *  - GA4: sessions whose source is an AI assistant (chatgpt.com, perplexity.ai, …).
 *
 * ⚠️ A source that could not be read is reported as unreadable, never as zero. "We could
 * not look" and "nobody came" are different facts (CLAUDE.md §35).
 */

export const AI_SEARCH_RANGES = [7, 28, 90] as const;
export type AiSearchRange = (typeof AI_SEARCH_RANGES)[number];
export const DEFAULT_AI_SEARCH_RANGE: AiSearchRange = 28;

/**
 * Search Console tells us the first day it is still processing (`firstIncompleteDate`), and
 * both periods end the day before it, so a complete week is never compared against a
 * half-collected one. This fallback is only used when Google returns no recent days at all.
 */
export const SEARCH_CONSOLE_FALLBACK_LAG_DAYS = 3;
/**
 * GA4 gives no completeness signal, and Google documents up to 48 hours of processing. Ending
 * two days back means every day in the period is finished.
 */
export const GA4_LAG_DAYS = 2;

/** A synced report is re-read from Google once it is this old, on the next look at the page. */
export const SYNC_EVERY_MINUTES = 30;
/** Figures last read longer ago than this are flagged as out of date, whatever the reason. */
export const STALE_AFTER_HOURS = 24;

export function parseAiSearchRange(value: string | null | undefined): AiSearchRange {
  const n = Number(value);
  return (AI_SEARCH_RANGES as readonly number[]).includes(n) ? (n as AiSearchRange) : DEFAULT_AI_SEARCH_RANGE;
}

export interface Period {
  /** YYYY-MM-DD, inclusive. */
  start: string;
  /** YYYY-MM-DD, inclusive. */
  end: string;
}

export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** The current period (`range` days, ending `lagDays` before today) and the one before it. */
export function periodsFor(range: AiSearchRange, today: Date, lagDays: number): { current: Period; previous: Period } {
  return periodsEnding(range, isoDay(addDays(today, -lagDays)));
}

/** The current period (`range` days, ending on `endDay`, inclusive) and the one before it. */
export function periodsEnding(range: AiSearchRange, endDay: string): { current: Period; previous: Period } {
  const end = new Date(`${endDay}T00:00:00Z`);
  const start = addDays(end, -(range - 1));
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(range - 1));
  return {
    current: { start: isoDay(start), end: isoDay(end) },
    previous: { start: isoDay(prevStart), end: isoDay(prevEnd) },
  };
}

/** Every day in a period, in order. */
export function daysIn(period: Period): string[] {
  const out: string[] = [];
  const end = new Date(`${period.end}T00:00:00Z`);
  for (let d = new Date(`${period.start}T00:00:00Z`); d <= end; d = addDays(d, 1)) out.push(isoDay(d));
  return out;
}

// ─── AI assistants ────────────────────────────────────────────────────────────

export interface AiAssistant {
  id: string;
  label: string;
  /** Referrer hosts. A subdomain of one of these counts too. */
  hosts: readonly string[];
}

/**
 * The assistants whose visits we count, by the source GA4 records. ChatGPT also tags its
 * links `utm_source=chatgpt.com`, which GA4 records as the same source.
 *
 * ⚠️ Deliberately NOT `openai.com` or `google.com`: those are the companies, and most of
 * their traffic (docs, search) isn't an AI answer.
 */
export const AI_ASSISTANTS: readonly AiAssistant[] = [
  { id: "chatgpt", label: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"] },
  { id: "perplexity", label: "Perplexity", hosts: ["perplexity.ai"] },
  { id: "claude", label: "Claude", hosts: ["claude.ai"] },
  { id: "gemini", label: "Gemini", hosts: ["gemini.google.com", "bard.google.com"] },
  { id: "copilot", label: "Copilot", hosts: ["copilot.microsoft.com", "copilot.cloud.microsoft", "edgeservices.bing.com"] },
  { id: "deepseek", label: "DeepSeek", hosts: ["chat.deepseek.com"] },
  { id: "grok", label: "Grok", hosts: ["grok.com"] },
  { id: "meta", label: "Meta AI", hosts: ["meta.ai"] },
  { id: "mistral", label: "Le Chat", hosts: ["chat.mistral.ai"] },
  { id: "you", label: "You.com", hosts: ["you.com"] },
  { id: "phind", label: "Phind", hosts: ["phind.com"] },
  { id: "poe", label: "Poe", hosts: ["poe.com"] },
];

function hostOf(source: string): string {
  return source
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#:]/)[0]
    .replace(/^www\./, "");
}

/** The assistant a GA4 session source belongs to, or null. Matches the host, never a substring. */
export function classifyAiSource(source: string | null | undefined): AiAssistant | null {
  if (!source) return null;
  const host = hostOf(source);
  if (!host) return null;
  return AI_ASSISTANTS.find((a) => a.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}

/**
 * The GA4 filter. It narrows the report; `classifyAiSource` still decides, so a source the
 * regex happens to catch (`notchatgpt.com`) is dropped rather than counted.
 */
export const AI_SOURCE_REGEX = AI_ASSISTANTS.flatMap((a) => a.hosts)
  .map((h) => h.replace(/\./g, "\\."))
  .join("|");

// ─── Shapes ───────────────────────────────────────────────────────────────────

export interface QueryRow {
  query: string;
  clicks: number;
  impressions: number;
  /** Google's average position over the period. 1 is the top result. */
  position: number;
}

export interface QuerySummary {
  /** Queries we appeared for at all. */
  queries: number;
  top10: number;
  top3: number;
  clicks: number;
  impressions: number;
}

/**
 * Counted on average position, which is what Search Console reports per query. A query
 * that sat at 2 one day and 30 the next averages 16 and counts as neither.
 */
export function summariseQueries(rows: readonly QueryRow[]): QuerySummary {
  let top10 = 0;
  let top3 = 0;
  let clicks = 0;
  let impressions = 0;
  for (const r of rows) {
    if (r.position <= 10) top10 += 1;
    if (r.position <= 3) top3 += 1;
    clicks += r.clicks;
    impressions += r.impressions;
  }
  return { queries: rows.length, top10, top3, clicks, impressions };
}

export interface QueryComparison extends QueryRow {
  /** Null when the query didn't appear in the previous period. */
  previousPosition: number | null;
}

/** The current queries, by impressions, each with where it sat in the previous period. */
export function compareQueries(current: readonly QueryRow[], previous: readonly QueryRow[], limit = 500): QueryComparison[] {
  const before = new Map(previous.map((r) => [r.query, r.position]));
  return [...current]
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position || a.query.localeCompare(b.query))
    .slice(0, limit)
    .map((r) => ({ ...r, previousPosition: before.get(r.query) ?? null }));
}

export type QueryBand = "all" | "top10" | "top3";
export type QuerySortKey = "query" | "position" | "clicks" | "impressions";

/** The Google queries table: position band, search, then one sort column. */
export function filterQueries(
  rows: readonly QueryComparison[],
  opts: { band: QueryBand; search: string; sort: { key: QuerySortKey; dir: "asc" | "desc" } },
): QueryComparison[] {
  const q = opts.search.trim().toLowerCase();
  const out = rows.filter(
    (r) =>
      (opts.band === "all" || r.position <= (opts.band === "top3" ? 3 : 10)) &&
      (!q || r.query.toLowerCase().includes(q)),
  );
  const sign = opts.sort.dir === "asc" ? 1 : -1;
  const k = opts.sort.key;
  return out.sort((a, b) => {
    const diff = k === "query" ? a.query.localeCompare(b.query) : a[k] - b[k];
    return sign * diff || b.impressions - a.impressions || a.query.localeCompare(b.query);
  });
}

export interface AiVisitRow {
  /** YYYY-MM-DD, or GA4's YYYYMMDD. Absent for a total-only report. */
  date?: string;
  source: string;
  sessions: number;
}

export interface AiVisitsSummary {
  total: number;
  byAssistant: Array<{ id: string; label: string; sessions: number }>;
  /** One entry per day of the period, zero-filled. */
  series: Array<{ date: string; sessions: number }>;
}

function normaliseDate(d: string): string {
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
}

export function summariseAiVisits(rows: readonly AiVisitRow[], period: Period): AiVisitsSummary {
  const byId = new Map<string, number>();
  const byDay = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const assistant = classifyAiSource(r.source);
    if (!assistant || !(r.sessions > 0)) continue;
    total += r.sessions;
    byId.set(assistant.id, (byId.get(assistant.id) ?? 0) + r.sessions);
    if (r.date) {
      const day = normaliseDate(r.date);
      byDay.set(day, (byDay.get(day) ?? 0) + r.sessions);
    }
  }
  const byAssistant = AI_ASSISTANTS.filter((a) => byId.has(a.id))
    .map((a) => ({ id: a.id, label: a.label, sessions: byId.get(a.id) ?? 0 }))
    .sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label));
  const series = daysIn(period).map((date) => ({ date, sessions: byDay.get(date) ?? 0 }));
  return { total, byAssistant, series };
}

/** Change vs the previous period, in TrendBadge's shape. No percentage from a zero base. */
export function changeBetween(current: number, previous: number): { deltaPct: number | null; direction: "up" | "down" | "flat" } {
  if (current === previous) return { deltaPct: 0, direction: "flat" };
  const direction = current > previous ? "up" : "down";
  return { deltaPct: previous > 0 ? (current - previous) / previous : null, direction };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export interface AiSearchConfig {
  /** `sc-domain:gitwork.co.uk` or a URL-prefix property such as `https://gitwork.co.uk/`. */
  searchConsoleSite: string | null;
  /** GA4 property id, digits only. */
  ga4PropertyId: string | null;
}

export const EMPTY_AI_SEARCH_CONFIG: AiSearchConfig = { searchConsoleSite: null, ga4PropertyId: null };

/** A Search Console property as typed, tidied. Null when it isn't one. */
export function normaliseSearchConsoleSite(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const domain = v.match(/^sc-domain:([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (domain) return `sc-domain:${domain[1].toLowerCase()}`;
  try {
    const url = new URL(v);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.search || url.hash || url.username || url.password) return null;
    const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    return `${url.protocol}//${url.host.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

/** A GA4 property id as typed (`123456789` or `properties/123456789`). Null when it isn't one. */
export function normaliseGa4PropertyId(input: string): string | null {
  const v = input.trim().replace(/^properties\//i, "");
  return /^\d{6,14}$/.test(v) ? v : null;
}

/** A stored config read defensively: anything malformed reads as not set. */
export function parseAiSearchConfig(raw: unknown): AiSearchConfig {
  if (!raw || typeof raw !== "object") return EMPTY_AI_SEARCH_CONFIG;
  const r = raw as Record<string, unknown>;
  return {
    searchConsoleSite: typeof r.searchConsoleSite === "string" ? normaliseSearchConsoleSite(r.searchConsoleSite) : null,
    ga4PropertyId: typeof r.ga4PropertyId === "string" ? normaliseGa4PropertyId(r.ga4PropertyId) : null,
  };
}

// ─── The report ───────────────────────────────────────────────────────────────

export type SourceFailure = "not_configured" | "no_credentials" | "no_access" | "error";

/** One successful read of a source: the figures, when we read them, and how far they go. */
export interface SourceSync<T> {
  data: T;
  /** When Foundry read this from Google. */
  syncedAt: string;
  /** The last day the figures cover (YYYY-MM-DD). */
  dataThrough: string;
  /** What Google withheld or capped, in plain words. Empty when nothing was. */
  caveats: string[];
}

/**
 * A source is either read now, or not — and when it isn't, the last good read is kept
 * alongside the reason, so the page can show the last known figures clearly labelled as
 * such instead of either a zero or nothing.
 */
export type SourceState<T> =
  | ({ status: "ok" } & SourceSync<T>)
  | { status: SourceFailure; message: string; attemptedAt: string; lastGood: SourceSync<T> | null };

export function lastKnown<T>(state: SourceState<T>): SourceSync<T> | null {
  return state.status === "ok" ? state : state.lastGood;
}

export type Freshness =
  /** Read on the last sync, within STALE_AFTER_HOURS. */
  | { kind: "fresh"; syncedAt: string; dataThrough: string }
  /** Read on the last sync, but that was too long ago. */
  | { kind: "stale"; syncedAt: string; dataThrough: string }
  /** The last sync failed; these are the figures from the one before. */
  | { kind: "failing"; message: string; attemptedAt: string; syncedAt: string; dataThrough: string }
  /** Never read. */
  | { kind: "none"; message: string };

export function freshnessOf<T>(state: SourceState<T>, now: Date): Freshness {
  const old = (iso: string) => now.getTime() - Date.parse(iso) > STALE_AFTER_HOURS * 3600 * 1000;
  if (state.status === "ok") {
    return { kind: old(state.syncedAt) ? "stale" : "fresh", syncedAt: state.syncedAt, dataThrough: state.dataThrough };
  }
  if (state.lastGood) {
    return {
      kind: "failing",
      message: state.message,
      attemptedAt: state.attemptedAt,
      syncedAt: state.lastGood.syncedAt,
      dataThrough: state.lastGood.dataThrough,
    };
  }
  return { kind: "none", message: state.message };
}

/**
 * Keeps the previous good read when this one failed. A failure never discards figures we
 * already had, and a success always replaces them.
 */
export function mergeSync<T>(next: SourceState<T>, previous: SourceState<T> | null | undefined): SourceState<T> {
  if (next.status === "ok" || !previous) return next;
  return { ...next, lastGood: lastKnown(previous) };
}

export interface GoogleReport {
  period: Period;
  previousPeriod: Period;
  current: QuerySummary;
  previous: QuerySummary;
  /** Google's own totals, which include the queries it won't list. */
  totals: { current: { clicks: number; impressions: number }; previous: { clicks: number; impressions: number } };
  /** More rows than we read (100,000), so counts are "at least". */
  truncated: boolean;
  queries: QueryComparison[];
}

export interface AiVisitsReport {
  period: Period;
  previousPeriod: Period;
  current: AiVisitsSummary;
  previousTotal: number;
  byAssistantPrevious: Record<string, number>;
  pages: Array<{ path: string; sessions: number }>;
}

export interface AiSearchReport {
  range: AiSearchRange;
  /** When the last sync ran, whether or not every source answered. */
  attemptedAt: string;
  google: SourceState<GoogleReport>;
  aiVisits: SourceState<AiVisitsReport>;
  setup: AiSearchConfig & { serviceAccountEmail: string | null };
}

/** What Search Console held back, from the gap between its totals and the rows it listed. */
export function googleCaveats(input: {
  listedImpressions: number;
  totalImpressions: number;
  truncated: boolean;
}): string[] {
  const out: string[] = [];
  if (input.totalImpressions > 0) {
    const hidden = Math.max(0, input.totalImpressions - input.listedImpressions) / input.totalImpressions;
    if (hidden >= 0.01) {
      out.push(
        `Google doesn't list rare searches, for privacy. They were ${Math.round(hidden * 100)}% of the times we were shown; the query counts leave them out.`,
      );
    }
  }
  if (input.truncated) out.push("Google listed more than 100,000 searches; only the first 100,000 are counted.");
  return out;
}

/** What GA4 said it withheld or rolled up, from its own report metadata. */
export function ga4Caveats(input: { thresholded: boolean; otherRow: boolean; truncated: boolean }): string[] {
  const out: string[] = [];
  if (input.thresholded) {
    out.push("GA4 hides small numbers to protect privacy (Google Signals is on), so these counts may be slightly low.");
  }
  if (input.otherRow) out.push("GA4 grouped some rows as \"(other)\", so a few visits may be missing from the breakdown.");
  if (input.truncated) out.push("GA4 returned more rows than Foundry read, so the breakdown is incomplete.");
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1–28 Oct", or "29 Sep – 26 Oct" across a month. */
export function formatPeriod(p: Period): string {
  const s = new Date(`${p.start}T00:00:00Z`);
  const e = new Date(`${p.end}T00:00:00Z`);
  const day = (d: Date) => d.getUTCDate();
  // A fixed table: ICU's en-GB short months ("Sept") vary between runtimes.
  const mon = (d: Date) => MONTHS[d.getUTCMonth()];
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) return `${day(s)}–${day(e)} ${mon(e)}`;
  return `${day(s)} ${mon(s)} – ${day(e)} ${mon(e)}`;
}
