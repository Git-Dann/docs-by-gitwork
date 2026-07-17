"use client";

import Link from "next/link";
import { DeskToday } from "@/components/desk/desk-today";
import { useClientList } from "@/hooks/use-proposals";
import type { ClientListItem } from "@/types/client";

// Mission Control wall view. Reuses the real "On Your Desk" (DeskToday) verbatim in the
// centre column, with cross-client project health beside it and a quick-actions rail.
// Everything runs in the logged-in session, so nothing is gated — no tokens, no bridge.

const HEALTH_COLOR: Record<string, string> = { green: "#1f9d57", amber: "#d98226", red: "#d24444" };
const HEALTH_RANK: Record<string, number> = { red: 0, amber: 1, green: 2 };

const ACTIONS: { label: string; href: string }[] = [
  { label: "Foundry", href: "/app" },
  { label: "Pulse", href: "/app/pulse" },
  { label: "Analytics", href: "/app/docs/analytics" },
  { label: "Docs", href: "/app/docs" },
  { label: "Portal", href: "/app/portal" },
  { label: "Care", href: "/app/support" },
];

function healthRank(c: ClientListItem): number {
  return HEALTH_RANK[c.health?.level ?? ""] ?? 3;
}

export function MissionWall() {
  const { data } = useClientList({ status: "ACTIVE" });
  const clients = data?.clients ?? [];
  const ranked = [...clients].sort((a, b) => healthRank(a) - healthRank(b));
  const reds = clients.filter((c) => c.health?.level === "red").length;
  const ambers = clients.filter((c) => c.health?.level === "amber").length;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(180px,0.6fr)_minmax(260px,0.8fr)_minmax(0,1.4fr)_minmax(200px,0.6fr)]">
      {/* Agent — Claw'd placeholder for layout. The live animated Claw'd lives on the
          Stream Deck (it's Anthropic's mascot, not shipped in-product; and an HTTPS
          page can't reach the local bridge). This slot just shows where it sits. */}
      <section className="flex flex-col rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-3)]">Agent</h2>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <div
            className="flex h-[150px] w-[150px] items-center justify-center rounded-[18px]"
            style={{ background: "#0e0f12", boxShadow: "0 0 44px -10px rgba(224,87,64,.55)" }}
          >
            <span style={{ fontSize: "84px", lineHeight: 1 }} role="img" aria-label="Claw'd placeholder">🦀</span>
          </div>
          <div className="font-mono text-[13px] font-bold tracking-[0.1em] text-[var(--text-1)]">CLAW&rsquo;D</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">placeholder · lives on the deck</div>
        </div>
        <div className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-3)]">Reasoning effort</div>
        <div className="grid grid-cols-4 gap-2">
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
      <section className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-3)]">Project health</h2>
          <span className="font-mono text-[11px] text-[var(--text-3)]">
            {reds ? `${reds} red` : ""}{reds && ambers ? " · " : ""}{ambers ? `${ambers} amber` : ""}{!reds && !ambers ? "all green" : ""}
          </span>
        </header>
        <div className="flex flex-col gap-2">
          {ranked.length === 0 && <p className="text-sm text-[var(--text-3)]">No active clients.</p>}
          {ranked.map((c) => {
            const level = c.health?.level ?? null;
            const reason = c.health?.reasons?.[0] ?? (c.pulseHealthScore != null ? `Pulse ${c.pulseHealthScore}` : "on track");
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-1)] px-3 py-2.5">
                <span
                  className="h-3 w-3 flex-none rounded-full"
                  style={{ backgroundColor: level ? HEALTH_COLOR[level] : HEALTH_COLOR.green, boxShadow: `0 0 8px ${level ? HEALTH_COLOR[level] : HEALTH_COLOR.green}` }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-[var(--text-1)]">{c.name}</span>
                  <span className="block truncate font-mono text-[12px] text-[var(--text-3)]">{reason}</span>
                </span>
                <span className="flex-none font-mono text-[12px] text-[var(--text-3)]">{c.devCount ?? 0} dev</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* On Your Desk — the real thing */}
      <section className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-0)] p-5">
        <DeskToday />
      </section>

      {/* Quick actions */}
      <section className="rounded-[14px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--text-3)]">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {ACTIONS.map((a) => (
            <Link
              key={a.label}
              href={a.href}
              className="flex min-h-[64px] items-center justify-center rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-1)] text-[15px] font-semibold text-[var(--text-1)] transition-colors hover:border-[var(--accent)]"
            >
              {a.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
