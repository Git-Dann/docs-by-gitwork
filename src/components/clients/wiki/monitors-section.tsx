"use client";

import { useState } from "react";
import { PlusIcon, TrashIcon, PencilSquareIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import {
  useCreateWikiMonitor,
  useUpdateWikiMonitor,
  useDeleteWikiMonitor,
  useRunWikiMonitor,
  useWikiMonitorSuggestions,
} from "@/hooks/use-wiki";
import type { WikiMonitorDTO } from "@/lib/api";
import type { IncidentDTO } from "@/lib/monitor-incidents";
import { IncidentList } from "./monitor-incidents";
import { EMPTY_MONITOR_FORM, formToMonitorInput, monitorToForm, type MonitorFormState } from "@/lib/monitor-form";
import { clientVisibleIncidents, clientVisibleMonitors } from "@/lib/monitor-environment";
import { EnvironmentTag } from "./monitor-board";
import { MonitorFormFields } from "./monitor-form-fields";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

type Status = "UP" | "DEGRADED" | "DOWN" | "UNKNOWN";
const META: Record<Status, { label: string; color: string; bg: string }> = {
  UP: { label: "Operational", color: "#059669", bg: "rgba(16,185,129,0.14)" },
  DEGRADED: { label: "Degraded", color: "#b45309", bg: "rgba(245,158,11,0.16)" },
  DOWN: { label: "Down", color: "#e11d48", bg: "rgba(225,29,72,0.12)" },
  UNKNOWN: { label: "Pending", color: "#6b7280", bg: "rgba(0,0,0,0.05)" },
};
const DOT: Record<Status, string> = {
  UP: "#10b981",
  DEGRADED: "#f59e0b",
  DOWN: "#e11d48",
  UNKNOWN: "#9ca3af",
};

const SEVERITY: Record<Status, number> = { UP: 0, UNKNOWN: 1, DEGRADED: 2, DOWN: 3 };

function overall(monitors: WikiMonitorDTO[]): Status {
  const active = monitors.filter((m) => m.enabled);
  if (active.length === 0) return "UNKNOWN";
  return active.reduce<Status>(
    (worst, m) => (SEVERITY[shownStatus(m)] > SEVERITY[worst] ? shownStatus(m) : worst),
    "UP",
  );
}

function fmtUptime(v: number | null): string {
  return v == null ? "—" : `${v}%`;
}
function fmtLatency(v: number | null): string {
  return v == null ? "—" : `${v}ms`;
}
function relTime(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * What to show for a monitor. A stale one is NOT shown as its last result: monitors kept
 * reading UP for 2½ months while nothing was checking them (Aug–Oct 2026).
 */
function shownStatus(m: WikiMonitorDTO): Status {
  return m.stale ? "UNKNOWN" : m.status;
}
function statusLabel(m: WikiMonitorDTO): string {
  if (m.maintenance) return "Maintenance";
  return m.stale ? "Not checking" : META[m.status].label;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Amber inside the warning window, red once inside the last few days or expired. */
function expiryTone(iso: string, warnDays: number, urgentDays: number): string {
  const d = (new Date(iso).getTime() - Date.now()) / DAY_MS;
  if (d < urgentDays) return "var(--danger-500)";
  if (d < warnDays) return "var(--warning-500)";
  return "var(--text-4)";
}
function daysText(iso: string): string {
  const d = Math.floor((new Date(iso).getTime() - Date.now()) / DAY_MS);
  if (d < 0) return "expired";
  return `${d}d`;
}

/**
 * Certificate, domain and maintenance at a glance — one mono line, coloured only when
 * something needs doing. Renders nothing for a monitor with none of the three.
 */
function MonitorFacts({ m }: { m: WikiMonitorDTO }) {
  const facts: { key: string; text: string; color: string; title: string }[] = [];
  if (m.maintenance) {
    facts.push({
      key: "maint",
      text: `Maintenance until ${new Date(m.maintenance.until).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
      color: "var(--brand-600)",
      title: m.maintenance.note ?? "Alerts are paused",
    });
  }
  if (m.ssl?.expiresAt) {
    facts.push({
      key: "ssl",
      text: `SSL ${daysText(m.ssl.expiresAt)}`,
      color: expiryTone(m.ssl.expiresAt, 14, 3),
      title: `Certificate expires ${new Date(m.ssl.expiresAt).toLocaleDateString()}${m.ssl.issuer ? ` · ${m.ssl.issuer}` : ""}`,
    });
  } else if (m.ssl?.error) {
    facts.push({ key: "ssl", text: "SSL ?", color: "var(--text-4)", title: `Certificate could not be read: ${m.ssl.error}` });
  }
  if (m.domain?.expiresAt) {
    facts.push({
      key: "domain",
      text: `Domain ${daysText(m.domain.expiresAt)}`,
      color: expiryTone(m.domain.expiresAt, 30, 7),
      title: `${m.domain.name} registration expires ${new Date(m.domain.expiresAt).toLocaleDateString()}`,
    });
  }
  if (m.heartbeat) {
    facts.push({
      key: "ping",
      text: m.heartbeat.lastPingAt ? `Pinged ${relTime(m.heartbeat.lastPingAt)}` : "No ping yet",
      color: m.heartbeat.lastPingOk === false ? "var(--danger-500)" : "var(--text-4)",
      title: m.heartbeat.lastPingOk === false ? "The last run reported a failure" : `Expected every ${m.intervalMinutes} min`,
    });
  }
  if (m.remoteNote && m.status !== "UP") {
    facts.push({ key: "remote", text: m.remoteNote, color: "var(--text-3)", title: "Checked from a second location after it failed from Foundry's server" });
  }
  if (m.headerNames.length > 0) {
    facts.push({ key: "auth", text: "Signed in", color: "var(--text-4)", title: `Sends ${m.headerNames.join(", ")}` });
  }
  if (facts.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] uppercase tracking-[0.04em]" style={{ fontFamily: MONO }}>
      {facts.map((f) => (
        <span key={f.key} style={{ color: f.color }} title={f.title}>
          {f.text}
        </span>
      ))}
    </div>
  );
}

/** The recent-status bar strip (oldest → newest). */
function HistoryStrip({ history }: { history: WikiMonitorDTO["history"] }) {
  if (history.length === 0) {
    return <div className="h-6 text-[11px] text-[var(--text-4)]">Awaiting first checks…</div>;
  }
  return (
    // ⚠️ Each bar is `flex-1` but floored at 3px, so N checks need ~5N px and CANNOT
    // shrink below it. In the 2-up card grid at 768 that overflowed the monitor card,
    // and `.widget-card` is overflow:hidden — so the most recent ~10 days of uptime
    // were unreachable, not merely off-screen (CLAUDE.md §45.2). Scrolls now.
    <div className="overflow-x-auto">
      <div
        className="flex h-6 items-stretch gap-[2px]"
        title={`${history.length} recent checks`}
      >
        {history.map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-[2px]"
            style={{ background: DOT[h.status as Status], minWidth: 3 }}
            title={`${META[h.status as Status].label}${h.latencyMs != null ? ` · ${h.latencyMs}ms` : ""} · ${new Date(h.checkedAt).toLocaleString()}`}
          />
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status, label }: { status: Status; label?: string }) {
  const m = META[status];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: m.bg, color: m.color }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: DOT[status] }} />
      {label ?? m.label}
    </span>
  );
}

// ── Public / read-only status board ─────────────────────────────────────────
export function MonitorStatusBoard({ monitors, incidents = [] }: { monitors: WikiMonitorDTO[]; incidents?: IncidentDTO[] }) {
  const visible = monitors.filter((m) => m.enabled);
  const ov = overall(monitors);
  const ovMeta = META[ov];

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">01</span>
          {" // SYSTEM MONITORS"}
        </span>
      </div>
      <div className="space-y-4 p-6">
        <div
          className="flex items-center gap-2.5 rounded-[10px] px-4 py-3"
          style={{ background: ovMeta.bg }}
        >
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: DOT[ov] }} />
          <span className="text-[14px] font-semibold" style={{ color: ovMeta.color }}>
            {ov === "UP"
              ? "All systems operational"
              : ov === "UNKNOWN"
                ? visible.some((m) => m.stale)
                  ? "Status not checked recently"
                  : "Monitoring not started yet"
                : ov === "DEGRADED"
                  ? "Some systems degraded"
                  : "Service disruption"}
          </span>
        </div>

        <IncidentList incidents={incidents} slug="" audience="client" />

        {visible.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.12)] px-4 py-8 text-center text-[13px] text-[var(--text-4)]">
            No monitors yet.
          </p>
        ) : (
          /* Two-up from md. A monitor card is a name, a pill, a history strip
             and one meta line — at full width most of each row sat empty, and a
             client running a dozen containers had to scroll past all of them.
             The strip's bars are flex-1, so they just render narrower. */
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {visible.map((m) => (
              <li key={m.id} className="rounded-[12px] border border-[rgba(0,0,0,0.08)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[shownStatus(m)] }} />
                      <span className="truncate text-[15px] font-medium text-[var(--text-1)]" title={m.name}>
                        {m.name}
                      </span>
                    </div>
                  </div>
                  <StatusPill status={shownStatus(m)} label={statusLabel(m)} />
                </div>

                <div className="mt-3">
                  <HistoryStrip history={m.history} />
                </div>

                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--text-4)]">
                  <span>
                    <span style={{ fontFamily: MONO }}>{fmtUptime(m.uptime.d30)}</span> uptime · 30d
                  </span>
                  <span>
                    <span style={{ fontFamily: MONO }}>{fmtLatency(m.avgLatencyMs)}</span> avg
                  </span>
                  <span className={m.stale ? "font-medium text-[var(--warning-500)]" : undefined}>
                    {m.stale ? `Last checked ${relTime(m.checkedAt)}` : `Checked ${relTime(m.checkedAt)}`}
                  </span>
                </div>
                <MonitorFacts m={m} />
                {!m.stale && m.status === "DOWN" && m.error && (
                  <p className="mt-1.5 text-[12px] text-rose-600">{m.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── Editor / manager (workspace) ────────────────────────────────────────────
export function MonitorsManager({
  slug,
  monitors,
  incidents = [],
  number = "01",
  label = "SYSTEM MONITORS",
}: {
  slug: string;
  monitors: WikiMonitorDTO[];
  incidents?: IncidentDTO[];
  /** The card's `NN //` number — 02 on the Gitwork wiki, where the all-clients board is 01. */
  number?: string;
  label?: string;
}) {
  const create = useCreateWikiMonitor(slug);
  const update = useUpdateWikiMonitor(slug);
  const remove = useDeleteWikiMonitor(slug);
  const run = useRunWikiMonitor(slug);

  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<MonitorFormState>(EMPTY_MONITOR_FORM);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  function openNew() {
    setForm(EMPTY_MONITOR_FORM);
    setEditing("new");
    setError(null);
  }
  function openEdit(m: WikiMonitorDTO) {
    setForm(monitorToForm(m));
    setEditing(m.id);
    setError(null);
  }

  async function submit() {
    const built = formToMonitorInput(form);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    const payload = built.input;
    try {
      if (editing === "new") await create.mutateAsync(payload);
      else if (editing) await update.mutateAsync({ id: editing, input: payload });
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't save the monitor. Check the values and try again.");
    }
  }

  return (
    <section className="widget-card">
      <div className="widget-header flex items-center justify-between">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">{number}</span>
          {` // ${label}`}
        </span>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1 text-[12px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)]"
        >
          <PlusIcon className="h-3.5 w-3.5" /> Add monitor
        </button>
      </div>

      <div className="space-y-3 p-6">
        <p className="text-[13px] text-[var(--text-4)]">
          Checks run every few minutes. If one fails twice in a row, Gitwork&apos;s ops channel on
          Slack gets an alert, and another when it&apos;s back up. Clients see the live board, for
          production monitors only.
        </p>

        {editing && (
          <div className="space-y-3 rounded-[12px] border border-[var(--brand-200,rgba(37,99,235,0.25))] bg-[var(--surface-1)] p-4">
            <MonitorFormFields
              form={form}
              setForm={setForm}
              lockType={editing !== "new" && form.type === "HEARTBEAT"}
            />

            {error && <p className="text-[12px] text-rose-600">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="rounded-[7px] bg-[var(--brand-600)] px-3.5 py-1.5 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-50"
              >
                {busy ? "Saving…" : editing === "new" ? "Add monitor" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-[7px] border border-[var(--border-2)] px-3.5 py-1.5 text-[13px] text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <IncidentList incidents={incidents} slug={slug} audience="team" />

        <MonitorSuggestions
          slug={slug}
          onAdd={async (sug) => {
            await create.mutateAsync({
              name: sug.name,
              type: "HTTP",
              target: sug.target,
              method: "GET",
              expectedStatus: null,
              keyword: null,
              degradedMs: null,
              intervalMinutes: 5,
            });
          }}
        />

        {monitors.length === 0 && !editing ? (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center text-[13px] text-[var(--text-4)]">
            No monitors yet. Add one to start tracking uptime.
          </p>
        ) : (
          /* Cards, so a client with several monitors reads at a glance — 2-up from md, 3-up from
             xl. A single monitor keeps the full width rather than a lone card in a corner. */
          <ul className={`grid grid-cols-1 gap-3 ${monitors.length > 1 ? "md:grid-cols-2 xl:grid-cols-3" : ""}`}>
            {monitors.map((m) => (
              <li
                key={m.id}
                className="flex min-w-0 flex-col rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DOT[shownStatus(m)] }} />
                      <span className="truncate text-[14px] font-medium text-[var(--text-1)]" title={m.name}>
                        {m.name}
                      </span>
                      <EnvironmentTag environment={m.environment} />
                    </div>
                    {/* Truncates, so it carries the full target on hover — a container URL is
                        routinely longer than the card. */}
                    <p className="mt-0.5 truncate text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }} title={m.target}>
                      {m.type} · {m.target}
                    </p>
                  </div>
                  {m.enabled ? (
                    <StatusPill status={shownStatus(m)} label={statusLabel(m)} />
                  ) : (
                    <span className="shrink-0 text-[11px] text-[var(--text-4)]">Paused</span>
                  )}
                </div>

                <div className="mt-3">
                  <HistoryStrip history={m.history} />
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-4)]">
                  <span>
                    <span style={{ fontFamily: MONO }}>{fmtUptime(m.uptime.d30)}</span> · 30d
                  </span>
                  <span>
                    <span style={{ fontFamily: MONO }}>{fmtLatency(m.latencyMs)}</span>
                  </span>
                  <span className={m.stale ? "font-medium text-[var(--warning-500)]" : undefined}>
                    {m.stale ? `Last checked ${relTime(m.checkedAt)}` : `Checked ${relTime(m.checkedAt)}`}
                  </span>
                </div>
                <MonitorFacts m={m} />
                {m.heartbeat?.pingUrl ? <PingUrl url={m.heartbeat.pingUrl} /> : null}
                {!m.stale && m.status === "DOWN" && m.error ? (
                  <p className="mt-1.5 break-words text-[12px] text-[var(--danger-500)]">{m.error}</p>
                ) : null}

                <div className="mt-auto flex items-center justify-end gap-1 pt-3">
                  <MaintenanceControl
                    monitor={m}
                    busy={update.isPending}
                    onSet={(until) => update.mutate({ id: m.id, input: { maintenanceUntil: until } })}
                  />
                  <button
                    type="button"
                    title="Check now"
                    aria-label={`Check ${m.name} now`}
                    disabled={run.isPending}
                    onClick={() => run.mutate(m.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] disabled:opacity-40"
                  >
                    <ArrowPathIcon className={`h-4 w-4 ${run.isPending ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    type="button"
                    title="Edit"
                    aria-label={`Edit ${m.name}`}
                    onClick={() => openEdit(m)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    aria-label={`Delete ${m.name}`}
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete monitor "${m.name}"?`)) remove.mutate(m.id);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--danger-500)] disabled:opacity-40"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* The client's live board, folded away: open it, every monitor was on the page twice —
            once to manage above, once again here. One click shows exactly what they see. */}
        {monitors.length > 0 && (
          <details className="group pt-2">
            <summary
              className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)] hover:text-[var(--text-2)] [&::-webkit-details-marker]:hidden"
              style={{ fontFamily: MONO }}
            >
              <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
              Show what the client sees
            </summary>
            <div className="pt-3">
              {/* Exactly what their board gets: production only, as the server trims it. */}
              <MonitorStatusBoard monitors={clientVisibleMonitors(monitors)} incidents={clientVisibleIncidents(incidents, monitors)} />
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

/**
 * The client's Platform URLs nothing is watching yet, one click each. Renders nothing when
 * there is nothing to suggest, so a fully covered client sees no extra block.
 */
function MonitorSuggestions({
  slug,
  onAdd,
}: {
  slug: string;
  onAdd: (s: { name: string; target: string }) => Promise<void>;
}) {
  const { data } = useWikiMonitorSuggestions(slug);
  const [adding, setAdding] = useState<string | null>(null);
  const suggestions = data?.suggestions ?? [];
  if (suggestions.length === 0) return null;
  return (
    <div className="rounded-[10px] border border-dashed border-[var(--border-2)] p-3">
      <p className="mb-2 text-[11px] uppercase tracking-[0.06em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
        From this client&apos;s Platforms — not monitored yet
      </p>
      <ul className="flex flex-wrap gap-2">
        {suggestions.map((sug) => (
          <li key={sug.target} className="min-w-0 max-w-full">
            <button
              type="button"
              disabled={adding !== null}
              onClick={async () => {
                setAdding(sug.target);
                try {
                  await onAdd(sug);
                } finally {
                  setAdding(null);
                }
              }}
              title={sug.target}
              className="inline-flex max-w-full items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[12px] text-[var(--text-2)] transition hover:border-[var(--brand-500)] hover:text-[var(--brand-700)] disabled:opacity-50"
            >
              <PlusIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{adding === sug.target ? "Adding…" : sug.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The heartbeat's ping URL with a copy button — the one thing the job's owner needs. */
function PingUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex min-w-0 items-center gap-2 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 py-1">
      <code className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-2)]" style={{ fontFamily: MONO }} title={url}>
        {url}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="shrink-0 text-[11px] font-medium text-[var(--brand-700)] hover:underline"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

const PAUSE_OPTIONS = [
  { label: "Pause alerts 1 h", hours: 1 },
  { label: "Pause alerts 4 h", hours: 4 },
  { label: "Pause alerts 24 h", hours: 24 },
] as const;

/**
 * Planned work: pause alerts for a while. Checks keep running and the board says
 * "Maintenance"; alerts resume on their own when the window ends.
 */
function MaintenanceControl({
  monitor,
  busy,
  onSet,
}: {
  monitor: WikiMonitorDTO;
  busy: boolean;
  onSet: (until: Date | null) => void;
}) {
  if (monitor.maintenance) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onSet(null)}
        className="mr-auto rounded-[6px] px-2 py-1 text-[11px] font-medium text-[var(--brand-700)] transition hover:bg-[var(--surface-1)] disabled:opacity-40"
      >
        End maintenance
      </button>
    );
  }
  return (
    <select
      aria-label={`Pause alerts for ${monitor.name}`}
      disabled={busy}
      value=""
      onChange={(e) => {
        const hours = Number(e.target.value);
        if (hours > 0) onSet(new Date(Date.now() + hours * 60 * 60 * 1000));
      }}
      className="app-select-compact mr-auto max-w-[150px] text-[11px]"
    >
      <option value="">Maintenance…</option>
      {PAUSE_OPTIONS.map((o) => (
        <option key={o.hours} value={o.hours}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
