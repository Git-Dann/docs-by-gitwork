"use client";

import { useMemo, useState } from "react";
import { PlusIcon, TrashIcon, PencilSquareIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import {
  useCreateWikiMonitor,
  useUpdateWikiMonitor,
  useDeleteWikiMonitor,
  useRunWikiMonitor,
} from "@/hooks/use-wiki";
import type { WikiMonitorDTO, MonitorInput } from "@/lib/api";

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

const TYPE_OPTIONS = [
  { value: "HTTP", label: "HTTP / HTTPS", hint: "https://api.example.com/health" },
  { value: "TCP", label: "TCP port", hint: "db.example.com:5432" },
] as const;

const SEVERITY: Record<Status, number> = { UP: 0, UNKNOWN: 1, DEGRADED: 2, DOWN: 3 };

function overall(monitors: WikiMonitorDTO[]): Status {
  const active = monitors.filter((m) => m.enabled);
  if (active.length === 0) return "UNKNOWN";
  return active.reduce<Status>((worst, m) => (SEVERITY[m.status] > SEVERITY[worst] ? m.status : worst), "UP");
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

/** The recent-status bar strip (oldest → newest). */
function HistoryStrip({ history }: { history: WikiMonitorDTO["history"] }) {
  if (history.length === 0) {
    return <div className="h-6 text-[11px] text-[var(--text-4)]">Awaiting first checks…</div>;
  }
  return (
    <div className="flex h-6 items-stretch gap-[2px]" title={`${history.length} recent checks`}>
      {history.map((h, i) => (
        <span
          key={i}
          className="flex-1 rounded-[2px]"
          style={{ background: DOT[h.status as Status], minWidth: 3 }}
          title={`${META[h.status as Status].label}${h.latencyMs != null ? ` · ${h.latencyMs}ms` : ""} · ${new Date(h.checkedAt).toLocaleString()}`}
        />
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const m = META[status];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: m.bg, color: m.color }}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: DOT[status] }} />
      {m.label}
    </span>
  );
}

// ── Public / read-only status board ─────────────────────────────────────────
export function MonitorStatusBoard({ monitors }: { monitors: WikiMonitorDTO[] }) {
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
                ? "Monitoring not started yet"
                : ov === "DEGRADED"
                  ? "Some systems degraded"
                  : "Service disruption"}
          </span>
        </div>

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
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[m.status] }} />
                      <span className="truncate text-[15px] font-medium text-[var(--text-1)]" title={m.name}>
                        {m.name}
                      </span>
                    </div>
                  </div>
                  <StatusPill status={m.status} />
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
                  <span>Checked {relTime(m.checkedAt)}</span>
                </div>
                {m.status === "DOWN" && m.error && (
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
type FormState = {
  name: string;
  type: "HTTP" | "TCP";
  target: string;
  method: string;
  expectedStatus: string;
  keyword: string;
  degradedMs: string;
  intervalMinutes: string;
};
const EMPTY_FORM: FormState = {
  name: "",
  type: "HTTP",
  target: "",
  method: "GET",
  expectedStatus: "",
  keyword: "",
  degradedMs: "",
  intervalMinutes: "5",
};

const inputCls =
  "w-full rounded-[8px] border border-[var(--border-2)] bg-white px-3 py-2 text-[14px] text-[var(--text-1)] outline-none focus:border-[var(--brand-500)]";

export function MonitorsManager({ slug, monitors }: { slug: string; monitors: WikiMonitorDTO[] }) {
  const create = useCreateWikiMonitor(slug);
  const update = useUpdateWikiMonitor(slug);
  const remove = useDeleteWikiMonitor(slug);
  const run = useRunWikiMonitor(slug);

  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;

  const typeHint = useMemo(
    () => TYPE_OPTIONS.find((t) => t.value === form.type)?.hint ?? "",
    [form.type],
  );

  function openNew() {
    setForm(EMPTY_FORM);
    setEditing("new");
    setError(null);
  }
  function openEdit(m: WikiMonitorDTO) {
    setForm({
      name: m.name,
      type: m.type,
      target: m.target,
      method: m.method,
      expectedStatus: m.expectedStatus?.toString() ?? "",
      keyword: m.keyword ?? "",
      degradedMs: m.degradedMs?.toString() ?? "",
      intervalMinutes: m.intervalMinutes.toString(),
    });
    setEditing(m.id);
    setError(null);
  }

  async function submit() {
    if (!form.name.trim() || !form.target.trim()) {
      setError("Name and target are required.");
      return;
    }
    const payload: MonitorInput = {
      name: form.name.trim(),
      type: form.type,
      target: form.target.trim(),
      method: form.type === "HTTP" ? form.method || "GET" : "GET",
      expectedStatus: form.expectedStatus.trim() ? Number(form.expectedStatus) : null,
      keyword: form.type === "HTTP" && form.keyword.trim() ? form.keyword.trim() : null,
      degradedMs: form.degradedMs.trim() ? Number(form.degradedMs) : null,
      intervalMinutes: form.intervalMinutes.trim() ? Number(form.intervalMinutes) : 5,
    };
    try {
      if (editing === "new") await create.mutateAsync(payload);
      else if (editing) await update.mutateAsync({ id: editing, input: payload });
      setEditing(null);
    } catch {
      setError("Couldn't save the monitor. Check the values and try again.");
    }
  }

  return (
    <section className="widget-card">
      <div className="widget-header flex items-center justify-between">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">01</span>
          {" // SYSTEM MONITORS"}
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
          Checks run automatically on each monitor&apos;s interval. Clients see the live board with
          uptime and response time.
        </p>

        {editing && (
          <div className="space-y-3 rounded-[12px] border border-[var(--brand-200,rgba(37,99,235,0.25))] bg-[var(--surface-1)] p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[12px] font-medium text-[var(--text-2)]">
                Name
                <input
                  className={`mt-1 ${inputCls}`}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Website, API, Database…"
                />
              </label>
              <label className="text-[12px] font-medium text-[var(--text-2)]">
                Type
                <select
                  className="app-select-compact mt-1 w-full"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as "HTTP" | "TCP" })}
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block text-[12px] font-medium text-[var(--text-2)]">
              Target
              <input
                className={`mt-1 ${inputCls}`}
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
                placeholder={typeHint}
                style={{ fontFamily: MONO }}
              />
            </label>

            {form.type === "HTTP" && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <label className="text-[12px] font-medium text-[var(--text-2)]">
                  Method
                  <select
                    className="app-select-compact mt-1 w-full"
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value })}
                  >
                    {["GET", "HEAD", "POST"].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[12px] font-medium text-[var(--text-2)]">
                  Expected status
                  <input
                    className={`mt-1 ${inputCls}`}
                    value={form.expectedStatus}
                    onChange={(e) => setForm({ ...form, expectedStatus: e.target.value })}
                    placeholder="any 2xx/3xx"
                    inputMode="numeric"
                  />
                </label>
                <label className="text-[12px] font-medium text-[var(--text-2)]">
                  Keyword (optional)
                  <input
                    className={`mt-1 ${inputCls}`}
                    value={form.keyword}
                    onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                    placeholder="must contain…"
                  />
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px] font-medium text-[var(--text-2)]">
                Interval (min)
                <input
                  className={`mt-1 ${inputCls}`}
                  value={form.intervalMinutes}
                  onChange={(e) => setForm({ ...form, intervalMinutes: e.target.value })}
                  inputMode="numeric"
                />
              </label>
              <label className="text-[12px] font-medium text-[var(--text-2)]">
                Slow after (ms, optional)
                <input
                  className={`mt-1 ${inputCls}`}
                  value={form.degradedMs}
                  onChange={(e) => setForm({ ...form, degradedMs: e.target.value })}
                  placeholder="e.g. 2000 → Degraded"
                  inputMode="numeric"
                />
              </label>
            </div>

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

        {monitors.length === 0 && !editing ? (
          <p className="rounded-[10px] border border-dashed border-[var(--border-2)] px-4 py-8 text-center text-[13px] text-[var(--text-4)]">
            No monitors yet. Add one to start tracking uptime.
          </p>
        ) : (
          <ul className="divide-y divide-[rgba(0,0,0,0.06)] overflow-hidden rounded-[12px] border border-[rgba(0,0,0,0.08)]">
            {monitors.map((m) => (
              <li key={m.id} className="flex items-center gap-3 bg-white px-4 py-3">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DOT[m.status] }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-[var(--text-1)]" title={m.name}>
                      {m.name}
                    </span>
                    {!m.enabled && <span className="text-[11px] text-[var(--text-4)]">(paused)</span>}
                  </div>
                  {/* Truncates, so it carries the full target on hover — a
                      container URL is routinely longer than the row. */}
                  <p
                    className="truncate text-[12px] text-[var(--text-4)]"
                    style={{ fontFamily: MONO }}
                    title={m.target}
                  >
                    {m.type} · {m.target} · {fmtUptime(m.uptime.d30)} · {fmtLatency(m.latencyMs)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Check now"
                    disabled={run.isPending}
                    onClick={() => run.mutate(m.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)] disabled:opacity-40"
                  >
                    <ArrowPathIcon className={`h-4 w-4 ${run.isPending ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    type="button"
                    title="Edit"
                    onClick={() => openEdit(m)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete monitor "${m.name}"?`)) remove.mutate(m.id);
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {monitors.length > 0 && (
          <>
            <p className="pt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
              Client preview
            </p>
            <MonitorStatusBoard monitors={monitors} />
          </>
        )}
      </div>
    </section>
  );
}
