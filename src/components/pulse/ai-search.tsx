"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  CheckIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { AreaSparkline, MONO, SERIF, StatTile, TrendBadge, WidgetCard } from "@/components/analytics/analytics-widgets";
import { Button } from "@/components/ui/button";
import { Pager } from "@/components/ui/pager";
import { SortHeader } from "@/components/ui/sort-header";
import { AiAnswersCard } from "@/components/pulse/ai-answers";
import { useAiSearchReport, useRefreshAiSearch, useSaveAiSearchConfig } from "@/hooks/use-pulse";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatRelative } from "@/lib/format";
import {
  AI_SEARCH_RANGES,
  DEFAULT_AI_SEARCH_RANGE,
  changeBetween,
  filterQueries,
  formatPeriod,
  freshnessOf,
  lastKnown,
  type AiSearchRange,
  type AiSearchReport,
  type AiVisitsReport,
  type Freshness,
  type GoogleReport,
  type QueryBand,
  type QueryComparison,
  type QuerySortKey,
  type SourceState,
  type SourceSync,
} from "@/lib/ai-search";

/**
 * Pulse → AI search: how Gitwork shows up on Google and through AI assistants. Shared by the
 * app page and the demo. Internal-only content; the CALLER wraps it (`InternalOnly`).
 *
 * Every card says when its figures were read and the last day they cover. A source whose
 * latest sync failed keeps showing its last good figures, marked as such, with the reason;
 * a source never read shows why rather than a zero.
 */
export function AiSearchView() {
  const [range, setRange] = useState<AiSearchRange>(DEFAULT_AI_SEARCH_RANGE);
  const query = useAiSearchReport(range);
  const refresh = useRefreshAiSearch();
  const report = query.data;
  // Re-render each minute so "synced 4m ago" stays true while the page is open.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <AiAnswersCard number="01" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeControl value={range} onChange={setRange} />
        <div className="flex flex-wrap items-center gap-3">
          {report ? <LastSync report={report} /> : null}
          <Button
            size="sm"
            variant="secondary"
            loading={refresh.isPending || query.isFetching}
            leadingIcon={<ArrowPathIcon className="h-4 w-4" />}
            onClick={() => refresh.mutate(range)}
          >
            {refresh.isPending ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </div>
      {refresh.isError ? (
        <p role="alert" className="text-sm text-[var(--danger-500)]">
          Sync didn&apos;t run: {(refresh.error as Error).message}
        </p>
      ) : null}

      {query.isError ? (
        <WidgetCard number="02" label="Google and AI visits">
          <p className="text-sm text-[var(--danger-500)]">{(query.error as Error).message}</p>
        </WidgetCard>
      ) : !report ? (
        <WidgetCard number="02" label="At a glance">
          <p className="text-sm text-[var(--text-3)]">Reading Search Console and Google Analytics…</p>
        </WidgetCard>
      ) : (
        <Report report={report} />
      )}
    </div>
  );
}

function exact(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

function dayLabel(day: string) {
  return formatPeriod({ start: day, end: day }).replace(/^\d+–/, "");
}

/** When the page last asked Google, and whether every source answered. */
function LastSync({ report }: { report: AiSearchReport }) {
  const now = new Date();
  const states = [freshnessOf(report.google, now), freshnessOf(report.aiVisits, now)];
  const problem = states.some((f) => f.kind === "failing" || f.kind === "stale");
  return (
    <span
      className={cn(
        "font-mono text-[11px] uppercase tracking-[0.05em]",
        problem ? "text-[var(--warning-500)]" : "text-[var(--text-4)]",
      )}
      title={`Last sync ${exact(report.attemptedAt)}`}
    >
      Last sync {formatRelative(report.attemptedAt)}
      {problem ? " · not all sources up to date" : ""}
    </span>
  );
}

/** The one-line freshness readout in a card's header. */
function syncStatus(f: Freshness) {
  if (f.kind === "none") return undefined;
  const through = `Data to ${dayLabel(f.dataThrough)}`;
  if (f.kind === "fresh") {
    return <span title={`Synced ${exact(f.syncedAt)}`}>{through} · synced {formatRelative(f.syncedAt)}</span>;
  }
  return (
    <span className="text-[var(--warning-500)]" title={`Last good sync ${exact(f.syncedAt)}`}>
      {through} · out of date
    </span>
  );
}

/** Said above a source's figures when they aren't from the latest sync, or are old. */
function FreshnessNote({ name, f }: { name: string; f: Freshness }) {
  if (f.kind === "fresh" || f.kind === "none") return null;
  const text =
    f.kind === "failing"
      ? `${name} couldn't be synced ${formatRelative(f.attemptedAt)}: ${f.message} These are the last good figures, synced ${exact(f.syncedAt)}.`
      : `${name} was last synced ${exact(f.syncedAt)}. Press Sync now for current figures.`;
  return (
    <p className="flex items-start gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--warning-50)] px-3 py-2 text-sm text-[var(--text-2)]">
      <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning-500)]" />
      <span>{text}</span>
    </p>
  );
}

function Caveats({ items }: { items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1 text-xs text-[var(--text-3)]">
      {items.map((c) => (
        <li key={c}>{c}</li>
      ))}
    </ul>
  );
}

function RangeControl({ value, onChange }: { value: AiSearchRange; onChange: (r: AiSearchRange) => void }) {
  return (
    <div role="group" aria-label="Range" className="inline-flex gap-0.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
      {AI_SEARCH_RANGES.map((r) => {
        const on = r === value;
        return (
          <button
            key={r}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(r)}
            className={cn(
              "whitespace-nowrap rounded-[6px] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em] transition-colors",
              on
                ? "bg-[var(--surface-0)] font-semibold text-[var(--brand-700)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "text-[var(--text-3)] hover:text-[var(--text-1)]",
            )}
          >
            Last {r} days
          </button>
        );
      })}
    </div>
  );
}

function Report({ report }: { report: AiSearchReport }) {
  const now = new Date();
  const google = lastKnown(report.google);
  const visits = lastKnown(report.aiVisits);
  const gf = freshnessOf(report.google, now);
  const vf = freshnessOf(report.aiVisits, now);
  return (
    <>
      <WidgetCard
        number="02"
        label="At a glance"
        status={google || visits ? "vs the period before" : undefined}
        hint="Google figures are average positions per search, from Search Console. AI visits are sessions GA4 recorded from an AI assistant."
      >
        <div className="space-y-3">
          <FreshnessNote name="Search Console" f={gf} />
          <FreshnessNote name="Google Analytics" f={vf} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <GoogleTile state={report.google} label="Searches we appear in" pick={(s) => s.queries} />
            <GoogleTile state={report.google} label="Google top 10" pick={(s) => s.top10} ofTotal />
            <GoogleTile state={report.google} label="Google top 3" pick={(s) => s.top3} ofTotal />
            <VisitsTile state={report.aiVisits} />
          </div>
          <PeriodLine google={google} visits={visits} />
        </div>
      </WidgetCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <WidgetCard number="03" label="AI assistants" status={syncStatus(vf)}>
          {visits ? (
            <div className="space-y-3">
              <AssistantsTable data={visits.data} />
              <Caveats
                items={[
                  ...visits.caveats,
                  "Counts only visits where the assistant passed itself on as the source. Some AI clicks arrive with no referrer and GA4 records them as direct.",
                ]}
              />
            </div>
          ) : (
            <SourceMessage state={report.aiVisits} />
          )}
        </WidgetCard>
        <WidgetCard number="04" label="Pages AI sends people to" status={syncStatus(vf)}>
          {visits ? <PagesTable data={visits.data} /> : <SourceMessage state={report.aiVisits} />}
        </WidgetCard>
      </div>

      <WidgetCard number="05" label="Google searches" status={syncStatus(gf)}>
        {google ? (
          <div className="space-y-3">
            <QueriesTable data={google.data} />
            <Caveats items={google.caveats} />
          </div>
        ) : (
          <SourceMessage state={report.google} />
        )}
      </WidgetCard>

      <SetupCard number="06" report={report} />
    </>
  );
}

/** Which dates each half of the page covers, so two different lags are never mistaken for one. */
function PeriodLine({ google, visits }: { google: SourceSync<GoogleReport> | null; visits: SourceSync<AiVisitsReport> | null }) {
  if (!google && !visits) return null;
  return (
    <p className="text-xs text-[var(--text-3)]">
      {google ? (
        <>
          Google: {formatPeriod(google.data.period)}, compared with {formatPeriod(google.data.previousPeriod)}. Ends on the last
          day Search Console has finished.{" "}
        </>
      ) : null}
      {visits ? (
        <>
          AI visits: {formatPeriod(visits.data.period)}, compared with {formatPeriod(visits.data.previousPeriod)}. Ends two days
          back, once GA4 has finished processing.
        </>
      ) : null}
    </p>
  );
}

// ─── Tiles ────────────────────────────────────────────────────────────────────

function figure(n: number) {
  return n.toLocaleString("en-GB");
}

function OfTotal({ n, of }: { n: number; of: number }) {
  return (
    <>
      {figure(n)}
      <span style={{ fontSize: 18 }} className="text-[var(--text-4)]">{` of ${figure(of)}`}</span>
    </>
  );
}

function Unread({ label, state }: { label: string; state: { status: string } }) {
  return (
    <StatTile
      figure={<span className="text-[var(--text-4)]">—</span>}
      label={label}
      sub={state.status === "not_configured" ? "Not set up yet" : "Couldn't read this"}
    />
  );
}

function GoogleTile({
  state,
  label,
  pick,
  ofTotal = false,
}: {
  state: SourceState<GoogleReport>;
  label: string;
  pick: (s: GoogleReport["current"]) => number;
  ofTotal?: boolean;
}) {
  const sync = lastKnown(state);
  if (!sync) return <Unread label={label} state={state} />;
  const { current, previous, truncated } = sync.data;
  const now = pick(current);
  const before = pick(previous);
  return (
    <StatTile
      figure={
        <span className={cn("inline-flex flex-wrap items-baseline gap-x-2", state.status !== "ok" && "opacity-60")}>
          <span>{ofTotal ? <OfTotal n={now} of={current.queries} /> : figure(now)}{truncated ? "+" : ""}</span>
          <TrendBadge delta={changeBetween(now, before)} />
        </span>
      }
      label={label}
      sub={<>Previous {ofTotal ? `${figure(before)} of ${figure(previous.queries)}` : figure(before)}</>}
    />
  );
}

function VisitsTile({ state }: { state: SourceState<AiVisitsReport> }) {
  const label = "Visits from AI assistants";
  const sync = lastKnown(state);
  if (!sync) return <Unread label={label} state={state} />;
  const { current, previousTotal, period } = sync.data;
  return (
    <div className={cn("rounded-[8px] border border-[var(--border-2)] px-3.5 py-3", state.status !== "ok" && "opacity-60")}>
      <div className="flex items-baseline gap-2">
        <span style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1, letterSpacing: "-0.02em" }} className="tabular-nums text-[var(--text-1)]">
          {figure(current.total)}
        </span>
        <TrendBadge delta={changeBetween(current.total, previousTotal)} />
      </div>
      <div className="mt-1.5" style={{ fontFamily: MONO, fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-4)" }}>
        {label}
      </div>
      <div className="mt-2 h-10" title={`Visits per day, ${formatPeriod(period)}`}>
        <AreaSparkline points={current.series.map((d) => d.sessions)} height={40} />
      </div>
      <div className="mt-0.5 text-xs text-[var(--text-3)]">Previous {figure(previousTotal)}</div>
    </div>
  );
}

function SourceMessage({ state }: { state: { status: string; message?: string } }) {
  const tone = state.status === "not_configured" ? "text-[var(--text-3)]" : "text-[var(--warning-500)]";
  return <p className={cn("text-sm", tone)}>{"message" in state ? state.message : null}</p>;
}

// ─── Tables ───────────────────────────────────────────────────────────────────

const th = "px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-4)]";
const td = "px-3 py-2 align-middle border-t border-[var(--border-2)] text-sm";

function AssistantsTable({ data }: { data: AiVisitsReport }) {
  const rows = data.current.byAssistant;
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-3)]">No visits from an AI assistant in this period.</p>;
  }
  const total = data.current.total;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[360px]">
        <thead>
          <tr>
            <th className={th}>Assistant</th>
            <th className={cn(th, "text-right")}>Visits</th>
            <th className={cn(th, "text-right")}>Share</th>
            <th className={cn(th, "text-right")}>Previous</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={cn(td, "font-medium text-[var(--text-1)]")}>{r.label}</td>
              <td className={cn(td, "text-right tabular-nums")}>{figure(r.sessions)}</td>
              <td className={cn(td, "text-right tabular-nums text-[var(--text-3)]")}>
                {total > 0 ? `${Math.round((r.sessions / total) * 100)}%` : "—"}
              </td>
              <td className={cn(td, "text-right tabular-nums text-[var(--text-3)]")}>
                {figure(data.byAssistantPrevious[r.id] ?? 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PagesTable({ data }: { data: AiVisitsReport }) {
  const [page, setPage] = useState(0);
  const size = 10;
  if (data.pages.length === 0) {
    return <p className="text-sm text-[var(--text-3)]">No AI assistant sent anyone to a page in this period.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] table-fixed">
          <thead>
            <tr>
              <th className={th}>Page</th>
              <th className={cn(th, "w-[90px] text-right")}>Visits</th>
            </tr>
          </thead>
          <tbody>
            {data.pages.slice(page * size, page * size + size).map((p) => (
              <tr key={p.path}>
                <td className={cn(td, "truncate font-mono text-[12px] text-[var(--text-2)]")} title={p.path}>{p.path}</td>
                <td className={cn(td, "text-right tabular-nums")}>{figure(p.sessions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageSize={size} total={data.pages.length} onPage={setPage} label="Pages" />
    </div>
  );
}

function PositionChange({ row }: { row: QueryComparison }) {
  if (row.previousPosition == null) {
    return <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-[var(--brand-700)]">New</span>;
  }
  const moved = row.previousPosition - row.position; // positive = closer to the top
  if (Math.abs(moved) < 0.5) return <span className="text-[var(--text-4)]">—</span>;
  return (
    <span className={cn("tabular-nums font-mono text-[11px] font-semibold", moved > 0 ? "text-[var(--success-500)]" : "text-[var(--danger-500)]")}>
      {moved > 0 ? "▲" : "▼"} {Math.abs(moved).toFixed(1)}
    </span>
  );
}

function QueriesTable({ data }: { data: GoogleReport }) {
  const [band, setBand] = useState<QueryBand>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: QuerySortKey; dir: "asc" | "desc" }>({ key: "impressions", dir: "desc" });
  const [page, setPage] = useState(0);
  const size = 20;
  const rows = useMemo(() => filterQueries(data.queries, { band, search, sort }), [data.queries, band, search, sort]);
  useEffect(() => setPage(0), [band, search, sort]);

  const onSort = (key: QuerySortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "query" || key === "position" ? "asc" : "desc" }));

  const bands: Array<{ id: QueryBand; label: string; n: number }> = [
    { id: "all", label: "All", n: data.current.queries },
    { id: "top10", label: "Top 10", n: data.current.top10 },
    { id: "top3", label: "Top 3", n: data.current.top3 },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Search queries</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-4)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search queries"
            className="app-input w-full pl-9 text-[16px] sm:text-sm"
          />
        </label>
        <div role="group" aria-label="Position" className="inline-flex gap-0.5 rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5">
          {bands.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={band === b.id}
              onClick={() => setBand(b.id)}
              className={cn(
                "whitespace-nowrap rounded-[6px] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em]",
                band === b.id
                  ? "bg-[var(--surface-0)] font-semibold text-[var(--brand-700)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                  : "text-[var(--text-3)] hover:text-[var(--text-1)]",
              )}
            >
              {b.label} <span className="tabular-nums text-[var(--text-4)]">{figure(b.n)}</span>
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-3)]">
          {data.queries.length === 0 ? "Google showed the site for no queries in this period." : "No queries match."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] table-fixed">
            <thead>
              <tr>
                <SortHeader label="Query" k="query" sort={sort} onSort={onSort} className={th} />
                <SortHeader label="Position" k="position" sort={sort} onSort={onSort} align="right" className={cn(th, "w-[90px]")} title="Average position. 1 is the top result." />
                <th className={cn(th, "w-[80px] text-right")} title="Change in average position since the previous period">Change</th>
                <SortHeader label="Clicks" k="clicks" sort={sort} onSort={onSort} align="right" className={cn(th, "w-[80px]")} />
                <SortHeader label="Shown" k="impressions" sort={sort} onSort={onSort} align="right" className={cn(th, "w-[90px]")} title="Impressions: how often Google showed the site for this query" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(page * size, page * size + size).map((r) => (
                <tr key={r.query}>
                  <td className={cn(td, "truncate text-[var(--text-1)]")} title={r.query}>{r.query}</td>
                  <td className={cn(td, "text-right tabular-nums")}>{r.position.toFixed(1)}</td>
                  <td className={cn(td, "text-right")}><PositionChange row={r} /></td>
                  <td className={cn(td, "text-right tabular-nums")}>{figure(r.clicks)}</td>
                  <td className={cn(td, "text-right tabular-nums text-[var(--text-3)]")}>{figure(r.impressions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pageSize={size} total={rows.length} onPage={setPage} label="Queries" />
      {data.queries.length < data.current.queries ? (
        <p className="text-xs text-[var(--text-4)]">
          Showing the {figure(data.queries.length)} queries Google showed the site for most. The counts above include all{" "}
          {figure(data.current.queries)}.
        </p>
      ) : null}
    </div>
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function sourceLine(name: string, state: SourceState<unknown>) {
  const sync = lastKnown(state);
  const ok = state.status === "ok";
  const detail = ok
    ? ` · synced ${formatRelative(state.syncedAt)}, data to ${dayLabel(state.dataThrough)}`
    : ` · ${state.message}${sync ? ` Last good sync ${exact(sync.syncedAt)}.` : ""}`;
  return (
    <li className="flex items-start gap-2 text-sm">
      <span
        aria-hidden
        className={cn(
          "widget-status-dot mt-1.5 shrink-0",
          ok ? "widget-status-dot--success" : state.status === "not_configured" ? "" : "widget-status-dot--warning",
        )}
      />
      <span>
        <span className="font-medium text-[var(--text-1)]">{name}</span>
        <span className="text-[var(--text-3)]">{detail}</span>
      </span>
    </li>
  );
}

function SetupCard({ number, report }: { number: string; report: AiSearchReport }) {
  const { isAdminOrAbove } = usePermissions();
  const save = useSaveAiSearchConfig();
  const [site, setSite] = useState(report.setup.searchConsoleSite ?? "");
  const [property, setProperty] = useState(report.setup.ga4PropertyId ?? "");
  const [copied, setCopied] = useState(false);
  const email = report.setup.serviceAccountEmail;
  const dirty = site !== (report.setup.searchConsoleSite ?? "") || property !== (report.setup.ga4PropertyId ?? "");

  return (
    <WidgetCard number={number} label="Setup">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <ul className="space-y-2">
            {sourceLine("Search Console", report.google as SourceState<unknown>)}
            {sourceLine("Google Analytics", report.aiVisits as SourceState<unknown>)}
          </ul>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--text-2)]">
            <li>
              Foundry reads both with the workspace&apos;s Google service account
              {email ? "" : " (none is set yet: add one in Settings → Integrations)"}.
            </li>
            <li>In Search Console, add it under Settings → Users and permissions, as Restricted.</li>
            <li>In Google Analytics, add it under Admin → Property access management, as Viewer.</li>
            <li>Enter the two properties here.</li>
          </ol>
          {email ? (
            <div className="flex min-w-0 items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-2)]" title={email}>{email}</span>
              <button
                type="button"
                className="app-button app-button-tertiary app-button-xs shrink-0"
                onClick={() => {
                  void navigator.clipboard?.writeText(email).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? <CheckIcon className="h-4 w-4" /> : <DocumentDuplicateIcon className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ searchConsoleSite: site, ga4PropertyId: property });
          }}
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">Search Console property</span>
            <input
              className="app-input w-full text-[16px] sm:text-sm"
              value={site}
              onChange={(e) => setSite(e.target.value)}
              placeholder="sc-domain:gitwork.co.uk"
              disabled={!isAdminOrAbove}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-2)]">GA4 property id</span>
            <input
              className="app-input w-full text-[16px] sm:text-sm"
              value={property}
              onChange={(e) => setProperty(e.target.value)}
              placeholder="412345678"
              inputMode="numeric"
              disabled={!isAdminOrAbove}
            />
          </label>
          {save.isError ? <p className="text-sm text-[var(--danger-500)]">{(save.error as Error).message}</p> : null}
          {isAdminOrAbove ? (
            <Button type="submit" size="sm" variant="primary" disabled={!dirty} loading={save.isPending}>
              Save
            </Button>
          ) : (
            <p className="text-xs text-[var(--text-4)]">An admin can change these.</p>
          )}
        </form>
      </div>
    </WidgetCard>
  );
}
