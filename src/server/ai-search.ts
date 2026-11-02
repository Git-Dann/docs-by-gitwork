import { google, type analyticsdata_v1beta } from "googleapis";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readSecret } from "@/server/stored-secret";
import {
  AI_SOURCE_REGEX,
  GA4_LAG_DAYS,
  SEARCH_CONSOLE_LAG_DAYS,
  compareQueries,
  classifyAiSource,
  parseAiSearchConfig,
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
  type SourceState,
} from "@/lib/ai-search";

/**
 * Pulse → AI search. Reads Google Search Console and GA4 live, with the workspace's Google
 * service account (Settings → Integrations), and never stores the figures.
 *
 * Why a service account and not a person's Google sign-in: adding the Search Console and
 * Analytics scopes to sign-in would make every teammate sign in again, to grant access only
 * one report needs. A service account is added once, as a read-only user, on the Search
 * Console property and the GA4 property, and nobody else is asked anything.
 */

const SC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/** Search Console's own cap on rows per request. */
const SC_ROW_LIMIT = 25000;

/** Reports are cached per workspace and range. The sources only change daily. */
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; report: AiSearchReport }>();

export function clearAiSearchCache(workspaceId: string): void {
  for (const key of cache.keys()) if (key.startsWith(`${workspaceId}:`)) cache.delete(key);
}

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
  clearAiSearchCache(workspaceId);
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

/** A Google error as a sentence that says what to do. */
function failure<T>(err: unknown, where: "Search Console" | "Google Analytics", email: string): SourceState<T> {
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

async function queryRows(
  sc: ReturnType<typeof google.searchconsole>,
  siteUrl: string,
  period: Period,
): Promise<{ rows: QueryRow[]; truncated: boolean }> {
  const res = await sc.searchanalytics.query({
    siteUrl,
    requestBody: { startDate: period.start, endDate: period.end, dimensions: ["query"], rowLimit: SC_ROW_LIMIT },
  });
  const rows: QueryRow[] = (res.data.rows ?? [])
    .map((r) => ({
      query: String(r.keys?.[0] ?? ""),
      clicks: Number(r.clicks ?? 0),
      impressions: Number(r.impressions ?? 0),
      position: Number(r.position ?? 0),
    }))
    .filter((r) => r.query && r.position > 0);
  return { rows, truncated: (res.data.rows?.length ?? 0) >= SC_ROW_LIMIT };
}

async function readGoogle(
  config: AiSearchConfig,
  account: ServiceAccount | null,
  range: AiSearchRange,
  today: Date,
): Promise<SourceState<GoogleReport>> {
  if (!config.searchConsoleSite) return { status: "not_configured", message: "Add the Search Console property below." };
  if (!account) return { status: "no_credentials", message: "Add a Google service account in Settings → Integrations." };
  const { current, previous } = periodsFor(range, today, SEARCH_CONSOLE_LAG_DAYS);
  try {
    const sc = google.searchconsole({ version: "v1", auth: authFor(account, SC_SCOPE) });
    const [now, before] = await Promise.all([
      queryRows(sc, config.searchConsoleSite, current),
      queryRows(sc, config.searchConsoleSite, previous),
    ]);
    return {
      status: "ok",
      data: {
        period: current,
        previousPeriod: previous,
        current: summariseQueries(now.rows),
        previous: summariseQueries(before.rows),
        truncated: now.truncated || before.truncated,
        queries: compareQueries(now.rows, before.rows),
      },
    };
  } catch (err) {
    return failure(err, "Search Console", account.client_email ?? "the service account");
  }
}

type RunReportBody = analyticsdata_v1beta.Schema$RunReportRequest;

function aiFilter(): NonNullable<RunReportBody>["dimensionFilter"] {
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
  today: Date,
): Promise<SourceState<AiVisitsReport>> {
  if (!config.ga4PropertyId) return { status: "not_configured", message: "Add the GA4 property id below." };
  if (!account) return { status: "no_credentials", message: "Add a Google service account in Settings → Integrations." };
  const { current, previous } = periodsFor(range, today, GA4_LAG_DAYS);
  const property = `properties/${config.ga4PropertyId}`;
  try {
    const ga = google.analyticsdata({ version: "v1beta", auth: authFor(account, GA_SCOPE) });
    const run = (requestBody: RunReportBody) => ga.properties.runReport({ property, requestBody });
    const sessions = [{ name: "sessions" }];
    const [daily, before, pages] = await Promise.all([
      run({
        dateRanges: [{ startDate: current.start, endDate: current.end }],
        dimensions: [{ name: "date" }, { name: "sessionSource" }],
        metrics: sessions,
        dimensionFilter: aiFilter(),
        limit: "10000",
      }),
      run({
        dateRanges: [{ startDate: previous.start, endDate: previous.end }],
        dimensions: [{ name: "sessionSource" }],
        metrics: sessions,
        dimensionFilter: aiFilter(),
        limit: "1000",
      }),
      run({
        dateRanges: [{ startDate: current.start, endDate: current.end }],
        dimensions: [{ name: "landingPage" }, { name: "sessionSource" }],
        metrics: sessions,
        dimensionFilter: aiFilter(),
        limit: "2000",
      }),
    ]);

    const value = (row: { metricValues?: Array<{ value?: string | null }> | null }) =>
      Number(row.metricValues?.[0]?.value ?? 0);
    const dim = (row: { dimensionValues?: Array<{ value?: string | null }> | null }, i: number) =>
      String(row.dimensionValues?.[i]?.value ?? "");

    const dailyRows: AiVisitRow[] = (daily.data.rows ?? []).map((r) => ({ date: dim(r, 0), source: dim(r, 1), sessions: value(r) }));
    const beforeRows: AiVisitRow[] = (before.data.rows ?? []).map((r) => ({ source: dim(r, 0), sessions: value(r) }));
    const previousSummary = summariseAiVisits(beforeRows, previous);

    const byPage = new Map<string, number>();
    for (const r of pages.data.rows ?? []) {
      if (!classifyAiSource(dim(r, 1))) continue;
      const path = dim(r, 0) || "(not set)";
      byPage.set(path, (byPage.get(path) ?? 0) + value(r));
    }

    return {
      status: "ok",
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

export async function getAiSearchReport(
  workspaceId: string,
  range: AiSearchRange,
  opts: { refresh?: boolean; now?: Date } = {},
): Promise<AiSearchReport> {
  const key = `${workspaceId}:${range}`;
  const now = opts.now ?? new Date();
  const hit = cache.get(key);
  if (!opts.refresh && hit && now.getTime() - hit.at < CACHE_TTL_MS) return hit.report;

  const { config, account } = await loadWorkspace(workspaceId);
  const [googleState, aiVisits] = await Promise.all([
    readGoogle(config, account, range, now),
    readAiVisits(config, account, range, now),
  ]);
  const report: AiSearchReport = {
    range,
    generatedAt: now.toISOString(),
    google: googleState,
    aiVisits,
    setup: { ...config, serviceAccountEmail: account?.client_email ?? null },
  };
  // Only a report that read something is worth keeping; a failure is retried on the next look.
  if (googleState.status === "ok" || aiVisits.status === "ok") {
    if (cache.size > 50) cache.clear();
    cache.set(key, { at: now.getTime(), report });
  }
  return report;
}
