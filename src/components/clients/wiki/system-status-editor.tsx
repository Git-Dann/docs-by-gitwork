"use client";

import { useEffect, useMemo, useState } from "react";
import { PlusIcon, TrashIcon, CheckIcon } from "@heroicons/react/24/outline";
import {
  parseSystemStatus,
  overallSystemStatus,
  SYSTEM_STATUS_LEVELS,
  SYSTEM_STATUS_META,
  type SystemStatusItem,
  type SystemStatusContent,
  type SystemStatusLevel,
} from "@/lib/wiki/system-status";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `sys-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

/** Coloured dot for a status level. */
function Dot({ level }: { level: SystemStatusLevel }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: SYSTEM_STATUS_META[level].color }}
    />
  );
}

/** Overall banner shown above the systems list. */
function OverallBanner({ systems }: { systems: SystemStatusItem[] }) {
  const overall = overallSystemStatus(systems);
  if (!overall) {
    return (
      <div className="rounded-[10px] border border-dashed border-[rgba(0,0,0,0.12)] px-4 py-3 text-[13px] text-[var(--text-4)]">
        No systems tracked yet.
      </div>
    );
  }
  const meta = SYSTEM_STATUS_META[overall];
  return (
    <div
      className="flex items-center gap-2.5 rounded-[10px] px-4 py-3"
      style={{ background: meta.tint }}
    >
      <Dot level={overall} />
      <span className="text-[14px] font-semibold" style={{ color: meta.color }}>
        {meta.overall}
      </span>
    </div>
  );
}

export function SystemStatusEditor({
  content,
  readOnly = false,
  onSave,
  saving = false,
}: {
  content: unknown;
  readOnly?: boolean;
  onSave?: (content: SystemStatusContent) => void | Promise<void>;
  saving?: boolean;
}) {
  const initial = useMemo(() => parseSystemStatus(content).systems, [content]);
  const [systems, setSystems] = useState<SystemStatusItem[]>(initial);
  const [dirty, setDirty] = useState(false);

  // Re-sync when the upstream content changes (e.g. after a save round-trips).
  useEffect(() => {
    setSystems(initial);
    setDirty(false);
  }, [initial]);

  function mutate(next: SystemStatusItem[]) {
    setSystems(next);
    setDirty(true);
  }
  const update = (id: string, patch: Partial<SystemStatusItem>) =>
    mutate(systems.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: string) => mutate(systems.filter((s) => s.id !== id));
  const add = () =>
    mutate([...systems, { id: newId(), name: "", status: "OPERATIONAL" }]);

  // ── Read-only board (public + preview) ──────────────────────────────────────
  if (readOnly) {
    return (
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // SYSTEM STATUS"}
          </span>
        </div>
        <div className="space-y-4 p-6">
          <OverallBanner systems={systems} />
          {systems.length > 0 && (
            <ul className="divide-y divide-[rgba(0,0,0,0.06)] rounded-[10px] border border-[rgba(0,0,0,0.08)]">
              {systems.map((s) => {
                const meta = SYSTEM_STATUS_META[s.status];
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <Dot level={s.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-[var(--text-1)]">{s.name}</p>
                      {s.note && (
                        <p className="truncate text-[12px] text-[var(--text-4)]">{s.note}</p>
                      )}
                    </div>
                    <span
                      className="shrink-0 text-[12px] font-medium"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    );
  }

  // ── Editor (workspace) ──────────────────────────────────────────────────────
  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label">
          <span className="widget-header__label--number">01</span>
          {" // SYSTEM STATUS"}
        </span>
        <button
          type="button"
          disabled={!dirty || saving || systems.some((s) => !s.name.trim())}
          onClick={() => onSave?.({ systems: systems.filter((s) => s.name.trim()) })}
          className="inline-flex items-center gap-1.5 rounded-[7px] bg-[var(--brand-600)] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[var(--brand-700)] disabled:opacity-40"
        >
          <CheckIcon className="h-3.5 w-3.5" />
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>
      <div className="space-y-4 p-6">
        <OverallBanner systems={systems} />

        <div className="space-y-2">
          {systems.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[rgba(0,0,0,0.08)] p-2.5 md:flex-nowrap"
            >
              <Dot level={s.status} />
              <input
                value={s.name}
                onChange={(e) => update(s.id, { name: e.target.value })}
                placeholder="System name (e.g. API, Web app, Payments)"
                className="min-w-0 flex-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-[13px] text-[var(--text-1)] outline-none focus:border-[var(--brand-500)]"
              />
              <input
                value={s.note ?? ""}
                onChange={(e) => update(s.id, { note: e.target.value })}
                placeholder="Note (optional)"
                className="min-w-0 flex-1 rounded-[6px] border border-[var(--border-2)] bg-white px-2.5 py-1.5 text-[13px] text-[var(--text-2)] outline-none focus:border-[var(--brand-500)]"
              />
              <select
                value={s.status}
                onChange={(e) => update(s.id, { status: e.target.value as SystemStatusLevel })}
                className="app-select-compact shrink-0"
                aria-label="Status"
              >
                {SYSTEM_STATUS_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {SYSTEM_STATUS_META[lvl].label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => remove(s.id)}
                title="Remove system"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-4)] transition hover:bg-rose-50 hover:text-rose-600"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-[7px] border border-dashed border-[var(--border-2)] px-3 py-2 text-[13px] font-medium text-[var(--text-2)] transition hover:border-[var(--brand-500)] hover:bg-[var(--surface-1)]"
        >
          <PlusIcon className="h-4 w-4" />
          Add system
        </button>
      </div>
    </section>
  );
}
