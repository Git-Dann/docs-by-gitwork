"use client";

/**
 * Every client's uptime monitors on one page — the top of the Gitwork wiki's Monitors section.
 * Gitwork's own services lead, then any client with something wrong, then the rest. Each client
 * links to its own Monitors section, where its monitors are managed.
 *
 * Internal only (the route answers for the agency slug and nothing else). Colours are tokens,
 * so it reads the same on the navy shell as on cream.
 */

import Link from "next/link";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useWikiMonitorBoard } from "@/hooks/use-wiki";
import {
  monitorState,
  orderBoard,
  summariseBoard,
  worstState,
  type BoardClient,
  type BoardLevel,
  type BoardMonitor,
  type BoardMonitorState,
} from "@/lib/monitor-board";
import { AGENCY_CLIENT_SLUG } from "@/lib/agency-client";
import { StatusDot, type StatusDotTone } from "@/components/ui/motion/status-dot";
import { FadeIn } from "@/components/ui/motion/fade-in";
import { SkeletonCards } from "@/components/ui/motion/skeleton";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";
const SERIF = "var(--font-display), 'DM Serif Display', Georgia, serif";

const STATE: Record<BoardMonitorState, { label: string; color: string; tint: string }> = {
  up: { label: "Up", color: "var(--success-500)", tint: "var(--success-50)" },
  slow: { label: "Slow", color: "var(--warning-500)", tint: "var(--warning-50)" },
  flaky: { label: "Unstable", color: "var(--warning-500)", tint: "var(--warning-50)" },
  down: { label: "Down", color: "var(--danger-500)", tint: "var(--danger-50)" },
  stale: { label: "Not checking", color: "var(--text-3)", tint: "var(--surface-1)" },
  pending: { label: "Waiting", color: "var(--text-3)", tint: "var(--surface-1)" },
};

const LEVEL: Record<BoardLevel, BoardMonitorState> = {
  operational: "up",
  degraded: "flaky",
  outage: "down",
  unchecked: "stale",
  empty: "pending",
};

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** "api.fellasloaded.com/api/feed/categories/" — the scheme is noise on a card this size. */
function shortTarget(target: string): string {
  return target.replace(/^https?:\/\//, "");
}

const TONE: Record<BoardMonitorState, StatusDotTone> = {
  up: "success",
  slow: "warning",
  flaky: "warning",
  down: "danger",
  stale: "neutral",
  pending: "neutral",
};

/**
 * The motion library's status dot (docs/motion.md). Only a DOWN service pings — "look at this"
 * stays rare, so on a healthy board nothing moves and a failure is the one thing that does.
 */
function Dot({ state, still = false }: { state: BoardMonitorState; still?: boolean }) {
  return <StatusDot tone={TONE[state]} motion={state === "down" && !still ? "ping" : "none"} />;
}

function MonitorCard({ m }: { m: BoardMonitor }) {
  const state = monitorState(m);
  const meta = STATE[state];
  const bad = state === "down" || state === "flaky";
  const why =
    state === "down" || state === "flaky"
      ? m.statusCode
        ? `HTTP ${m.statusCode}`
        : m.error ?? "No response"
      : null;
  return (
    <li
      className="flex min-w-0 flex-col rounded-[10px] border p-3.5"
      style={{
        borderColor: bad ? meta.color : "var(--border-2)",
        background: bad ? meta.tint : "var(--surface-0)",
      }}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-[6px] flex">
          <Dot state={state} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--text-1)]" title={m.name}>
            {m.name}
          </p>
          <p className="truncate text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }} title={m.target}>
            {shortTarget(m.target)}
          </p>
        </div>
        <div className="shrink-0 text-right text-[11px] leading-[18px]" style={{ fontFamily: MONO }}>
          {state === "up" || state === "slow" ? (
            <>
              <div style={{ color: meta.color }}>{m.latencyMs != null ? `${m.latencyMs}ms` : "—"}</div>
              <div className="text-[var(--text-4)]">{m.statusCode ?? ""}</div>
            </>
          ) : (
            <div className="font-semibold uppercase tracking-[0.06em]" style={{ color: meta.color }}>
              {meta.label}
            </div>
          )}
        </div>
      </div>
      {why || state === "stale" ? (
        <p className="mt-2 break-words text-[12px]" style={{ color: bad ? meta.color : "var(--text-3)" }}>
          {state === "down"
            ? `Not responding${m.downSince ? ` since ${relTime(m.downSince)}` : ""} · ${why}`
            : state === "flaky"
              ? `Failing on and off · latest ${why}`
              : `Last checked ${relTime(m.checkedAt)}`}
        </p>
      ) : null}
      <p className="mt-auto pt-2 text-[10px] uppercase tracking-[0.08em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
        {m.uptime24h != null ? `${m.uptime24h}% · 24h` : "No checks in 24h"}
        {state === "slow" ? " · slow" : ""}
      </p>
    </li>
  );
}

function ClientGroup({ client }: { client: BoardClient }) {
  const states = client.monitors.map(monitorState);
  const worst = worstState(states) ?? "pending";
  const up = states.filter((s) => s === "up").length;
  const isAgency = client.slug === AGENCY_CLIENT_SLUG;
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <Dot state={worst} still />
        {isAgency ? (
          <h3 className="text-[15px] font-medium text-[var(--text-1)]">{client.name} — our services</h3>
        ) : (
          <Link
            href={`/app/portal/${client.slug}/wiki#monitors`}
            className="text-[15px] font-medium text-[var(--text-1)] hover:text-[var(--brand-700)] hover:underline"
          >
            {client.name}
          </Link>
        )}
        <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
          {up}/{states.length} up
        </span>
      </div>
      <ul
        className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3"
      >
        {client.monitors.map((m) => (
          <MonitorCard key={m.id} m={m} />
        ))}
      </ul>
    </section>
  );
}

export function AgencyMonitorBoard({ slug, number = "01" }: { slug: string; number?: string }) {
  const { data, isLoading, isError, refetch, isFetching } = useWikiMonitorBoard(slug, true);

  const clients = data?.clients ?? [];
  const summary = summariseBoard(clients);
  const { monitored, unmonitored } = orderBoard(clients);
  const lead = STATE[LEVEL[summary.level]];
  const lastCheck =
    clients
      .flatMap((c) => c.monitors.map((m) => m.checkedAt))
      .filter((x): x is string => Boolean(x))
      .sort()
      .at(-1) ?? null;

  return (
    <section className="widget-card">
      <div className="widget-header flex items-center justify-between gap-3">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">{number}</span>
          {" // ALL CLIENTS"}
        </span>
        <div className="flex min-w-0 items-center gap-3">
          {/* The newest real check, not when the page last read the database — the board
              re-reads every minute, but a service is only as fresh as its last check. */}
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
            {isFetching ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      </div>

      <div className="space-y-6 p-5 sm:p-6">
        {isError ? (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-6 text-center text-[13px] text-[var(--danger-500)]">
            Couldn&apos;t load the board. It will try again in a minute.
          </p>
        ) : isLoading ? (
          <div role="status" aria-label="Loading every client's monitors" className="space-y-4">
            <div className="h-[78px] animate-pulse rounded-[12px] bg-[var(--surface-1)]" aria-hidden />
            <SkeletonCards count={6} className="md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3" />
          </div>
        ) : (
          <FadeIn className="space-y-6">
            <div
              className="flex items-center gap-4 rounded-[12px] border px-4 py-4 sm:px-5"
              style={{ borderColor: summary.level === "operational" ? "var(--border-2)" : lead.color, background: lead.tint }}
              role="status"
            >
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--surface-0)", boxShadow: `inset 0 0 0 2px ${lead.color}` }}
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

            {monitored.map((c) => (
              <ClientGroup key={c.clientId} client={c} />
            ))}

            {unmonitored.length > 0 ? (
              <div className="rounded-[10px] border border-dashed border-[var(--border-2)] p-3.5">
                <p
                  className="mb-2 text-[10px] uppercase tracking-[0.1em] text-[var(--text-4)]"
                  style={{ fontFamily: MONO }}
                >
                  Not monitored · {unmonitored.length}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {unmonitored.map((c) => (
                    <li key={c.clientId}>
                      <Link
                        href={c.slug === AGENCY_CLIENT_SLUG ? "#monitors" : `/app/portal/${c.slug}/wiki#monitors`}
                        className="inline-flex items-center rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-[12px] text-[var(--text-2)] hover:border-[var(--brand-500)] hover:text-[var(--brand-700)]"
                        title={`Add a monitor for ${c.name}`}
                      >
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-[12px] text-[var(--text-4)]">
              When a service fails two checks in a row, Gitwork&apos;s ops channel on Slack gets an
              alert naming the client, and another when it&apos;s back. Failing services are
              re-checked every minute.
            </p>
          </FadeIn>
        )}
      </div>
    </section>
  );
}
