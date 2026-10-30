/**
 * wiki-metrics.ts — the client's own product numbers, in their wiki.
 *
 * ## Where the numbers come from, in order
 *
 * 1. **The Care analytics connector**, when the client has one. It is the same source the
 *    monthly Care report already emails them, so the figures are client-safe by precedent.
 * 2. **Otherwise, one GET endpoint picked off the client's own API Docs page**, with a token
 *    if it needs one. Every numeric field it returns becomes a metric (the generic adapter's
 *    `flattenMetrics`), and Gitwork hides any that should not be shown.
 * 3. Otherwise the section says it is not connected. It never shows an empty chart, which
 *    would read as "nothing happened".
 *
 * ## No external call on a page load
 *
 * The section reads STORED snapshots only. Fetching from a client's API on every wiki load
 * would make the client's page as slow as their API and hit it once per viewer. Snapshots
 * are refreshed by `refreshWikiMetrics` — when someone at Gitwork opens the section and it
 * is behind, or presses Refresh. The page always says how old its figures are.
 *
 * The rules (which month is final, what is compared with what) live in
 * `src/lib/wiki-metrics.ts` and are unit-tested there.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptNullable, encryptNullable } from "@/lib/encryption";
import {
  type MetricsMode,
  type MetricValue,
  type MonthToDateView,
  type StoredSnapshot,
  type WikiMetric,
  endpointUrl,
  listMetricEndpoints,
  modeForAdapter,
  monthToDateStale,
  carryMonthEndFigures,
  periodOf,
  periodsToFetch,
  readMetricsConfig,
  selectMetricsView,
  FEATURED_MAX,
} from "@/lib/wiki-metrics";
import { decryptScraperConfig } from "@/server/support-scraper-config";
import {
  fetchAnalyticsMonth,
  getAdapter,
  getJson,
  type AnalyticsConnectionConfig,
} from "@/server/support-analytics";
import { flattenMetrics } from "@/server/support-analytics/generic";

export interface WikiMetricsSection {
  enabled: boolean;
  /** Null = nothing connected. The section then says so instead of showing nothing. */
  source: "care" | "api" | null;
  /** "Care analytics — Fellas" / "GET /v1/stats". Shown under the figures. */
  sourceLabel: string | null;
  mode: MetricsMode | null;
  period: string | null;
  previousPeriod: string | null;
  capturedAt: string | null;
  metrics: WikiMetric[];
  historyPeriods: string[];
  needsRefresh: boolean;
  /** The month still running ("October so far"), for a source that offers it. */
  monthToDate: MonthToDateView | null;
  /** Internal only — stripped from the client's copy by `forPublicMetrics`. */
  apiEndpoint: { serverUrl: string; path: string } | null;
  hasApiToken: boolean;
}

export const EMPTY_METRICS: WikiMetricsSection = {
  enabled: false,
  source: null,
  sourceLabel: null,
  mode: null,
  period: null,
  previousPeriod: null,
  capturedAt: null,
  metrics: [],
  historyPeriods: [],
  needsRefresh: false,
  monthToDate: null,
  apiEndpoint: null,
  hasApiToken: false,
};

/**
 * The client's copy: hidden metrics removed (not merely flagged), and the endpoint and
 * token state — our plumbing — dropped.
 */
export function forPublicMetrics(m: WikiMetricsSection): WikiMetricsSection {
  return {
    ...m,
    metrics: m.metrics.filter((x) => !x.hidden),
    monthToDate: m.monthToDate
      ? { ...m.monthToDate, metrics: m.monthToDate.metrics.filter((x) => !x.hidden) }
      : null,
    apiEndpoint: null,
    hasApiToken: false,
  };
}

function toStored(rows: { period: string; capturedAt: Date; metrics: unknown }[]): StoredSnapshot[] {
  return rows.map((r) => ({
    period: r.period,
    capturedAt: r.capturedAt.toISOString(),
    metrics: Array.isArray(r.metrics) ? (r.metrics as MetricValue[]) : [],
  }));
}

/** Stored months, minus metrics the adapter has retired (see `AnalyticsAdapter.retiredKeys`). */
export function withoutRetired(snapshots: StoredSnapshot[], retired: string[] | undefined): StoredSnapshot[] {
  if (!retired?.length) return snapshots;
  const gone = new Set(retired);
  return snapshots.map((s) => ({ ...s, metrics: s.metrics.filter((m) => !gone.has(m?.key)) }));
}

/** The Care connection behind this Portal client, if any. */
async function findCareConnection(clientId: string) {
  const care = await prisma.supportClient.findFirst({
    // `workspaceClientId` is the one link between Care and Portal — never a name match
    // (§42.15: the same client is "wedge" in Portal and "Big Wedge Golf" in Care).
    where: { workspaceClientId: clientId },
    select: { id: true, name: true },
  });
  if (!care) return null;
  const conn = await prisma.accountConnection.findFirst({
    where: { clientId: care.id, source: "ANALYTICS" },
    orderBy: { createdAt: "desc" },
    select: { scraperConfig: true },
  });
  if (!conn) return null;
  // Connector secrets are encrypted per field; `adapter` is not a secret, so it can be
  // read without decrypting anything on a page load.
  const raw = (conn.scraperConfig ?? {}) as Record<string, unknown>;
  const adapterKey = typeof raw.adapter === "string" ? raw.adapter : null;
  return { careId: care.id, careName: care.name, adapterKey, scraperConfig: conn.scraperConfig };
}

export async function loadWikiMetrics(
  clientId: string,
  now: Date = new Date(),
): Promise<WikiMetricsSection> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: { id: true, metricsEnabled: true, metricsConfig: true },
  });
  if (!wiki?.metricsEnabled) return EMPTY_METRICS;
  const cfg = readMetricsConfig(wiki.metricsConfig);
  const base = {
    ...EMPTY_METRICS,
    enabled: true,
    apiEndpoint: cfg.apiEndpoint,
    hasApiToken: Boolean(cfg.apiTokenCipher),
  };

  const care = await findCareConnection(clientId);
  let source: "care" | "api";
  let sourceLabel: string;
  let mode: MetricsMode;
  let snapshots: StoredSnapshot[];
  let monthToDate = false;
  if (care) {
    monthToDate = getAdapter(care.adapterKey ?? undefined)?.monthToDate === true;
    source = "care";
    mode = modeForAdapter(care.adapterKey);
    sourceLabel = `Care analytics — ${getAdapter(care.adapterKey ?? undefined)?.label ?? care.careName}`;
    snapshots = withoutRetired(
      toStored(
        await prisma.supportAnalyticsSnapshot.findMany({
          where: { clientId: care.careId },
          orderBy: { period: "desc" },
          take: 24,
          select: { period: true, capturedAt: true, metrics: true },
        }),
      ),
      getAdapter(care.adapterKey ?? undefined)?.retiredKeys,
    );
  } else if (cfg.apiEndpoint) {
    source = "api";
    mode = "current";
    sourceLabel = `GET ${cfg.apiEndpoint.path}`;
    snapshots = toStored(
      await prisma.wikiMetricSnapshot.findMany({
        where: { wikiId: wiki.id },
        orderBy: { period: "desc" },
        take: 24,
        select: { period: true, capturedAt: true, metrics: true },
      }),
    );
  } else {
    return base;
  }

  const view = selectMetricsView({
    mode,
    snapshots,
    now,
    hiddenKeys: cfg.hiddenKeys,
    featuredKeys: cfg.featuredKeys,
    monthToDate,
  });
  return { ...base, source, sourceLabel, mode, ...view };
}

export interface MetricsRefreshResult {
  source: "care" | "api" | null;
  /** Periods stored by this refresh. */
  fetched: string[];
  /** Periods that could not be read, each with the reason in words. */
  failed: { period: string; error: string }[];
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 300) : "Unknown error";
}

/**
 * Fetch what is missing or out of date and store it. Never throws for a source error —
 * those come back in `failed`, so the editor can say what went wrong while the section
 * keeps showing the last good figures.
 */
/**
 * Keep every running month fresh without anyone opening the page. Called from the every-minute
 * `jobs` worker; it reads stored capture times only (no client API call) unless a running month
 * is older than MONTH_TO_DATE_STALE_MS, so in practice each client's API is asked about once an
 * hour. Before this, the running month was refreshed only when someone at Gitwork opened the
 * section, so a client reading it saw figures from whenever that last was.
 *
 * Capped per run and one client at a time — these are calls to the client's own API.
 */
/**
 * When each client's running month was last ATTEMPTED (in this process). A failed fetch does not
 * move the stored capture time, so without this a broken client API would be asked every minute.
 */
const lastAttempt = new Map<string, number>();
export const RUNNING_MONTH_RETRY_MS = 15 * 60 * 1000;

export async function refreshRunningMonths(
  now: Date = new Date(),
  limit = 3,
): Promise<{ checked: number; refreshed: string[]; failed: string[] }> {
  const wikis = await prisma.clientWiki.findMany({
    where: { metricsEnabled: true },
    select: { clientId: true },
  });
  const refreshed: string[] = [];
  const failed: string[] = [];
  for (const { clientId } of wikis) {
    if (refreshed.length + failed.length >= limit) break;
    const care = await findCareConnection(clientId);
    if (!care || getAdapter(care.adapterKey ?? undefined)?.monthToDate !== true) continue;
    const stored = toStored(
      await prisma.supportAnalyticsSnapshot.findMany({
        where: { clientId: care.careId, period: periodOf(now) },
        select: { period: true, capturedAt: true, metrics: true },
      }),
    );
    if (!monthToDateStale(stored, now)) continue;
    const tried = lastAttempt.get(clientId);
    if (tried !== undefined && now.getTime() - tried < RUNNING_MONTH_RETRY_MS) continue;
    lastAttempt.set(clientId, now.getTime());
    const result = await refreshWikiMetrics(clientId, now).catch(() => null);
    if (result && result.failed.length === 0) refreshed.push(clientId);
    else failed.push(clientId);
  }
  return { checked: wikis.length, refreshed, failed };
}

export async function refreshWikiMetrics(
  clientId: string,
  now: Date = new Date(),
  /** `force`: also re-read a running month that is still fresh — a person pressed Refresh now. */
  opts: { force?: boolean } = {},
): Promise<MetricsRefreshResult> {
  const wiki = await prisma.clientWiki.findUnique({
    where: { clientId },
    select: { id: true, metricsConfig: true },
  });
  if (!wiki) return { source: null, fetched: [], failed: [] };

  const care = await findCareConnection(clientId);
  if (care) {
    const config = (decryptScraperConfig(
      care.scraperConfig as Record<string, unknown> | null,
    ) ?? {}) as AnalyticsConnectionConfig;
    const mode = modeForAdapter(care.adapterKey);
    const existing = toStored(
      await prisma.supportAnalyticsSnapshot.findMany({
        where: { clientId: care.careId },
        select: { period: true, capturedAt: true, metrics: true },
      }),
    );
    // "current" adapters report now, so there is exactly one thing to fetch: this month.
    const targets =
      mode === "monthly"
        ? periodsToFetch(existing, now, {
            monthToDate: getAdapter(care.adapterKey ?? undefined)?.monthToDate === true,
            force: opts.force,
          })
        : [periodOf(now)];
    const result: MetricsRefreshResult = { source: "care", fetched: [], failed: [] };
    // One at a time: these are calls to the client's own API, and six in parallel on
    // every refresh is a burst nobody asked for.
    for (const period of targets) {
      const [y, m] = period.split("-").map(Number);
      try {
        const snap = await fetchAnalyticsMonth(config, y, m);
        // ⚠️ Never stored empty: an empty month would read as "nothing happened" and
        // would count as that month's FINAL figure, so it would never be fetched again.
        if (snap.metrics.length === 0) {
          throw new Error("The connector answered, but returned no numbers for this month.");
        }
        // A finished month keeps the as-of-now figures from its last capture during it.
        const metricsToStore =
          period === periodOf(now)
            ? snap.metrics
            : carryMonthEndFigures(
                snap.metrics as MetricValue[],
                existing.find((s) => s.period === period),
                getAdapter(care.adapterKey ?? undefined)?.carryAtMonthEnd,
              );
        await prisma.supportAnalyticsSnapshot.upsert({
          where: { clientId_period: { clientId: care.careId, period } },
          create: { clientId: care.careId, period, metrics: metricsToStore as object, capturedAt: now },
          update: { metrics: metricsToStore as object, capturedAt: now },
        });
        result.fetched.push(period);
      } catch (err) {
        result.failed.push({ period, error: errorText(err) });
      }
    }
    return result;
  }

  const cfg = readMetricsConfig(wiki.metricsConfig);
  if (!cfg.apiEndpoint) return { source: null, fetched: [], failed: [] };
  const period = periodOf(now);
  try {
    const data = await getJson<unknown>(
      endpointUrl(cfg.apiEndpoint),
      decryptNullable(cfg.apiTokenCipher) ?? undefined,
    );
    const metrics = flattenMetrics(data, { limit: 60 });
    // ⚠️ Not stored when empty: an empty snapshot would become the newest one and replace
    // last month's real figures with nothing.
    if (metrics.length === 0) {
      throw new Error("The endpoint answered, but returned no numbers to show.");
    }
    await prisma.wikiMetricSnapshot.upsert({
      where: { wikiId_period: { wikiId: wiki.id, period } },
      create: { wikiId: wiki.id, period, metrics: metrics as object, capturedAt: now },
      update: { metrics: metrics as object, capturedAt: now },
    });
    return { source: "api", fetched: [period], failed: [] };
  } catch (err) {
    return { source: "api", fetched: [], failed: [{ period, error: errorText(err) }] };
  }
}

export interface MetricsConfigPatch {
  enabled?: boolean;
  hiddenKeys?: string[];
  featuredKeys?: string[];
  /** Null clears it. Must be one of the API Docs page's own GET endpoints. */
  apiEndpoint?: { serverUrl: string; path: string } | null;
  /** A string sets it, "" clears it. Undefined leaves it alone. */
  apiToken?: string;
}

/** The GET endpoints the client's API Docs page documents — the only ones that can be picked. */
export async function listWikiMetricEndpoints(clientId: string) {
  const page = await prisma.clientWikiPage.findFirst({
    where: { wiki: { clientId }, type: "API_DOCS" },
    select: { content: true },
  });
  return listMetricEndpoints(page?.content ?? null);
}

export class MetricsConfigError extends Error {
  status = 400;
}

export async function setWikiMetricsConfig(
  clientId: string,
  patch: MetricsConfigPatch,
): Promise<void> {
  const wiki = await prisma.clientWiki.upsert({
    where: { clientId },
    create: { clientId },
    update: {},
    select: { id: true, metricsConfig: true },
  });
  const cfg = readMetricsConfig(wiki.metricsConfig);

  if (patch.apiEndpoint !== undefined && patch.apiEndpoint !== null) {
    const options = await listWikiMetricEndpoints(clientId);
    const wanted = patch.apiEndpoint;
    // ⚠️ Picked FROM the API Docs page, never typed. This route is internal, but the URL is
    // fetched server-side on a schedule, so it must be one the client documented — not any
    // address someone pasted. (`getJson` also runs the SSRF guard on every call.)
    const ok = options.some((o) => o.serverUrl === wanted.serverUrl && o.path === wanted.path);
    if (!ok) {
      throw new MetricsConfigError(
        "That endpoint is not a GET endpoint on this client's API Docs page.",
      );
    }
  }

  const next = {
    hiddenKeys: patch.hiddenKeys ?? cfg.hiddenKeys,
    featuredKeys: (patch.featuredKeys ?? cfg.featuredKeys).slice(0, FEATURED_MAX),
    apiEndpoint: patch.apiEndpoint !== undefined ? patch.apiEndpoint : cfg.apiEndpoint,
    apiTokenCipher:
      patch.apiToken === undefined
        ? cfg.apiTokenCipher
        : patch.apiToken.trim()
          ? encryptNullable(patch.apiToken.trim())
          : null,
  };

  await prisma.clientWiki.update({
    where: { id: wiki.id },
    data: {
      ...(patch.enabled !== undefined ? { metricsEnabled: patch.enabled } : {}),
      metricsConfig: next as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}
