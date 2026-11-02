import { google, type analyticsdata_v1beta, type searchconsole_v1 } from "googleapis";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readSecret } from "@/server/stored-secret";
import {
  AI_SOURCE_REGEX,
  GA4_LAG_DAYS,
  SEARCH_CONSOLE_FALLBACK_LAG_DAYS,
  SYNC_EVERY_MINUTES,
  addDays,
  classifyAiSource,
  compareQueries,
  ga4Caveats,
  googleCaveats,
  isoDay,
  mergeSync,
  parseAiSearchConfig,
  periodsEnding,
  periodsFor,
  summariseAiVisits,
  summariseQueries,
  type AiSearchConfig,
  type AiSearchRange,
  type AiSearchReport,
  type AiVisitRow,
  type AiVisitsReport,
  type GoogleReport,
  type Period,
  type QueryRow,
  type SourceFailure,
  type SourceState,
  type SourceSync,
} from "@/lib/ai-search";

/**
 * Pulse → AI search. Reads Google Search Console and GA4 with the workspace's Google service
 * account (Settings → Integrations) and keeps the last sync per range in `AiSearchSync`.
 *
 * Why a service account and not a person's Google sign-in: adding the Search Console and
 * Analytics scopes to sign-in would make every teammate sign in again, to grant access only
 * one report needs. A service account is added once, as a read-only user, on each property.
 *
 * Truth rules, each one because the alternative shows a number that isn't so:
 *  - A period ends on the last day Google has finished processing, never "today minus a
 *    guess", or a partial week is compared with a full one.
 *  - A source that fails keeps its last good read, labelled with when that was. It never
 *    turns into a zero, and a working source isn't held back by a broken one.
 *  - Whatever Google withholds (rare searches, GA4 thresholding, row caps) is stated.
 *  - Changing the properties deletes the stored syncs, so old figures can't pass as new.
 */

const SC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/** Search Console's cap on rows per request, and how many pages of them we read. */
const SC_ROW_LIMIT = 25000;
const SC_MAX_PAGES = 4;

/** One sync per workspace and range at a time; a second caller waits for the first. */
const inFlight = new Map<string, Promise<AiSearchReport>>();

interface ServiceAccount {
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
}

function parseServiceAccount(raw: string | null): ServiceAccount | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    return parsed.client_email && parsed.private_key ? parsed : null;
  } catch {
    return null;
  }
}

async function loadWorkspace(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { aiSearchConfig: true, googleServiceAccountJson: true },
  });
  return {
    config: parseAiSearchConfig(ws?.aiSearchConfig),
    account: parseServiceAccount(readSecret(ws?.googleServiceAccountJson)),
  };
}

export async function getAiSearchConfig(workspaceId: string): Promise<AiSearchConfig> {
  return (await loadWorkspace(workspaceId)).config;
}

export async function setAiSearchConfig(workspaceId: string, config: AiSearchConfig): Promise<AiSearchConfig> {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { aiSearchConfig: config as unknown as Prisma.InputJsonValue },
  });
  // Figures read from the old properties must not be shown as the new ones'.
  await prisma.aiSearchSync.deleteMany({ where: { workspaceId } });
  return config;
}

function authFor(account: ServiceAccount, scope: string) {
  return new google.auth.GoogleAuth({ credentials: account, scopes: [scope] });
}

function statusOf(err: unknown): number | null {
  const e = err as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  for (const v of [e?.response?.status, e?.status, e?.code]) if (typeof v === "number") return v;
  return null;
}

function messageOf(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 240 ? `${msg.slice(0, 237)}…` : msg;
}

/** One read of one source: what it found, or why it couldn't. */
type Read<T> = ({ status: "ok" } & SourceSync<T>) | { status: SourceFailure; message: string };

/** A Google error as a sentence that says what to do. */
function failure(err: unknown, where: "Search Console" | "Google Analytics", email: string): { status: SourceFailure; message: string } {
  const status = statusOf(err);
  if (status === 403 || status === 404 || status === 401) {
    const place = where === "Search Console"
      ? "Search Console → Settings → Users and permissions (Restricted is enough)"
      : "Google Analytics → Admin → Property access management (Viewer is enough)";
    return {
      status: "no_access",
      message: `${where} refused the service account. Add ${email} in ${place}, and check the property is the right one.`,
    };
  }
  return { status: "error", message: `${where} didn't answer: ${messageOf(err)}` };
}

type SearchConsole = searchconsole_v1.Searchconsole;

/**
 * The last day Search Console has finished. `firstIncompleteDate` is Google's own marker;
 * with none, the latest day it returned. Null when it returned no recent days at all.
 */
async function searchConsoleDataThrough(sc: SearchConsole, siteUrl: string, today: Date): Promise<string | null> {
  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: isoDay(addDays(today, -10)),
      endDate: isoDay(today),
      dimensions: ["date"],
      dataState: "all",
      rowLimit: 20,
    },
  });
  const incomplete = res.data.metadata?.firstIncompleteDate;
  if (incomplete) return isoDay(addDays(new Date(`${incomplete}T00:00:00Z`), -1));
  const days = (res.data.rows ?? []).map((r) => String(r.keys?.[0] ?? "")).filter(Boolean).sort();
  return days.at(-1) ?? null;
}

async function queryRows(sc: SearchConsole, siteUrl: string, period: Period): Promise<{ rows: QueryRow[]; truncated: boolean }> {
  const rows: QueryRow[] = [];
  for (let page = 0; page < SC_MAX_PAGES; page += 1) {
    const res = await sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: period.start,
        endDate: period.end,
        dimensions: ["query"],
        dataState: "final",
        rowLimit: SC_ROW_LIMIT,
        startRow: page * SC_ROW_LIMIT,
      },
    });
    const got = res.data.rows ?? [];
    for (const r of got) {
      const query = String(r.keys?.[0] ?? "");
      const position = Number(r.position ?? 0);
      if (query && position > 0) {
        rows.push({ query, clicks: Number(r.clicks ?? 0), impressions: Number(r.impressions ?? 0), position });
      }
    }
    if (got.length < SC_ROW_LIMIT) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/** Google's own totals for the period, which include the searches it won't list one by one. */
async function totals(sc: SearchConsole, siteUrl: string, period: Period) {
  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: { startDate: period.start, endDate: period.end, dataState: "final" },
  });
  const row = res.data.rows?.[0];
  return { clicks: Number(row?.clicks ?? 0), impressions: Number(row?.impressions ?? 0) };
}

async function readGoogle(
  config: AiSearchConfig,
  account: ServiceAccount | null,
  range: AiSearchRange,
  now: Date,
): Promise<Read<GoogleReport>> {
  if (!config.searchConsoleSite) return { status: "not_configured", message: "Add the Search Console property below." };
  if (!account) return { status: "no_credentials", message: "Add a Google service account in Settings → Integrations." };
  const site = config.searchConsoleSite;
  try {
    const sc = google.searchconsole({ version: "v1", auth: authFor(account, SC_SCOPE) });
    const through = await searchConsoleDataThrough(sc, site, now);
    const { current, previous } = through
      ? periodsEnding(range, through)
      : periodsFor(range, now, SEARCH_CONSOLE_FALLBACK_LAG_DAYS);
    const [nowRows, beforeRows, nowTotals, beforeTotals] = await Promise.all([
      queryRows(sc, site, current),
      queryRows(sc, site, previous),
      totals(sc, site, current),
      totals(sc, site, previous),
    ]);
    const summary = summariseQueries(nowRows.rows);
    const truncated = nowRows.truncated || beforeRows.truncated;
    const caveats = googleCaveats({ listedImpressions: summary.impressions, totalImpressions: nowTotals.impressions, truncated });
    if (!through) caveats.push("Search Console returned no days in the last 10, so the period end is estimated.");
    return {
      status: "ok",
      syncedAt: now.toISOString(),
      dataThrough: current.end,
      caveats,
      data: {
        period: current,
        previousPeriod: previous,
        current: summary,
        previous: summariseQueries(beforeRows.rows),
        totals: { current: nowTotals, previous: beforeTotals },
        truncated,
        queries: compareQueries(nowRows.rows, beforeRows.rows),
      },
    };
  } catch (err) {
    return failure(err, "Search Console", account.client_email ?? "the service account");
  }
}

type RunReportBody = analyticsdata_v1beta.Schema$RunReportRequest;
type RunReportResponse = analyticsdata_v1beta.Schema$RunReportResponse;

function aiFilter(): RunReportBody["dimensionFilter"] {
  return {
    filter: {
      fieldName: "sessionSource",
      stringFilter: { matchType: "PARTIAL_REGEXP", value: AI_SOURCE_REGEX, caseSensitive: false },
    },
  };
}

async function readAiVisits(
  config: AiSearchConfig,
  account: ServiceAccount | null,
  range: AiSearchRange,
  now: Date,
): Promise<Read<AiVisitsReport>> {
  if (!config.ga4PropertyId) return { status: "not_configured", message: "Add the GA4 property id below." };
  if (!account) return { status: "no_credentials", message: "Add a Google service account in Settings → Integrations." };
  const { current, previous } = periodsFor(range, now, GA4_LAG_DAYS);
  const property = `properties/${config.ga4PropertyId}`;
  try {
    const ga = google.analyticsdata({ version: "v1beta", auth: authFor(account, GA_SCOPE) });
    const run = async (requestBody: RunReportBody): Promise<RunReportResponse> =>
      (await ga.properties.runReport({ property, requestBody })).data;
    const sessions = [{ name: "sessions" }];
    const limit = "10000";
    const [daily, before, pages] = await Promise.all([
      run({
        dateRanges: [{ startDate: current.start, endDate: current.end }],
        dimensions: [{ name: "date" }, { name: "sessionSource" }],
        metrics: sessions,
        dimensionFilter: aiFilter(),
        limit,
      }),
      run({
        dateRanges: [{ startDate: previous.start, endDate: previous.end }],
        dimensions: [{ name: "sessionSource" }],
        metrics: sessions,
        dimensionFilter: aiFilter(),
        limit,
      }),
      run({
        dateRanges: [{ startDate: current.start, endDate: current.end }],
        dimensions: [{ name: "landingPage" }, { name: "sessionSource" }],
        metrics: sessions,
        dimensionFilter: aiFilter(),
        limit,
      }),
    ]);

    const value = (row: { metricValues?: Array<{ value?: string | null }> | null }) =>
      Number(row.metricValues?.[0]?.value ?? 0);
    const dim = (row: { dimensionValues?: Array<{ value?: string | null }> | null }, i: number) =>
      String(row.dimensionValues?.[i]?.value ?? "");

    const dailyRows: AiVisitRow[] = (daily.rows ?? []).map((r) => ({ date: dim(r, 0), source: dim(r, 1), sessions: value(r) }));
    const beforeRows: AiVisitRow[] = (before.rows ?? []).map((r) => ({ source: dim(r, 0), sessions: value(r) }));
    const previousSummary = summariseAiVisits(beforeRows, previous);

    const byPage = new Map<string, number>();
    for (const r of pages.rows ?? []) {
      if (!classifyAiSource(dim(r, 1))) continue;
      const path = dim(r, 0) || "(not set)";
      byPage.set(path, (byPage.get(path) ?? 0) + value(r));
    }

    const reports = [daily, before, pages];
    const caveats = ga4Caveats({
      thresholded: reports.some((r) => r.metadata?.subjectToThresholding === true),
      otherRow: reports.some((r) => r.metadata?.dataLossFromOtherRow === true),
      truncated: reports.some((r) => (r.rowCount ?? 0) > (r.rows?.length ?? 0)),
    });

    return {
      status: "ok",
      syncedAt: now.toISOString(),
      dataThrough: current.end,
      caveats,
      data: {
        period: current,
        previousPeriod: previous,
        current: summariseAiVisits(dailyRows, current),
        previousTotal: previousSummary.total,
        byAssistantPrevious: Object.fromEntries(previousSummary.byAssistant.map((a) => [a.id, a.sessions])),
        pages: [...byPage.entries()]
          .map(([path, n]) => ({ path, sessions: n }))
          .sort((a, b) => b.sessions - a.sessions || a.path.localeCompare(b.path))
          .slice(0, 50),
      },
    };
  } catch (err) {
    return failure(err, "Google Analytics", account.client_email ?? "the service account");
  }
}

function asState<T>(read: Read<T>, now: Date): SourceState<T> {
  return read.status === "ok" ? read : { ...read, attemptedAt: now.toISOString(), lastGood: null };
}

const syncId = (workspaceId: string, range: AiSearchRange) => `${workspaceId}:${range}`;

async function sync(workspaceId: string, range: AiSearchRange, now: Date, previous: AiSearchReport | null): Promise<AiSearchReport> {
  const { config, account } = await loadWorkspace(workspaceId);
  const [g, v] = await Promise.all([
    readGoogle(config, account, range, now),
    readAiVisits(config, account, range, now),
  ]);
  const report: AiSearchReport = {
    range,
    attemptedAt: now.toISOString(),
    google: mergeSync(asState(g, now), previous?.google),
    aiVisits: mergeSync(asState(v, now), previous?.aiVisits),
    setup: { ...config, serviceAccountEmail: account?.client_email ?? null },
  };
  const json = report as unknown as Prisma.InputJsonValue;
  await prisma.aiSearchSync.upsert({
    where: { id: syncId(workspaceId, range) },
    create: { id: syncId(workspaceId, range), workspaceId, range, report: json, attemptedAt: now },
    update: { report: json, attemptedAt: now },
  });
  return report;
}

/**
 * The report for a range. Served from the last sync while it is under SYNC_EVERY_MINUTES
 * old; otherwise (or with `refresh`) Google is read again first.
 */
export async function getAiSearchReport(
  workspaceId: string,
  range: AiSearchRange,
  opts: { refresh?: boolean; now?: Date } = {},
): Promise<AiSearchReport> {
  const now = opts.now ?? new Date();
  const key = syncId(workspaceId, range);
  const stored = await prisma.aiSearchSync.findUnique({ where: { id: key } });
  const previous = (stored?.report as unknown as AiSearchReport | undefined) ?? null;
  const recent = stored && now.getTime() - stored.attemptedAt.getTime() < SYNC_EVERY_MINUTES * 60 * 1000;
  if (previous && recent && !opts.refresh) return previous;

  const running = inFlight.get(key);
  if (running) return running;
  const job = sync(workspaceId, range, now, previous).finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}
