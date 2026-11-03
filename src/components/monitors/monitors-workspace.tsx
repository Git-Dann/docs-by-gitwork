"use client";

/**
 * The Monitors page (/app/monitors) — every client's uptime monitors as one card per client.
 *
 * Monitors are still set up and run from each client's wiki (`monitors-section.tsx`); this
 * page reads them all. The status rules live in `src/lib/monitor-board.ts` and the colours,
 * labels and dot are shared with the wiki's all-clients board, so the two never disagree.
 *
 * Seeing a client here does not open it: a card links to the client's wiki only when this
 * person can already open that client (`openableClientIds`), and incidents are read-only for
 * clients they can't open — acknowledging one goes through that client's own routes.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowPathIcon, ArrowTopRightOnSquareIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useMonitorsPage } from "@/hooks/use-wiki";
import {
  monitorState,
  orderBoard,
  summariseBoard,
  worstState,
  type BoardClient,
  type BoardMonitor,
  type BoardMonitorState,
} from "@/lib/monitor-board";
import { AGENCY_CLIENT_SLUG } from "@/lib/agency-client";
import { Dot, LEVEL, STATE, relTime, shortTarget } from "@/components/clients/wiki/monitor-board";
import { IncidentCard } from "@/components/clients/wiki/monitor-incidents";
import { FadeIn } from "@/components/ui/motion/fade-in";
import { SkeletonCards } from "@/components/ui/motion/skeleton";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
const SERIF = "var(--font-display), 'DM Serif Display', Georgia, serif";

type Filter = "all" | "attention";

function Header({ number, label, children }: { number: string; label: string; children?: React.ReactNode }) {
  return (
    <div className="widget-header flex items-center justify-between gap-3">
      <span className="widget-header__label shrink-0" style={{ fontFamily: MONO }}>
        <span className="widget-header__label--number">{number}</span>
        {` // ${label}`}
      </span>
      {children}
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone: BoardMonitorState | null }) {
  const meta = tone ? STATE[tone] : null;
  return (
    <div
      className="rounded-[10px] border px-4 py-3"
      style={{
        borderColor: meta ? meta.color : "var(--border-2)",
        background: meta ? meta.tint : "var(--surface-0)",
      }}
    >
      <p className="text-[28px] leading-none" style={{ fontFamily: SERIF, color: meta ? meta.color : "var(--text-1)" }}>
        {value}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
        {label}
      </p>
    </div>
  );
}

function MonitorRow({ m }: { m: BoardMonitor }) {
  const state = monitorState(m);
  const meta = STATE[state];
  const bad = state === "down" || state === "flaky";
  const why = bad ? (m.statusCode ? `HTTP ${m.statusCode}` : (m.error ?? "No response")) : null;
  return (
    <li className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0" data-monitor-row>
      <span className="mt-[6px] flex">
        <Dot state={state} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--text-1)]" title={m.name}>
          {m.name}
        </p>
        <p className="truncate text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }} title={m.target}>
          {shortTarget(m.target)}
        </p>
        {bad ? (
          <p className="mt-1 break-words text-[12px]" style={{ color: meta.color }}>
            {state === "down" ? `Down${m.downSince ? ` since ${relTime(m.downSince)}` : ""} · ${why}` : `Failing on and off · ${why}`}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right text-[11px] leading-[18px]" style={{ fontFamily: MONO }}>
        {state === "up" || state === "slow" ? (
          <div style={{ color: meta.color }}>{m.latencyMs != null ? `${m.latencyMs}ms` : "—"}</div>
        ) : (
          <div className="font-semibold uppercase tracking-[0.06em]" style={{ color: meta.color }}>
            {meta.label}
          </div>
        )}
        <div className="text-[var(--text-4)]">{m.uptime24h != null ? `${m.uptime24h}%` : "—"}</div>
      </div>
    </li>
  );
}

/** The header label's text colour. The -500 tokens sit at ~3:1 on their own -50 tint, too
 *  faint for 11px text; the -700 shades clear AA and are remapped for dark mode in globals.css. */
const LABEL_TEXT: Record<BoardMonitorState, string> = {
  up: "text-emerald-700",
  slow: "text-amber-700",
  flaky: "text-amber-700",
  down: "text-red-700",
  stale: "text-[var(--text-3)]",
  pending: "text-[var(--text-3)]",
};

function ClientCard({ client, canOpen }: { client: BoardClient; canOpen: boolean }) {
  const states = client.monitors.map(monitorState);
  const worst = worstState(states) ?? "pending";
  const up = states.filter((s) => s === "up").length;
  const meta = STATE[worst];
  const healthy = worst === "up";
  const isAgency = client.slug === AGENCY_CLIENT_SLUG;
  const lastCheck =
    client.monitors
      .map((m) => m.checkedAt)
      .filter((x): x is string => Boolean(x))
      .sort()
      .at(-1) ?? null;
  const href = `/app/portal/${client.slug}/wiki#monitors`;

  return (
    <li
      className="flex min-w-0 flex-col overflow-hidden rounded-[10px] border bg-[var(--surface-0)]"
      style={{ borderColor: healthy ? "var(--border-2)" : meta.color }}
      data-client-card={client.slug}
    >
      <div
        // Fixed height, so every card's header lines up across the grid (Gitwork's
        // "Our services" tag sits on the name's line rather than adding a second one).
        className="flex h-12 shrink-0 items-center gap-2.5 border-b px-4"
        // Every header carries its state's tint — green when all is operational — so the
        // grid reads at a glance; a card in trouble also gets a coloured border.
        style={{ borderColor: "var(--border-1)", background: meta.tint }}
      >
        <Dot state={worst} still />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <p className="truncate text-[15px] font-medium text-[var(--text-1)]" title={client.name}>
            {client.name}
          </p>
          {isAgency ? (
            <span
              className="hidden shrink-0 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)] sm:inline"
              style={{ fontFamily: MONO }}
            >
              Our services
            </span>
          ) : null}
        </div>
        <span
          className={`shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] ${LABEL_TEXT[worst]}`}
          style={{ fontFamily: MONO }}
        >
          {healthy ? `Operational · ${up}/${states.length}` : meta.label}
        </span>
      </div>
      <ul className="divide-y divide-[var(--border-1)] px-4 py-3">
        {client.monitors.map((m) => (
          <MonitorRow key={m.id} m={m} />
        ))}
      </ul>
      <div
        className="mt-auto flex items-center justify-between gap-3 border-t px-4 py-2.5 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]"
        style={{ borderColor: "var(--border-1)", fontFamily: MONO }}
      >
        <span className="truncate" title={lastCheck ? new Date(lastCheck).toLocaleString("en-GB") : undefined}>
          {lastCheck ? `Checked ${relTime(lastCheck)}` : "Not checked yet"}
        </span>
        {canOpen ? (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-[var(--text-3)] hover:text-[var(--brand-700)]"
            title={`Manage ${client.name}'s monitors in its wiki`}
          >
            Manage
            <ArrowTopRightOnSquareIcon className="h-3 w-3" aria-hidden />
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export function MonitorsWorkspace() {
  const { data, isLoading, isError, refetch, isFetching } = useMonitorsPage();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const clients = useMemo(() => data?.clients ?? [], [data]);
  const summary = summariseBoard(clients);
  const { monitored, unmonitored } = useMemo(() => orderBoard(clients), [clients]);
  const openable = data?.openableClientIds ?? null;
  const canOpen = (clientId: string) => openable === null || openable.includes(clientId);
  const lead = STATE[LEVEL[summary.level]];
  const lastCheck =
    clients
      .flatMap((c) => c.monitors.map((m) => m.checkedAt))
      .filter((x): x is string => Boolean(x))
      .sort()
      .at(-1) ?? null;

  const needsAttention = monitored.filter((c) => worstState(c.monitors.map(monitorState)) !== "up");
  const q = query.trim().toLowerCase();
  const shown = (filter === "attention" ? needsAttention : monitored).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.monitors.some((m) => m.name.toLowerCase().includes(q) || m.target.toLowerCase().includes(q)),
  );
  const incidents = data?.incidents ?? [];

  if (isError) {
    return (
      <section className="widget-card">
        <Header number="01" label="STATUS" />
        <p className="m-5 rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-[13px] text-[var(--danger-500)]">
          Couldn&apos;t load the monitors. The page tries again every minute.
        </p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading every client's monitors" className="space-y-4">
        <div className="h-[148px] animate-pulse rounded-[12px] bg-[var(--surface-1)]" aria-hidden />
        <SkeletonCards count={6} className="md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3" />
      </div>
    );
  }

  let n = 1;
  const num = () => String(n++).padStart(2, "0");

  return (
    <FadeIn className="space-y-4">
      <section className="widget-card">
        <Header number={num()} label="STATUS">
          <div className="flex min-w-0 items-center gap-3">
            {lastCheck ? (
              <span
                className="hidden truncate text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)] sm:inline"
                style={{ fontFamily: MONO }}
                title={new Date(lastCheck).toLocaleString("en-GB")}
              >
                Last check {relTime(lastCheck)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-[var(--text-3)] hover:text-[var(--text-1)] disabled:opacity-60"
              style={{ fontFamily: MONO }}
              title="Updates itself every minute"
            >
              <ArrowPathIcon className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} aria-hidden />
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </Header>
        <div className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-4" role="status">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{ background: lead.tint, boxShadow: `inset 0 0 0 2px ${lead.color}` }}
            >
              <Dot state={LEVEL[summary.level]} />
            </span>
            <div className="min-w-0">
              <p className="text-[22px] leading-[1.15] sm:text-[26px]" style={{ fontFamily: SERIF, color: lead.color }}>
                {summary.headline}
              </p>
              <p className="mt-0.5 text-[13px] text-[var(--text-3)]">{summary.sub}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Services up" value={`${summary.up}/${summary.total}`} tone={null} />
            <StatTile label="Down" value={String(summary.down)} tone={summary.down ? "down" : null} />
            <StatTile label="Slow or unstable" value={String(summary.degraded)} tone={summary.degraded ? "flaky" : null} />
            <StatTile label="Not checking" value={String(summary.unchecked)} tone={summary.unchecked ? "stale" : null} />
          </div>
        </div>
      </section>

      {incidents.length > 0 ? (
        <section className="widget-card">
          <Header number={num()} label={`OPEN INCIDENTS · ${incidents.length}`} />
          <ul className="space-y-2 p-5 sm:p-6">
            {incidents.map((i) => (
              <IncidentCard
                key={i.id}
                incident={i}
                slug={i.clientSlug}
                clientName={i.clientName}
                audience={canOpen(clients.find((c) => c.slug === i.clientSlug)?.clientId ?? "") ? "team" : "client"}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="widget-card">
        <Header number={num()} label={`CLIENTS · ${monitored.length}`} />
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-1)] px-5 py-3 sm:px-6">
          <div
            role="tablist"
            aria-label="Which clients to show"
            className="inline-flex rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] p-0.5"
          >
            {(
              [
                ["all", `All · ${monitored.length}`],
                ["attention", `Needs attention · ${needsAttention.length}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={`rounded-[4px] px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] ${
                  filter === id
                    ? "bg-[var(--surface-0)] text-[var(--brand-700)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                    : "text-[var(--text-3)] hover:text-[var(--text-1)]"
                }`}
                style={{ fontFamily: MONO }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="relative ml-auto flex min-w-[180px] flex-1 items-center sm:max-w-[280px]">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 h-4 w-4 text-[var(--text-4)]" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a client or service"
              aria-label="Find a client or service"
              className="app-input h-8 w-full py-0 pl-8 text-base sm:text-[13px]"
            />
          </label>
        </div>
        <div className="p-5 sm:p-6">
          {monitored.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-[13px] text-[var(--text-3)]">
              No client has a monitor yet. Add one from a client&apos;s wiki, under Monitors.
            </p>
          ) : shown.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-[13px] text-[var(--text-3)]">
              {filter === "attention" && !q ? "Nothing needs attention. Every service is up." : "No client or service matches that."}
            </p>
          ) : (
            <ul className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((c) => (
                <ClientCard key={c.clientId} client={c} canOpen={canOpen(c.clientId)} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {unmonitored.length > 0 ? (
        <section className="widget-card">
          <Header number={num()} label={`NOT MONITORED · ${unmonitored.length}`} />
          <ul className="flex flex-wrap gap-2 p-5 sm:p-6">
            {unmonitored.map((c) => (
              <li key={c.clientId}>
                {canOpen(c.clientId) ? (
                  <Link
                    href={`/app/portal/${c.slug}/wiki#monitors`}
                    className="inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-[12px] text-[var(--text-2)] hover:border-[var(--brand-500)] hover:text-[var(--brand-700)]"
                    title={`Add a monitor for ${c.name}`}
                  >
                    {c.name}
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-[12px] text-[var(--text-3)]">
                    {c.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="px-1 text-[12px] text-[var(--text-4)]">
        Monitors are set up in each client&apos;s wiki. When a service fails two checks in a row, the ops
        channel on Slack gets an alert, and another when it&apos;s back.
      </p>
    </FadeIn>
  );
}
