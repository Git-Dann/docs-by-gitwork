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
  listHideKey,
  SO_FAR,
  formatMetric,
  headlineTileIndexes,
  metricPeriodOptions,
  metricTrend,
  metricsAt,
  periodLabel,
  tilesFor,
  type MetricTileGroup,
  type PeriodMetric,
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

/** "4 min ago" today, "30 Oct, 13:00" before that — always the real time of the fetch. */
function whenRefreshed(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const min = Math.floor((now - t) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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
 * One metric as a card: figure, label and change on top, its trend drawn full-width along
 * the bottom INSIDE the card with the first and last month named, so the line reads as a
 * span of time rather than decoration. `size="lg"` is the headline row.
 *
 * The running month has no change and no line, on purpose: part of a month against a whole
 * one always reads as a fall.
 */
function MetricTile({ metric, size = "md" }: { metric: PeriodMetric; size?: "md" | "lg" }) {
  const known = metric.history;
  const raw = known.map((p) => p.value);
  // Drawn against its own range, not from zero: 4,410 → 4,812 is the story, and from zero
  // it reads as a flat line along the bottom.
  const floor = raw.length ? Math.min(...raw) : 0;
  const points = raw.map((v) => v - floor);
  const text = formatMetric(metric.value, metric.unit, metric.money);
  const lg = size === "lg";
  const soFar = metric.previous === undefined;
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)]">
      <div className={lg ? "px-4 pt-4" : "px-3.5 pt-3"}>
        <div
          className="truncate tabular-nums text-[var(--text-1)]"
          style={{ fontFamily: SERIF, fontSize: lg ? 44 : 30, lineHeight: 1, letterSpacing: "-0.02em" }}
          title={text}
        >
          {text}
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
          {!soFar ? (
            <span className="shrink-0 text-xs text-[var(--text-3)]">
              <TrendBadge delta={metricTrend(metric.value, metric.previous ?? null)} goodWhen="neutral" />
            </span>
          ) : null}
        </div>
      </div>
      {soFar ? (
        <div className={lg ? "pb-4" : "pb-3"} />
      ) : (
        // The chart band is always the same height, so every card in a row lines up.
        <div className="mt-auto pt-3">
          {points.length >= 2 ? (
            <>
              <div className={lg ? "h-16" : "h-12"} aria-hidden>
                <AreaSparkline points={points} height={lg ? 64 : 48} />
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
              className={`flex ${lg ? "h-[89px]" : "h-[73px]"} items-center justify-center border-t border-[var(--border-1)] px-3.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]`}
              style={{ fontFamily: MONO }}
            >
              Trend after two months
            </p>
          )}
        </div>
      )}
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
 * Several metrics in ONE card — "12 Subscriptions" as the figure, "6 monthly · 6 yearly"
 * underneath as supporting detail. The first part is the headline (it is listed first by the
 * adapter); the rest break it down. Each part is still its own metric underneath.
 */
/**
 * A ranked list — "Most played courses", "Game modes". Every part is a row; there is no
 * headline figure and no trend (a ranking reshuffles month to month, so a change per row would
 * compare different courses).
 */
function ListTile({ title, parts }: { title: string; parts: PeriodMetric[] }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] px-3.5 py-3">
      <p
        className="truncate text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]"
        style={{ fontFamily: MONO }}
        title={title}
      >
        {title}
      </p>
      <ol className="mt-2 space-y-1.5">
        {parts.map((p, i) => {
          const name = p.card?.part ?? p.label;
          return (
            <li key={p.key} className="flex min-w-0 items-baseline gap-2 text-[13px]">
              <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-[var(--text-4)]" style={{ fontFamily: MONO }}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--text-1)]" title={name}>
                {name}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--text-2)]" style={{ fontFamily: MONO }}>
                {formatMetric(p.value, p.unit, p.money)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CardTile({ title, parts, size = "md" }: { title: string; parts: PeriodMetric[]; size?: "md" | "lg" }) {
  if (parts[0]?.card?.list) return <ListTile title={title} parts={parts} />;
  const [main, ...rest] = parts;
  const lg = size === "lg";
  const text = formatMetric(main.value, main.unit, main.money);
  const breakdown = rest
    .map((p) => `${formatMetric(p.value, p.unit, p.money)} ${(p.card?.part ?? p.label).toLowerCase()}`)
    .join(" · ");
  return (
    <div className={`flex min-w-0 flex-col rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-0)] ${lg ? "px-4 py-4" : "px-3.5 py-3"}`}>
      <div
        className="truncate tabular-nums text-[var(--text-1)]"
        style={{ fontFamily: SERIF, fontSize: lg ? 44 : 30, lineHeight: 1, letterSpacing: "-0.02em" }}
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
        {/* A whole month carries a change; the running month never does. */}
        {main.previous !== undefined ? (
          <span className="shrink-0 text-xs text-[var(--text-3)]">
            <TrendBadge delta={metricTrend(main.value, main.previous ?? null)} goodWhen="neutral" />
          </span>
        ) : null}
      </div>
      {breakdown ? (
        <p
          className="mt-auto truncate border-t border-[var(--border-1)] pt-2 text-[11px] tabular-nums text-[var(--text-3)]"
          style={{ fontFamily: MONO, marginTop: 12 }}
          title={breakdown}
        >
          {breakdown}
        </p>
      ) : null}
    </div>
  );
}

function Tile({ tile, size }: { tile: MetricTileGroup<PeriodMetric>; size?: "md" | "lg" }) {
  return tile.kind === "single" ? (
    <MetricTile metric={tile.metric} size={size} />
  ) : (
    <CardTile title={tile.title} parts={tile.parts} size={size} />
  );
}

const tileKey = (t: MetricTileGroup<PeriodMetric>) => (t.kind === "single" ? t.metric.key : `card:${t.id}`);

/** The platform's pick-one control (DESIGN.md — Care views, wiki doc tabs). Scrolls on a phone. */
function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; title?: string }[];
}) {
  return (
    <div className="flex min-w-0 max-w-full items-center gap-2">
      <span className="shrink-0 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
        {label}
      </span>
      <div className="min-w-0 overflow-x-auto">
        <div
          role="tablist"
          aria-label={label}
          className="inline-flex min-w-max gap-0.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5"
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="tab"
                aria-selected={on}
                title={o.title}
                onClick={() => onChange(o.value)}
                className={[
                  "whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[11px] uppercase tracking-[0.05em] transition-colors",
                  on
                    ? "bg-[var(--surface-0)] font-semibold text-[var(--brand-700)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "text-[var(--text-3)] hover:text-[var(--text-1)]",
                ].join(" ")}
                style={{ fontFamily: MONO }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const GRID = "grid gap-3 sm:grid-cols-2 xl:grid-cols-4";

export function WikiMetricsSectionView({
  metrics,
  slug,
  editable = false,
}: {
  metrics: WikiMetricsSection;
  slug?: string;
  editable?: boolean;
}) {
  // ── Time frame ── The running month first (it is what someone opened the page to see),
  // then each whole month already stored. Choosing one needs no fetch.
  const periods = useMemo(() => metricPeriodOptions(metrics), [metrics]);
  const [picked, setPicked] = useState<string | null>(null);
  const period = picked && periods.some((p) => p.value === picked) ? picked : (periods[0]?.value ?? null);
  const soFar = period === SO_FAR;
  const rows = useMemo(() => (period ? metricsAt(metrics, period) : []), [metrics, period]);

  // ── Filter ── "All" leads with the headline row and lists the rest underneath; a group
  // shows every figure in that group, and nothing else.
  const groupNames = useMemo(() => [...new Set(rows.map((m) => m.group ?? ""))].filter(Boolean), [rows]);
  const [pickedGroup, setPickedGroup] = useState("ALL");
  const group = pickedGroup === "ALL" || groupNames.includes(pickedGroup) ? pickedGroup : "ALL";

  const tiles = useMemo(() => tilesFor(rows), [rows]);
  const featured = metrics.metrics.filter((m) => m.featured).map((m) => m.key);
  const headIdx = useMemo(() => (group === "ALL" ? headlineTileIndexes(tiles, featured) : []), [tiles, featured, group]);
  const headline = headIdx.map((i) => tiles[i]);
  const rest = tiles.filter((t, i) => !headIdx.includes(i) && (group === "ALL" || tileGroup(t) === group));

  const periodOption = periods.find((p) => p.value === period);
  const whenLabel = soFar && metrics.monthToDate ? asOf(metrics.monthToDate.capturedAt) : (periodOption?.label ?? "");
  const prevPeriod = !soFar && period ? metrics.historyPeriods[metrics.historyPeriods.indexOf(period) - 1] : undefined;
  const footnote = soFar
    ? `${metrics.monthToDate ? periodLabel(metrics.monthToDate.period).split(" ")[0] : "This month"} is still running, so these are not compared with whole months. The final figures replace them once it ends.`
    : `${prevPeriod ? `Changes are against ${periodLabel(prevPeriod)}.` : "Nothing earlier to compare with yet."} Lines show up to six months to ${periodOption?.label ?? "this month"}.`;

  let n = 0;
  const num = () => String(++n).padStart(2, "0");

  const empty = !metrics.source
    ? "Product metrics aren’t connected for this client yet."
    : rows.length === 0
      ? metrics.metrics.length > 0 || metrics.monthToDate
        ? "Every metric is hidden. Show one below to put it here."
        : "No figures have been fetched yet."
      : null;

  return (
    <div className="space-y-4">
      {!empty ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Segmented
            label="Period"
            value={period ?? ""}
            onChange={setPicked}
            options={periods.map((p) => ({ value: p.value, label: p.short, title: p.label }))}
          />
          {groupNames.length > 1 ? (
            <Segmented
              label="Show"
              value={group}
              onChange={setPickedGroup}
              options={[{ value: "ALL", label: "All" }, ...groupNames.map((g) => ({ value: g, label: g }))]}
            />
          ) : null}
        </div>
      ) : null}

      {empty ? (
        <section className="widget-card">
          <Header n={num()} label="METRICS" />
          {/* Never an empty chart — that would read as "nothing happened". */}
          <p className="p-8 text-center text-sm text-[var(--text-4)]">{empty}</p>
        </section>
      ) : (
        <>
          {headline.length > 0 ? (
            <section className="widget-card">
              <Header n={num()} label="HEADLINE" status={whenLabel.toUpperCase()} />
              <div className="p-5">
                <div className={GRID}>
                  {headline.map((t) => (
                    <Tile key={tileKey(t)} tile={t} size="lg" />
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section className="widget-card">
              <Header
                n={num()}
                label={group === "ALL" ? "ALL METRICS" : group.toUpperCase()}
                status={headline.length > 0 ? undefined : whenLabel.toUpperCase()}
              />
              <div className="space-y-5 p-5">
                {groupBy(rest.map((t) => ({ t, group: tileGroup(t) || null }))).map(([g, ts]) => (
                  <div key={g || "_"}>
                    {g && group === "ALL" ? <GroupLabel>{g}</GroupLabel> : null}
                    <div className={GRID}>
                      {ts.map(({ t }) => (
                        <Tile key={tileKey(t)} tile={t} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <p className="px-1 text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
            {footnote}
          </p>
        </>
      )}

      {editable && slug ? <MetricsSettings n={num()} metrics={metrics} slug={slug} /> : null}
    </div>
  );
}

function tileGroup(t: MetricTileGroup<PeriodMetric>): string {
  return (t.kind === "single" ? t.metric.group : t.parts[0]?.group) ?? "";
}

function MetricsSettings({ n, metrics, slug }: { n: string; metrics: WikiMetricsSection; slug: string }) {
  const refresh = useRefreshWikiMetrics(slug);
  const update = useUpdateWikiMetrics(slug);
  // The newest capture of anything on the page: the running month when there is one.
  const lastRefreshed =
    [metrics.capturedAt, metrics.monthToDate?.capturedAt ?? null]
      .filter((x): x is string => Boolean(x))
      .sort()
      .at(-1) ?? null;

  // Opening the section also refreshes anything behind (the running month is kept fresh in
  // the background too — refreshRunningMonths, from the jobs worker). Once per mount.
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
  type Row = { key: string; label: string; value: number; unit: string | null; money?: boolean; hidden: boolean; featured: boolean; canFeature: boolean; isList?: boolean };
  const all: (Row & { card?: { id: string; title: string; list?: boolean } | null })[] = [
    ...metrics.metrics.map((m) => ({ ...m, canFeature: true })),
    ...runningOnly.map((m) => ({ ...m, featured: false, canFeature: false })),
  ];
  // A list is ONE row here — hidden or shown as a whole, never featured — however many items
  // it has. Its value is the number of items.
  const rows: Row[] = [];
  const listRows = new Map<string, Row>();
  for (const m of all) {
    if (m.card?.list) {
      const held = listRows.get(m.card.id);
      if (held) {
        held.value += 1;
        continue;
      }
      const row: Row = {
        key: listHideKey(m.card.id),
        label: m.card.title,
        value: 1,
        unit: null,
        hidden: m.hidden,
        featured: false,
        canFeature: false,
        isList: true,
      };
      listRows.set(m.card.id, row);
      rows.push(row);
    } else rows.push(m);
  }
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
            {lastRefreshed ? (
              // The newest fetch of anything shown — not the headline month's. That said "Last
              // fetched 16 Oct" while October so far had been fetched that day.
              <p className="mt-0.5 text-[12px] text-[var(--text-4)]" title={new Date(lastRefreshed).toLocaleString("en-GB")}>
                Last refreshed {whenRefreshed(lastRefreshed)}
                {metrics.monthToDate ? " · updates itself every 15 min" : ""}
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
              {refresh.isPending ? "Refreshing…" : "Refresh now"}
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
          /* Folded by default: a dozen-plus rows of star/eye toggles is set once and rarely
             touched, and open it pushed everything else in Settings off the screen. The
             summary still says how many are shown, hidden and starred. */
          <details className="group rounded-[8px] border border-[var(--border-1)]">
            <summary
              className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[11px] uppercase tracking-[0.1em] text-[var(--text-3)] hover:text-[var(--text-1)] [&::-webkit-details-marker]:hidden"
              style={{ fontFamily: MONO }}
            >
              <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
              <span className="min-w-0 flex-1">What the client sees</span>
              <span className="shrink-0 text-[var(--text-4)]">
                {rows.length - rows.filter((m) => m.hidden).length} shown
                {rows.some((m) => m.hidden) ? ` · ${rows.filter((m) => m.hidden).length} hidden` : ""}
                {` · ${rows.filter((m) => m.featured).length} ★`}
              </span>
            </summary>
            <p
              className="border-t border-[var(--border-1)] px-3 py-2 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]"
              style={{ fontFamily: MONO }}
            >
              ★ leads the headline row and the dashboard card (up to {FEATURED_MAX})
            </p>
            <ul className="divide-y divide-[var(--border-1)] border-t border-[var(--border-1)]">
              {rows.map((m) => (
                <li key={m.key} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[13px] ${m.hidden ? "text-[var(--text-4)] line-through" : "text-[var(--text-1)]"}`} title={m.label}>
                      {m.label}
                    </p>
                    <p className="truncate text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }} title={m.key}>
                      {m.isList ? `List · ${m.value} ${m.value === 1 ? "item" : "items"}` : `${formatMetric(m.value, m.unit, m.money)} · ${m.key}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFeatured(m.key)}
                    disabled={m.hidden || !m.canFeature || update.isPending}
                    className="rounded-[6px] p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-1)] disabled:opacity-40"
                    aria-label={m.featured ? `Stop featuring ${m.label}` : `Feature ${m.label} on the dashboard`}
                    title={
                      m.isList
                        ? "A list can't lead the dashboard"
                        : !m.canFeature
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
          </details>
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
