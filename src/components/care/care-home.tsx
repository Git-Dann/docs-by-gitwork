"use client";

import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type { SupportClient } from "@/types/support";
import { useSupportClients, useSupportConversationCounts, useSyncSupportClient } from "@/hooks/use-support";
import { formatAge, isLongWait } from "./care-constants";

/**
 * Care home — one row per client, ordered so the worst-off client is impossible to miss.
 *
 * It was a grid of equal-weight cards, each with two big numbers and a row of status chips, and
 * it fetched up to 100 conversation rows PER CLIENT just to tally them client-side. Nothing on
 * it answered the only question this page exists for: **which client is being let down right
 * now?** Cards in a grid are all the same size whether a client has 0 waiting or 226.
 *
 * A row list sorted by longest wait answers it in one glance, shows more clients per screen, and
 * costs a handful of indexed COUNTs instead of thousands of rows.
 */
function ClientRow({ client, onOpen }: { client: SupportClient; onOpen: () => void }) {
  const countsQ = useSupportConversationCounts(client.id);
  const sync = useSyncSupportClient(client.id);
  const counts = countsQ.data?.counts;

  const awaiting = counts?.awaiting ?? 0;
  const oldest = counts?.oldestAwaitingAt ?? null;
  const stale = oldest ? isLongWait(oldest) : false;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); }
      }}
      className={cn(
        "group flex cursor-pointer items-center gap-4 border-b border-[var(--border-2)] px-4 py-3 transition hover:bg-[var(--surface-1)]",
        // The one structural signal: a client with people waiting too long is marked down the
        // left edge, so triage order is legible without reading a single number.
        stale ? "border-l-2 border-l-amber-400" : "border-l-2 border-l-transparent",
      )}
    >
      {/* Headline figure — DM Serif per DESIGN.md's stat grammar, muted at zero so a healthy
          client recedes instead of competing with one that needs attention. */}
      <div className="w-14 shrink-0 text-right">
        <div
          className={cn(
            "font-[var(--font-display)] text-[28px] leading-none",
            awaiting > 0 ? "text-amber-600" : "text-[var(--text-4)]",
          )}
        >
          {countsQ.isLoading ? "·" : awaiting}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold text-[var(--text-1)]">{client.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">
          <span>{countsQ.isLoading ? "Loading…" : awaiting > 0 ? "Awaiting reply" : "All replied"}</span>
          {oldest && (
            <>
              <span className="text-[var(--border-1)]">·</span>
              <span className={cn(stale && "font-semibold text-amber-600")}>Longest wait {formatAge(oldest)}</span>
            </>
          )}
          {(counts?.urgent ?? 0) > 0 && (
            <>
              <span className="text-[var(--border-1)]">·</span>
              <span className="font-semibold text-red-600">{counts?.urgent} urgent</span>
            </>
          )}
        </div>
      </div>

      {/* Secondary figures stay quiet — they are context, not a call to action. */}
      <div className="hidden shrink-0 items-center gap-5 sm:flex">
        {[
          { label: "Unassigned", value: counts?.unassigned },
          { label: "Replied", value: counts?.replied },
          { label: "Open", value: counts?.open },
        ].map((s) => (
          <div key={s.label} className="text-right">
            <div className="font-mono text-[13px] text-[var(--text-2)]">{s.value ?? "—"}</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.6px] text-[var(--text-4)]">{s.label}</div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); sync.mutate(); }}
        disabled={sync.isPending}
        title="Sync now"
        className="shrink-0 rounded-[6px] p-1.5 text-[var(--text-4)] opacity-0 transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)] focus:opacity-100 group-hover:opacity-100 disabled:opacity-50"
      >
        <ArrowPathIcon className={cn("h-4 w-4", sync.isPending && "animate-spin")} />
      </button>
    </div>
  );
}

export function CareHome({ onSelectClient }: { onSelectClient: (client: SupportClient) => void }) {
  const clientsQ = useSupportClients();
  const clients = clientsQ.data?.clients ?? [];

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-[var(--text-1)]">Care</h1>
        <p className="mt-1 text-[13px] text-[var(--text-3)]">
          Every client channel in one queue. Pick a client to start clearing it.
        </p>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)]">
        <div className="flex items-center justify-between border-b border-[var(--border-2)] px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-[var(--text-4)]">01 // Clients</span>
          <span className="font-mono text-[11px] text-[var(--text-4)]">{clients.length}</span>
        </div>

        {clientsQ.isLoading && <p className="px-4 py-6 text-sm text-[var(--text-4)]">Loading clients…</p>}
        {!clientsQ.isLoading && clients.length === 0 && (
          <p className="px-4 py-6 text-sm text-[var(--text-4)]">
            No support clients yet. Add one from the legacy dashboard at /app/support.
          </p>
        )}
        {clients.map((c) => (
          <ClientRow key={c.id} client={c} onOpen={() => onSelectClient(c)} />
        ))}
      </div>
    </div>
  );
}
