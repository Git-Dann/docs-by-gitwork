import {
  type AnalyticsAdapter,
  type AnalyticsConnectionConfig,
  type AnalyticsSnapshot,
} from "./types";
import { fellasAdapter } from "./fellas";
import { bigwedgeAdapter } from "./bigwedge";
import { genericAdapter } from "./generic";

export * from "./types";

// Registry — add a new client's adapter here once written.
const ADAPTERS: AnalyticsAdapter[] = [fellasAdapter, bigwedgeAdapter, genericAdapter];

export function listAdapters() {
  return ADAPTERS.map((a) => ({
    key: a.key,
    label: a.label,
    defaultBaseUrl: a.defaultBaseUrl,
    requiresToken: a.requiresToken,
    hint: a.hint ?? "",
  }));
}

export function getAdapter(key: string | undefined): AnalyticsAdapter | null {
  return ADAPTERS.find((a) => a.key === key) ?? null;
}

/**
 * Fetch a month's analytics for a connection and merge in the previous month's
 * values (matched by metric key) so the report can render trends. The previous
 * month is best-effort — if it fails, current values are returned without trends.
 */
export async function runAnalytics(
  config: AnalyticsConnectionConfig,
  year: number,
  month: number,
): Promise<AnalyticsSnapshot> {
  const adapter = getAdapter(config.adapter);
  if (!adapter) throw new Error(`Unknown analytics adapter: ${config.adapter ?? "(none)"}`);

  const baseUrl = (config.baseUrl?.trim() || adapter.defaultBaseUrl).replace(/\/$/, "");
  if (!baseUrl) throw new Error("No base URL configured for this analytics connection");
  if (adapter.requiresToken && !config.apiToken?.trim()) {
    throw new Error(`${adapter.label} requires an API token — add it in the connector`);
  }

  const ctx = { baseUrl, apiToken: config.apiToken?.trim() || undefined, year, month };
  const current = await adapter.fetchMonth(ctx);

  // Previous calendar month for trend comparison
  const prevDate = new Date(year, month - 2, 1);
  let prevMap = new Map<string, number>();
  try {
    const previous = await adapter.fetchMonth({
      ...ctx,
      year: prevDate.getFullYear(),
      month: prevDate.getMonth() + 1,
    });
    prevMap = new Map(previous.metrics.map((m) => [m.key, m.value]));
  } catch { /* trends are optional */ }

  return {
    periodLabel: current.periodLabel,
    metrics: current.metrics.map((m) => ({ ...m, previous: prevMap.get(m.key) })),
  };
}
