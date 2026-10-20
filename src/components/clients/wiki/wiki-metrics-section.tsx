"use client";

/**
 * Metrics — the client's own product numbers, in their wiki.
 *
 * One component for both audiences so they can never disagree about a figure. The
 * settings panel (source, refresh, hide/feature) renders only when `editable`; the
 * client's copy has hidden metrics and the endpoint settings removed on the server
 * (`forPublicMetrics`), not merely hidden here.
 *
 * Where the numbers come from and which month is "final" is decided in
 * `src/lib/wiki-metrics.ts` and `src/server/wiki-metrics.ts`.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowPathIcon, EyeIcon, EyeSlashIcon, StarIcon } from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
import { AreaSparkline, MONO, SERIF, TrendBadge } from "@/components/analytics/analytics-widgets";
import {
  FEATURED_MAX,
  formatMetric,
  metricTrend,
  periodLabel,
  tilesFor,
  type MonthToDateMetric,
  type MonthToDateView,
  type WikiMetric,
} from "@/lib/wiki-metrics";
import type { WikiMetricsSection } from "@/server/wiki-metrics";
import {
  useRefreshWikiMetrics,
  useUpdateWikiMetrics,
  useWikiMetricEndpoints,
} from "@/hooks/use-wiki";

function Header({ n, label, status }: { n: string; label: string; status?: string }) {
  return (
    <div className="widget-header">
      <span className="widget-header__label" style={{ fontFamily: MONO }}>
        <span className="widget-header__label--number">{n}</span>
        {` // ${label}`}
      </span>
      {status ? (
        <span className="widget-header__status shrink-0" style={{ fontFamily: MONO }}>
          {status}
        </span>
      ) : null}
    </div>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** What the figures are, in words — the month for a monthly source, "as of" for a live one. */
export function metricsHeadline(m: Pick<WikiMetricsSection, "mode" | "period" | "capturedAt">): string | null {
  if (!m.period) return null;
  if (m.mode === "current" && m.capturedAt) return `As of ${shortDate(m.capturedAt)}`;
  return periodLabel(m.period);
}

/** "Sep 2026" → "SEP 26": short enough for the two ends of a card's chart. */
function shortPeriod(period: string): string {
  const [y, m] = period.split("-");
  const label = periodLabel(period).split(" ")[0]?.slice(0, 3) ?? m;
  return `${label} ${y.slice(2)}`.toUpperCase();
}

/**
 * One metric as a graph card: figure, label and change on top, the last six months drawn
 * full-width along the bottom INSIDE the card, with the first and last month named so the
 * line reads as a span of time rather than decoration.
 */
function MetricTile({ metric, periods }: { metric: WikiMetric; periods: string[] }) {
  const known = metric.history
    .map((v, i) => ({ v, period: periods[i] }))
    .filter((p): p is { v: number; period: string } => p.v !== null && Boolean(p.period));
  const raw = known.map((p) => p.v);
  // Drawn against its own range, not from zero: 4,410 → 4,812 is the story, and from zero
  // it reads as a flat line along the bottom.
  const floor = raw.length ? Math.min(...raw) : 0;
  const points = raw.map((v) => v - floor);
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)]">
      <div className="px-3.5 pt-3">
        <div
          className="truncate tabular-nums text-[var(--text-1)]"
          style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1, letterSpacing: "-0.02em" }}
          title={formatMetric(metric.value, metric.unit, metric.money)}
        >
          {formatMetric(metric.value, metric.unit, metric.money)}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span
            className="min-w-0 truncate text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]"
            style={{ fontFamily: MONO }}
            title={metric.label}
          >
            {metric.label}
          </span>
          {/* Neutral: a rising number is good for "users" and bad for "cancellations", and
              the adapter does not say which this is — so the arrow is told to colour neither. */}
          <span className="shrink-0 text-xs text-[var(--text-3)]">
            <TrendBadge delta={metricTrend(metric.value, metric.previous)} goodWhen="neutral" />
          </span>
        </div>
      </div>
      {/* The chart band is always the same height, so every card in a row lines up. */}
      <div className="mt-auto pt-3">
        {points.length >= 2 ? (
          <>
            <div className="h-12" aria-hidden>
              <AreaSparkline points={points} height={48} />
            </div>
            <div
              className="flex justify-between border-t border-[var(--border-1)] px-3.5 py-1.5 text-[9px] tracking-[0.08em] text-[var(--text-4)]"
              style={{ fontFamily: MONO }}
            >
              <span>{shortPeriod(known[0].period)}</span>
              <span>{shortPeriod(known[known.length - 1].period)}</span>
            </div>
          </>
        ) : (
          <p
            className="flex h-[73px] items-center justify-center border-t border-[var(--border-1)] px-3.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
            style={{ fontFamily: MONO }}
          >
            Trend after two months
          </p>
        )}
      </div>
    </div>
  );
}

function groupBy<T extends { group: string | null }>(rows: T[]): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const m of rows) {
    const g = m.group ?? "";
    out.set(g, [...(out.get(g) ?? []), m]);
  }
  return [...out.entries()];
}

function GroupLabel({ children }: { children: string }) {
  return (
    <p className="mb-2 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
      {children}
    </p>
  );
}

/** "As of 20 Oct, 14:05" — a running month is only true as of a moment. */
function asOf(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `As of ${day}, ${time}`;
}

/**
 * A figure from the month still running. No trend and no sparkline on purpose: compared with
 * a whole month, part of one always reads as a fall.
 */
function SoFarTile({ metric }: { metric: MonthToDateMetric }) {
  const text = formatMetric(metric.value, metric.unit, metric.money);
  return (
    <div className="min-w-0 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-3">
      <div
        className="truncate tabular-nums text-[var(--text-1)]"
        style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1, letterSpacing: "-0.02em" }}
        title={text}
      >
        {text}
      </div>
      <span
        className="mt-1.5 block truncate text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]"
        style={{ fontFamily: MONO }}
        title={metric.label}
      >
        {metric.label}
      </span>
    </div>
  );
}

/**
 * Several metrics in ONE card — "12 Subscriptions" as the figure, "6 monthly · 6 yearly"
 * underneath as supporting detail. The first part is the headline (it is listed first by the
 * adapter); the rest break it down. Each part is still its own metric underneath.
 */
function CardTile({
  title,
  parts,
}: {
  title: string;
  parts: { key: string; value: number; unit: string | null; money?: boolean; part: string; previous?: number | null }[];
}) {
  const [main, ...rest] = parts;
  const text = formatMetric(main.value, main.unit, main.money);
  const breakdown = rest.map((p) => `${formatMetric(p.value, p.unit, p.money)} ${p.part.toLowerCase()}`).join(" · ");
  return (
    <div className="flex min-w-0 flex-col rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-3">
      <div
        className="truncate tabular-nums text-[var(--text-1)]"
        style={{ fontFamily: SERIF, fontSize: 30, lineHeight: 1, letterSpacing: "-0.02em" }}
        title={text}
      >
        {text}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span
          className="min-w-0 truncate text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]"
          style={{ fontFamily: MONO }}
          title={title}
        >
          {title}
        </span>
        {/* A whole month carries a change; the running month never does (half a month
            against a whole one always reads as a fall). */}
        {main.previous !== undefined ? (
          <span className="shrink-0 text-xs text-[var(--text-3)]">
            <TrendBadge delta={metricTrend(main.value, main.previous ?? null)} goodWhen="neutral" />
          </span>
        ) : null}
      </div>
      {breakdown ? (
        <p
          className="mt-2 truncate border-t border-[var(--border-1)] pt-2 text-[11px] tabular-nums text-[var(--text-3)]"
          style={{ fontFamily: MONO }}
          title={breakdown}
        >
          {breakdown}
        </p>
      ) : null}
    </div>
  );
}

function MonthToDateCard({ n, view }: { n: string; view: MonthToDateView }) {
  const rows = view.metrics.filter((m) => !m.hidden);
  const month = periodLabel(view.period).split(" ")[0] ?? periodLabel(view.period);
  if (rows.length === 0) return null;
  return (
    <section className="widget-card">
      <Header n={n} label={`${month.toUpperCase()} SO FAR`} status={asOf(view.capturedAt).toUpperCase()} />
      <div className="space-y-5 p-5">
        {groupBy(rows).map(([group, ms]) => (
          <div key={group || "_"}>
            {group ? <GroupLabel>{group}</GroupLabel> : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tilesFor(ms).map((t) =>
                t.kind === "single" ? (
                  <SoFarTile key={t.metric.key} metric={t.metric} />
                ) : (
                  <CardTile
                    key={t.id}
                    title={t.title}
                    parts={t.parts.map((m) => ({ ...m, part: m.card?.part ?? m.label }))}
                  />
                ),
              )}
            </div>
          </div>
        ))}
        <p className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
          {month} is still running, so these are not compared with whole months. The final
          figures replace them once it ends.
        </p>
      </div>
    </section>
  );
}

export function WikiMetricsSectionView({
  metrics,
  slug,
  editable = false,
}: {
  metrics: WikiMetricsSection;
  slug?: string;
  editable?: boolean;
}) {
  const visible = metrics.metrics.filter((m) => !m.hidden);
  const groups = useMemo(() => groupBy<WikiMetric>(visible), [visible]);
  const headline = metricsHeadline(metrics);
  const soFar =
    metrics.monthToDate && metrics.monthToDate.metrics.some((m) => !m.hidden) ? metrics.monthToDate : null;
  // Numbered in the order they render, so the sequence never skips.
  const num = (i: number) => String(i + (soFar ? 1 : 0)).padStart(2, "0");

  return (
    <div className="space-y-4">
      {soFar ? <MonthToDateCard n="01" view={soFar} /> : null}
      <section className="widget-card">
        <Header n={num(1)} label="METRICS" status={headline ?? undefined} />
        {!metrics.source ? (
          <p className="p-8 text-center text-sm text-[var(--text-4)]">
            {/* Never an empty chart — that would read as "nothing happened". */}
            Product metrics aren&rsquo;t connected for this client yet.
          </p>
        ) : visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--text-4)]">
            {metrics.period
              ? "Every metric is hidden. Show one below to put it here."
              : "No figures have been fetched yet."}
          </p>
        ) : (
          <div className="space-y-5 p-5">
            {groups.map(([group, rows]) => (
              <div key={group || "_"}>
                {group ? <GroupLabel>{group}</GroupLabel> : null}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {tilesFor(rows).map((t) =>
                    t.kind === "single" ? (
                      <MetricTile key={t.metric.key} metric={t.metric} periods={metrics.historyPeriods} />
                    ) : (
                      <CardTile
                        key={t.id}
                        title={t.title}
                        parts={t.parts.map((m) => ({ ...m, part: m.card?.part ?? m.label }))}
                      />
                    ),
                  )}
                </div>
              </div>
            ))}
            <p className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              {metrics.previousPeriod
                ? `Compared with ${periodLabel(metrics.previousPeriod)}.`
                : "Nothing earlier to compare with yet."}
              {metrics.mode === "monthly"
                ? " Figures are for whole months, shown once the month is over."
                : ""}
            </p>
          </div>
        )}
      </section>

      {editable && slug ? <MetricsSettings n={num(2)} metrics={metrics} slug={slug} /> : null}
    </div>
  );
}

function MetricsSettings({ n, metrics, slug }: { n: string; metrics: WikiMetricsSection; slug: string }) {
  const refresh = useRefreshWikiMetrics(slug);
  const update = useUpdateWikiMetrics(slug);

  // Opening the section is what keeps it current: no cron to forget to install, and the
  // client's API is only ever called because someone at Gitwork looked. Once per mount.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !metrics.source || !metrics.needsRefresh) return;
    autoRan.current = true;
    refresh.mutate();
  }, [metrics.source, metrics.needsRefresh, refresh]);

  const failed = refresh.data?.failed ?? [];
  const featured = metrics.metrics.filter((m) => m.featured).map((m) => m.key);
  // A figure that only exists in the running month (Revenue, the month it launched) still
  // has to be hideable — otherwise the first anyone could hide it is after the client saw it.
  const wholeMonthKeys = new Set(metrics.metrics.map((m) => m.key));
  const runningOnly = (metrics.monthToDate?.metrics ?? []).filter((m) => !wholeMonthKeys.has(m.key));
  const rows: { key: string; label: string; value: number; unit: string | null; money?: boolean; hidden: boolean; featured: boolean; canFeature: boolean }[] = [
    ...metrics.metrics.map((m) => ({ ...m, canFeature: true })),
    ...runningOnly.map((m) => ({ ...m, featured: false, canFeature: false })),
  ];
  const hidden = rows.filter((m) => m.hidden).map((m) => m.key);

  function toggleHidden(key: string) {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    update.mutate({
      hiddenKeys: next,
      // A hidden metric cannot lead the dashboard card.
      featuredKeys: featured.filter((k) => !next.includes(k)),
    });
  }

  function toggleFeatured(key: string) {
    const next = featured.includes(key)
      ? featured.filter((k) => k !== key)
      : [...featured, key].slice(-FEATURED_MAX);
    update.mutate({ featuredKeys: next });
  }

  return (
    <section className="widget-card">
      <Header n={n} label="SETTINGS" status="GITWORK ONLY" />
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 text-[13px] text-[var(--text-2)]">
            <p>
              <span className="text-[var(--text-4)]">Source: </span>
              {metrics.sourceLabel ?? "Not connected"}
            </p>
            {metrics.capturedAt ? (
              <p className="mt-0.5 text-[12px] text-[var(--text-4)]">
                Last fetched {shortDate(metrics.capturedAt)}
              </p>
            ) : null}
          </div>
          {metrics.source ? (
            <button
              type="button"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
              className="app-button app-button-utility app-button-xs inline-flex items-center gap-1.5"
            >
              <ArrowPathIcon className={`h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} />
              {refresh.isPending ? "Refreshing…" : "Refresh"}
            </button>
          ) : null}
        </div>

        {refresh.isError ? (
          <p className="text-[13px] text-[var(--danger-500)]">Refresh failed. Try again.</p>
        ) : null}
        {failed.length > 0 ? (
          <div className="rounded-[8px] border border-[var(--danger-500)]/40 bg-[var(--danger-50)] px-3 py-2 text-[13px] text-[var(--text-2)]">
            <p className="font-medium">Some figures could not be fetched.</p>
            <ul className="mt-1 space-y-0.5">
              {failed.map((f) => (
                <li key={f.period} className="break-words">
                  <span style={{ fontFamily: MONO }}>{f.period}</span> — {f.error}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[12px] text-[var(--text-4)]">
              The last good figures stay on the page until a fetch works.
            </p>
          </div>
        ) : null}

        {metrics.source !== "care" ? <ApiSourcePicker metrics={metrics} slug={slug} /> : null}

        {rows.length > 0 ? (
          <div>
            <p
              className="mb-2 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]"
              style={{ fontFamily: MONO }}
            >
              What the client sees · ★ leads the dashboard card (up to {FEATURED_MAX})
            </p>
            <ul className="divide-y divide-[var(--border-1)] rounded-[8px] border border-[var(--border-1)]">
              {rows.map((m) => (
                <li key={m.key} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[13px] ${m.hidden ? "text-[var(--text-4)] line-through" : "text-[var(--text-1)]"}`} title={m.label}>
                      {m.label}
                    </p>
                    <p className="truncate text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }} title={m.key}>
                      {formatMetric(m.value, m.unit, m.money)} · {m.key}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFeatured(m.key)}
                    disabled={m.hidden || !m.canFeature || update.isPending}
                    className="rounded-[6px] p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-1)] disabled:opacity-40"
                    aria-label={m.featured ? `Stop featuring ${m.label}` : `Feature ${m.label} on the dashboard`}
                    title={
                      !m.canFeature
                        ? "Can be featured once a whole month has it"
                        : m.featured
                          ? "Featured on the dashboard"
                          : "Feature on the dashboard"
                    }
                  >
                    {m.featured ? (
                      <StarSolid className="h-4 w-4 text-[var(--brand-600)]" />
                    ) : (
                      <StarIcon className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleHidden(m.key)}
                    disabled={update.isPending}
                    className="rounded-[6px] p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-1)] disabled:opacity-40"
                    aria-label={m.hidden ? `Show ${m.label} to the client` : `Hide ${m.label} from the client`}
                    title={m.hidden ? "Hidden from the client" : "Shown to the client"}
                  >
                    {m.hidden ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Pick an endpoint off the API Docs page — only offered when there is no Care connector. */
function ApiSourcePicker({ metrics, slug }: { metrics: WikiMetricsSection; slug: string }) {
  const endpoints = useWikiMetricEndpoints(slug, true);
  const update = useUpdateWikiMetrics(slug);
  const refresh = useRefreshWikiMetrics(slug);
  const [token, setToken] = useState("");
  const options = endpoints.data?.endpoints ?? [];
  const current = metrics.apiEndpoint
    ? `${metrics.apiEndpoint.serverUrl}|${metrics.apiEndpoint.path}`
    : "";
  const chosen = options.find((o) => `${o.serverUrl}|${o.path}` === current) ?? null;

  async function choose(value: string) {
    const opt = options.find((o) => `${o.serverUrl}|${o.path}` === value) ?? null;
    await update.mutateAsync({
      apiEndpoint: opt ? { serverUrl: opt.serverUrl, path: opt.path } : null,
    });
    if (opt) refresh.mutate();
  }

  return (
    <div className="space-y-3 rounded-[8px] border border-[var(--border-1)] p-4">
      <p className="text-[13px] text-[var(--text-2)]">
        No Care analytics connector. Pick a GET endpoint from this client&rsquo;s API Docs page and
        every number it returns becomes a metric.
      </p>
      {endpoints.isLoading ? (
        <p className="text-[12px] text-[var(--text-4)]">Reading the API Docs page…</p>
      ) : options.length === 0 ? (
        <p className="text-[12px] text-[var(--text-4)]">
          The API Docs page has no GET endpoints that can be called as they are (no{" "}
          <span style={{ fontFamily: MONO }}>{"{id}"}</span> in the path, on an http(s) server).
          Add one there first.
        </p>
      ) : (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">Endpoint</span>
          <select
            value={current}
            onChange={(e) => void choose(e.target.value)}
            disabled={update.isPending}
            className="app-input app-select-chevron pr-9"
          >
            <option value="">None</option>
            {options.map((o) => (
              <option key={`${o.serverUrl}|${o.path}`} value={`${o.serverUrl}|${o.path}`}>
                {`GET ${o.path} — ${o.serverLabel}${o.summary ? ` · ${o.summary}` : ""}`}
              </option>
            ))}
          </select>
        </label>
      )}

      {metrics.apiEndpoint ? (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-[var(--text-2)]">
            Token{" "}
            <span className="font-normal text-[var(--text-4)]">
              {chosen?.auth ? "· this endpoint needs one" : "· only if the endpoint needs one"}
            </span>
          </span>
          <div className="flex flex-wrap gap-2">
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={metrics.hasApiToken ? "Saved — paste a new one to replace it" : "Bearer token"}
              className="app-input min-w-[220px] flex-1"
            />
            <button
              type="button"
              disabled={!token.trim() || update.isPending}
              onClick={async () => {
                await update.mutateAsync({ apiToken: token.trim() });
                setToken("");
                refresh.mutate();
              }}
              className="app-button app-button-utility app-button-xs"
            >
              Save token
            </button>
            {metrics.hasApiToken ? (
              <button
                type="button"
                disabled={update.isPending}
                onClick={() => update.mutate({ apiToken: "" })}
                className="app-button app-button-utility app-button-xs"
              >
                Clear
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-[12px] text-[var(--text-4)]">
            Stored encrypted. It never reaches the client&rsquo;s page.
          </p>
        </div>
      ) : null}
      {update.isError ? (
        <p className="text-[13px] text-[var(--danger-500)]">
          {(update.error as Error)?.message || "Could not save."}
        </p>
      ) : null}
    </div>
  );
}
