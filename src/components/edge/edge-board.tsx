"use client";

import { useCallback, useEffect, useState } from "react";
import { ClawdSprite, type ClawdState } from "@/components/edge/clawd-sprite";
import { useClientList } from "@/hooks/use-proposals";
import { useTaskAttention } from "@/hooks/use-tasks";
import { useAccount } from "@/hooks/use-account";
import type { ClientListItem } from "@/types/client";

// Corsair Xeneon Edge — Mission Control. A PERSISTENT second-screen control centre:
// it fills the viewport, never scrolls the page, and never navigates away from itself
// (quick actions open new windows). Tuned for 2560×720, reflows to a scroll list below lg.

const HEALTH_COLOR: Record<string, string> = { green: "#37b877", amber: "#e6a352", red: "#e56a6a" };
const HEALTH_RANK: Record<string, number> = { red: 0, amber: 1, green: 2 };

const AGENT_STATES: ClawdState[] = ["idle", "thinking", "needs-you", "done", "error"];
const STATE_LABEL: Record<ClawdState, string> = {
  idle: "idle", thinking: "working…", "needs-you": "needs you", done: "done", error: "error",
};
const STATE_ACCENT: Record<ClawdState, string> = {
  idle: "var(--text-3)", thinking: "#4ec3d6", "needs-you": "#e6a352", done: "#37b877", error: "#e56a6a",
};

type QuickAction = { label: string; href: string };

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
    value.every((a) => a && typeof (a as QuickAction).label === "string" && typeof (a as QuickAction).href === "string")
  );
}

// Self-serve deck, per-browser localStorage. SSR-safe (defaults first, saved deck hydrates in an effect).
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
      /* in-memory only */
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

// Poll the agent-status beacon (authenticated session is authorised — no key). Drives Claw'd.
function useAgentState(): ClawdState {
  const [state, setState] = useState<ClawdState>("idle");
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const r = await fetch("/api/agents/status", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive && typeof j?.state === "string" && (AGENT_STATES as string[]).includes(j.state)) {
          setState(j.state as ClawdState);
        }
      } catch {
        /* keep last */
      }
    }
    tick();
    const t = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return state;
}

function healthRank(c: ClientListItem): number {
  return HEALTH_RANK[c.health?.level ?? ""] ?? 3;
}
function greeting(h: number): string {
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const PANEL = "flex flex-col rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-0)] lg:min-h-0";
const H2 = "flex-none font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-3)]";

export function EdgeBoard() {
  const { data } = useClientList({ status: "ACTIVE" });
  const clients = data?.clients ?? [];
  const ranked = [...clients].sort((a, b) => healthRank(a) - healthRank(b));
  const attention = ranked.filter((c) => c.health?.level === "red" || c.health?.level === "amber");
  const reds = clients.filter((c) => c.health?.level === "red").length;
  const ambers = clients.filter((c) => c.health?.level === "amber").length;
  const onTrack = clients.length - attention.length;

  const attn = useTaskAttention({ mine: true });
  const account = useAccount();
  const firstName = (account.data?.name ?? "").trim().split(" ")[0] || "there";
  const overdue = attn.data?.overdue ?? [];
  const doing = attn.data?.doing ?? [];

  const { actions, save, reset } = useEdgeActions();
  const [editing, setEditing] = useState(false);
  const now = useClock();
  const agentState = useAgentState();

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
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--surface-canvas)] p-3 text-[var(--text-1)]">
      {/* Masthead */}
      <header className="mb-3 flex flex-none items-center justify-between px-1">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[12px] uppercase tracking-[0.2em] text-[var(--accent)]">Foundry</span>
          <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--text-3)]">{"// Mission Control"}</span>
        </div>
        {now && (
          <div className="flex items-baseline gap-4 font-mono text-[var(--text-3)]">
            <span className="text-[12px] uppercase tracking-[0.14em]">
              {now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            </span>
            <span className="text-[18px] font-semibold tabular-nums text-[var(--text-1)]">
              {now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[248px_minmax(0,1fr)_minmax(0,1.3fr)_240px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        {/* Agent — live Claw'd */}
        <section className={PANEL + " p-4"}>
          <h2 className={H2 + " mb-3"}>Agent</h2>
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div
              className="rounded-[20px] border border-[var(--border-2)] p-1.5"
              style={{ background: "#0d0e11", boxShadow: `0 0 50px -8px ${STATE_ACCENT[agentState]}66` }}
            >
              <ClawdSprite state={agentState} size={150} />
            </div>
            <div className="text-center">
              <div className="font-mono text-[14px] font-bold tracking-[0.12em]">CLAW&rsquo;D</div>
              <div
                className="mt-1 inline-block rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                style={{ color: STATE_ACCENT[agentState], borderColor: `${STATE_ACCENT[agentState]}55` }}
              >
                {STATE_LABEL[agentState]}
              </div>
            </div>
          </div>
          <div className="mb-2 mt-4 flex-none font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">Reasoning effort</div>
          <div className="grid flex-none grid-cols-4 gap-2">
            {["Low", "Med", "High", "Max"].map((e, i) => (
              <div
                key={e}
                className={
                  "rounded-[10px] border py-2 text-center font-mono text-[12px] uppercase " +
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

        {/* Project health — attention first, greens collapsed */}
        <section className={PANEL + " overflow-hidden p-4"}>
          <header className="mb-3 flex flex-none items-baseline justify-between gap-2">
            <h2 className={H2}>Project health</h2>
            <span className="font-mono text-[11px]">
              {reds > 0 && <span style={{ color: HEALTH_COLOR.red }}>{reds} red</span>}
              {reds > 0 && ambers > 0 && <span className="text-[var(--text-3)]"> · </span>}
              {ambers > 0 && <span style={{ color: HEALTH_COLOR.amber }}>{ambers} amber</span>}
              {reds === 0 && ambers === 0 && <span style={{ color: HEALTH_COLOR.green }}>all green</span>}
            </span>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {attention.length === 0 && (
              <p className="text-[13px] text-[var(--text-3)]">All active clients on track.</p>
            )}
            {attention.map((c) => {
              const level = c.health?.level ?? "green";
              const color = HEALTH_COLOR[level] ?? HEALTH_COLOR.green;
              const reason = c.health?.reasons?.[0] ?? (c.pulseHealthScore != null ? `Pulse ${c.pulseHealthScore}` : "needs attention");
              return (
                <div key={c.id} className="flex flex-none items-center gap-2.5 rounded-[9px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1.5">
                  <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 7px ${color}` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold leading-tight">{c.name}</span>
                    <span className="block truncate font-mono text-[11px] text-[var(--text-3)]">{reason}</span>
                  </span>
                  <span className="flex-none font-mono text-[11px] text-[var(--text-3)]">{c.devCount ?? 0}d</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex-none border-t border-[var(--border-2)] pt-2 font-mono text-[11px] text-[var(--text-3)]">
            <span style={{ color: HEALTH_COLOR.green }}>●</span> {onTrack} on track · {clients.length} active
          </div>
        </section>

        {/* Today — lean horizontal brief (replaces the heavy On Your Desk) */}
        <section className={PANEL + " overflow-hidden p-4"}>
          <header className="mb-3 flex flex-none items-baseline justify-between gap-2">
            <h2 className={H2}>Today</h2>
            <span className="font-mono text-[11px] text-[var(--text-3)]">
              {now ? now.toLocaleDateString(undefined, { day: "numeric", month: "long" }) : ""}
            </span>
          </header>
          <div className="mb-3 flex-none font-serif text-[22px] leading-tight text-[var(--text-1)]" style={{ fontFamily: "var(--font-display)" }}>
            {now ? greeting(now.getHours()) : "Hello"}, {firstName}.
          </div>
          {/* Stat tiles — horizontal */}
          <div className="mb-3 grid flex-none grid-cols-3 gap-2">
            {[
              { n: attn.data?.overdueCount ?? 0, label: "Overdue", color: HEALTH_COLOR.red },
              { n: attn.data?.doingCount ?? 0, label: "Doing", color: "var(--accent)" },
              { n: attn.data?.dueSoonCount ?? 0, label: "Due soon", color: HEALTH_COLOR.amber },
            ].map((t) => (
              <div key={t.label} className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5">
                <div className="text-[24px] font-bold leading-none tabular-nums" style={{ color: t.color }}>{t.n}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-3)]">{t.label}</div>
              </div>
            ))}
          </div>
          <div className="mb-1.5 flex-none font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">Needs you</div>
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {overdue.length === 0 && doing.length === 0 && (
              <p className="text-[13px] text-[var(--text-3)]">Nothing overdue or in flight. Clear runway.</p>
            )}
            {overdue.slice(0, 6).map((t) => (
              <TaskRow key={t.id} title={t.title} client={t.client.name} tag="overdue" tagColor={HEALTH_COLOR.red} />
            ))}
            {doing.slice(0, Math.max(0, 6 - overdue.length)).map((t) => (
              <TaskRow key={t.id} title={t.title} client={t.client.name} tag="doing" tagColor="var(--accent)" />
            ))}
          </div>
        </section>

        {/* Quick actions — open in NEW windows so the control centre stays put */}
        <section className={PANEL + " overflow-hidden p-4"}>
          <header className="mb-3 flex flex-none items-center justify-between">
            <h2 className={H2}>Quick actions</h2>
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="rounded-[8px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-3)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-1)]"
            >
              {editing ? "Done" : "Edit"}
            </button>
          </header>

          {!editing && (
            <div className="grid flex-1 grid-cols-2 content-start gap-2.5 overflow-y-auto">
              {actions.map((a, i) => (
                <a
                  key={`${a.label}-${i}`}
                  href={a.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-[58px] items-center justify-center rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2 text-center text-[14px] font-semibold transition-colors hover:border-[var(--accent)]"
                >
                  {a.label}
                </a>
              ))}
              {actions.length === 0 && <p className="col-span-2 text-[13px] text-[var(--text-3)]">No actions — press Edit.</p>}
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
                    <input value={a.label} onChange={(e) => updateAction(i, { label: e.target.value })} placeholder="Label" className="w-full rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1.5 text-[13px] font-semibold outline-none focus:border-[var(--accent)]" />
                    <input value={a.href} onChange={(e) => updateAction(i, { href: e.target.value })} placeholder="/app/... or https://..." className="w-full rounded-[7px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1.5 font-mono text-[11px] text-[var(--text-3)] outline-none focus:border-[var(--accent)]" />
                  </div>
                  <button type="button" onClick={() => removeAction(i)} aria-label="Remove action" className="flex-none rounded-[7px] border border-[var(--border-2)] px-2 py-1 text-[13px] text-[var(--text-3)] transition-colors hover:border-[#e56a6a] hover:text-[#e56a6a]">✕</button>
                </div>
              ))}
              <div className="mt-1 flex flex-none items-center justify-between gap-2">
                <button type="button" onClick={addAction} className="rounded-[9px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-1.5 text-[12px] font-semibold transition-colors hover:border-[var(--accent)]">+ Add action</button>
                <button type="button" onClick={reset} className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-3)] underline decoration-dotted underline-offset-2 hover:text-[var(--text-1)]">Reset</button>
              </div>
              <p className="mt-1 flex-none font-mono text-[10px] leading-relaxed text-[var(--text-3)]">Opens in a new window, so this board stays put. Use <span className="text-[var(--text-1)]">/app/…</span> or a full <span className="text-[var(--text-1)]">https://…</span> link.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TaskRow({ title, client, tag, tagColor }: { title: string; client: string; tag: string; tagColor: string }) {
  return (
    <div className="flex flex-none items-center gap-2.5 rounded-[9px] border border-[var(--border-2)] bg-[var(--surface-1)] px-2.5 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight">{title}</span>
        <span className="block truncate font-mono text-[11px] text-[var(--text-3)]">{client}</span>
      </span>
      <span className="flex-none rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: tagColor, border: `1px solid ${tagColor}55` }}>{tag}</span>
    </div>
  );
}
