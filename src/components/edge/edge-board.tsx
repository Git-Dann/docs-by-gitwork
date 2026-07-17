"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DeskToday } from "@/components/desk/desk-today";
import { useClientList } from "@/hooks/use-proposals";
import type { ClientListItem } from "@/types/client";

// Corsair Xeneon Edge exec board — dark, chrome-free, tuned for the 2560×720 panel but
// responsive so it previews on any screen. Signed-in session → real data as the viewer.
// The route is forced dark (FORCE_DARK), so the app's CSS tokens (and the reused
// DeskToday) all render dark; this board styles its own chrome from the same tokens.

const HEALTH_COLOR: Record<string, string> = { green: "#37b877", amber: "#e6a352", red: "#e56a6a" };
const HEALTH_RANK: Record<string, number> = { red: 0, amber: 1, green: 2 };

type QuickAction = { label: string; href: string };

// Default launch deck. Whoever's signed in edits their own copy in-browser (Edit button).
const DEFAULT_ACTIONS: QuickAction[] = [
  { label: "Foundry", href: "/app" },
  { label: "Pulse", href: "/app/pulse" },
  { label: "Analytics", href: "/app/analytics" },
  { label: "Docs", href: "/app/docs" },
  { label: "Portal", href: "/app/portal" },
  { label: "Starters", href: "/app/starters" },
];

const ACTIONS_STORAGE_KEY = "gitwork.edge.actions.v1";

function isActionArray(value: unknown): value is QuickAction[] {
  return (
    Array.isArray(value) &&
    value.every(
      (a) => a && typeof (a as QuickAction).label === "string" && typeof (a as QuickAction).href === "string",
    )
  );
}

// Self-serve deck, persisted per-browser. SSR-safe: defaults on the server + first paint,
// saved deck hydrates in an effect (no hydration mismatch). Edits save immediately.
function useEdgeActions() {
  const [actions, setActions] = useState<QuickAction[]>(DEFAULT_ACTIONS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ACTIONS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (isActionArray(parsed)) setActions(parsed);
    } catch {
      /* keep defaults */
    }
  }, []);

  const save = useCallback((next: QuickAction[]) => {
    setActions(next);
    try {
      window.localStorage.setItem(ACTIONS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — keep in-memory */
    }
  }, []);

  const reset = useCallback(() => {
    setActions(DEFAULT_ACTIONS);
    try {
      window.localStorage.removeItem(ACTIONS_STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, []);

  return { actions, save, reset };
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function healthRank(c: ClientListItem): number {
  return HEALTH_RANK[c.health?.level ?? ""] ?? 3;
}

export function EdgeBoard() {
  const { data } = useClientList({ status: "ACTIVE" });
  const clients = data?.clients ?? [];
  const ranked = [...clients].sort((a, b) => healthRank(a) - healthRank(b));
  const reds = clients.filter((c) => c.health?.level === "red").length;
  const ambers = clients.filter((c) => c.health?.level === "amber").length;

  const { actions, save, reset } = useEdgeActions();
  const [editing, setEditing] = useState(false);
  const now = useClock();

  const updateAction = (i: number, patch: Partial<QuickAction>) =>
    save(actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const removeAction = (i: number) => save(actions.filter((_, idx) => idx !== i));
  const addAction = () => save([...actions, { label: "New", href: "/app" }]);
  const moveAction = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= actions.length) return;
    const next = [...actions];
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-[var(--surface-canvas)] p-4 text-[var(--text-1)]">
      {/* Masthead */}
      <header className="mb-3 flex flex-none items-center justify-between px-1">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[12px] uppercase tracking-[0.2em] text-[var(--accent)]">Foundry</span>
          <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--text-3)]">// Mission Control</span>
        </div>
        <div className="flex items-baseline gap-4 font-mono text-[var(--text-3)]">
          {now && (
            <>
              <span className="text-[12px] uppercase tracking-[0.14em]">
                {now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              </span>
              <span className="text-[18px] font-semibold tabular-nums text-[var(--text-1)]">
                {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
            </>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(190px,0.6fr)_minmax(260px,0.85fr)_minmax(0,1.5fr)_minmax(210px,0.65fr)]">
        {/* Agent — Claw'd placeholder. The live scuttling Claw'd is on the Stream Deck. */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
          <h2 className="mb-3 flex-none font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-3)]">Agent</h2>
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div
              className="flex h-[132px] w-[132px] items-center justify-center rounded-[18px]"
              style={{ background: "#0e0f12", boxShadow: "0 0 44px -10px rgba(224,87,64,.55)" }}
            >
              <span style={{ fontSize: "76px", lineHeight: 1 }} role="img" aria-label="Claw'd placeholder">🦀</span>
            </div>
            <div className="font-mono text-[13px] font-bold tracking-[0.1em]">CLAW&rsquo;D</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">lives on the deck</div>
          </div>
          <div className="mb-2 mt-4 flex-none font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">Reasoning effort</div>
          <div className="grid flex-none grid-cols-4 gap-2">
            {["Low", "Med", "High", "Max"].map((e, i) => (
              <div
                key={e}
                className={
                  "rounded-[10px] border py-2.5 text-center font-mono text-[12px] uppercase " +
                  (i === 1
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-[var(--border-2)] bg-[var(--surface-1)] text-[var(--text-3)]")
                }
              >
                {e}
              </div>
            ))}
          </div>
        </section>

        {/* Project health */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
          <header className="mb-3 flex flex-none items-baseline justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-3)]">Project health</h2>
            <span className="font-mono text-[11px] text-[var(--text-3)]">
              {reds ? `${reds} red` : ""}{reds && ambers ? " · " : ""}{ambers ? `${ambers} amber` : ""}{!reds && !ambers ? "all green" : ""}
            </span>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {ranked.length === 0 && <p className="text-sm text-[var(--text-3)]">No active clients.</p>}
            {ranked.map((c) => {
              const level = c.health?.level ?? null;
              const reason = c.health?.reasons?.[0] ?? (c.pulseHealthScore != null ? `Pulse ${c.pulseHealthScore}` : "on track");
              const color = level ? HEALTH_COLOR[level] : HEALTH_COLOR.green;
              return (
                <div key={c.id} className="flex flex-none items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5">
                  <span className="h-3 w-3 flex-none rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                    <span className="block truncate font-mono text-[12px] text-[var(--text-3)]">{reason}</span>
                  </span>
                  <span className="flex-none font-mono text-[12px] text-[var(--text-3)]">{c.devCount ?? 0} dev</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Today — the real On Your Desk, rendered dark by the forced-dark route */}
        <section className="min-h-0 overflow-y-auto rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5">
          <DeskToday />
        </section>

        {/* Quick actions — self-serve editable deck */}
        <section className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
          <header className="mb-3 flex flex-none items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-3)]">Quick actions</h2>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-3)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-1)]"
            >
              {editing ? "Done" : "Edit"}
            </button>
          </header>

          {!editing && (
            <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-3 overflow-y-auto">
              {actions.map((a, i) => (
                <Link
                  key={`${a.label}-${i}`}
                  href={a.href}
                  className="flex min-h-[64px] items-center justify-center rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 text-center text-[15px] font-semibold transition-colors hover:border-[var(--accent)]"
                >
                  {a.label}
                </Link>
              ))}
              {actions.length === 0 && (
                <p className="col-span-2 text-sm text-[var(--text-3)]">No actions yet — press Edit to add some.</p>
              )}
            </div>
          )}

          {editing && (
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {actions.map((a, i) => (
                <div key={i} className="flex flex-none items-center gap-1.5 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] p-2">
                  <div className="flex flex-col">
                    <button type="button" onClick={() => moveAction(i, -1)} disabled={i === 0} aria-label="Move up" className="px-1 text-[11px] leading-none text-[var(--text-3)] hover:text-[var(--text-1)] disabled:opacity-30">▲</button>
                    <button type="button" onClick={() => moveAction(i, 1)} disabled={i === actions.length - 1} aria-label="Move down" className="px-1 text-[11px] leading-none text-[var(--text-3)] hover:text-[var(--text-1)] disabled:opacity-30">▼</button>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <input
                      value={a.label}
                      onChange={(e) => updateAction(i, { label: e.target.value })}
                      placeholder="Label"
                      className="w-full rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1.5 text-[13px] font-semibold outline-none focus:border-[var(--accent)]"
                    />
                    <input
                      value={a.href}
                      onChange={(e) => updateAction(i, { href: e.target.value })}
                      placeholder="/app/... or https://..."
                      className="w-full rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1.5 font-mono text-[11px] text-[var(--text-3)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <button type="button" onClick={() => removeAction(i)} aria-label="Remove action" className="flex-none rounded-[7px] border border-[var(--border-2)] px-2 py-1 text-[13px] text-[var(--text-3)] transition-colors hover:border-[#e56a6a] hover:text-[#e56a6a]">✕</button>
                </div>
              ))}
              <div className="mt-1 flex flex-none items-center justify-between gap-2">
                <button type="button" onClick={addAction} className="rounded-[9px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-1.5 text-[12px] font-semibold transition-colors hover:border-[var(--accent)]">+ Add action</button>
                <button type="button" onClick={reset} className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-3)] underline decoration-dotted underline-offset-2 hover:text-[var(--text-1)]">Reset to defaults</button>
              </div>
              <p className="mt-1 flex-none font-mono text-[10px] leading-relaxed text-[var(--text-3)]">
                Saved in this browser. Use a Foundry path like <span className="text-[var(--text-1)]">/app/pulse</span> or a full link like <span className="text-[var(--text-1)]">https://…</span>
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
