import {
  type AnalyticsAdapter,
  type AnalyticsFetchContext,
  type AnalyticsMetric,
  type AnalyticsSnapshot,
  getJson,
  monthLabel,
} from "./types";

// ─── Generic JSON adapter + shared flattening helper ────────────────────────────
//
// For APIs we don't have a bespoke adapter for. GETs a configured endpoint and
// flattens every numeric field it finds into a metric. Best-effort — labels are
// derived from the JSON keys; the report author can rename/override after fetch.

function humanize(segment: string): string {
  return segment
    .replace(/[_.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Walk a JSON value and collect numeric leaves as metrics. Recurses objects up to
 * `maxDepth`, ignores arrays of objects (too noisy), and caps the total at `limit`.
 */
export function flattenMetrics(
  data: unknown,
  opts: { group?: string; prefix?: string; maxDepth?: number; limit?: number } = {},
): AnalyticsMetric[] {
  const { group, maxDepth = 3, limit = 40 } = opts;
  const out: AnalyticsMetric[] = [];

  function walk(value: unknown, path: string[], depth: number) {
    if (out.length >= limit) return;
    if (typeof value === "number" && Number.isFinite(value)) {
      const key = path.join(".");
      out.push({ key, label: humanize(path[path.length - 1] ?? key), value, group });
      return;
    }
    if (depth >= maxDepth || value === null || typeof value !== "object") return;
    if (Array.isArray(value)) return; // skip arrays — handled explicitly by adapters
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, [...path, k], depth + 1);
    }
  }

  walk(data, opts.prefix ? [opts.prefix] : [], 0);
  return out;
}

async function fetchMonth(ctx: AnalyticsFetchContext): Promise<AnalyticsSnapshot> {
  // Generic adapter expects the endpoint to be appended to baseUrl by the caller
  // having already encoded it; here baseUrl IS the full endpoint URL.
  const data = await getJson<unknown>(ctx.baseUrl, ctx.apiToken);
  return { periodLabel: monthLabel(ctx.year, ctx.month), metrics: flattenMetrics(data) };
}

export const genericAdapter: AnalyticsAdapter = {
  key: "generic",
  label: "Generic JSON API",
  defaultBaseUrl: "",
  requiresToken: false,
  hint: "Enter the full endpoint URL — every numeric field becomes a metric.",
  fetchMonth,
};
