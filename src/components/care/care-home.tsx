"use client";

import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type { SupportClient, ConversationViewCounts } from "@/types/support";
import { useSupportClients, useSupportConversationCounts, useSyncSupportClient } from "@/hooks/use-support";
import { formatAge } from "./care-constants";

// The overview breakdown, in workflow order. Each reads a true server-side total.
const OVERVIEW_ROWS: Array<{ key: keyof ConversationViewCounts; label: string; tone: string }> = [
  { key: "replied", label: "Replied", tone: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  { key: "snoozed", label: "Snoozed", tone: "bg-purple-50 text-purple-700 border border-purple-200" },
  { key: "closed", label: "Closed", tone: "bg-[var(--surface-1)] text-[var(--text-4)] border border-[var(--border-2)]" },
];

function ClientCard({ client, onOpen }: { client: SupportClient; onOpen: () => void }) {
  // Counts, not conversations. This card used to pull a page of up to 100 conversation rows per
  // client purely to tally them — N clients × 100 rows on every visit to Care home, and the
  // totals were still capped at the page size. These are server-side COUNTs over everything.
  const countsQ = useSupportConversationCounts(client.id);
  const sync = useSyncSupportClient(client.id);
  const counts = countsQ.data?.counts;

  return (
    <button
      onClick={onOpen}
      className="flex flex-col items-start rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4 text-left transition hover:border-[var(--brand-400)]"
    >
      <div className="flex w-full items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-[var(--text-4)]">Client</span>
        <span
          onClick={(e) => { e.stopPropagation(); sync.mutate(); }}
          className="rounded-[6px] p-1 text-[var(--text-4)] hover:bg-[var(--surface-1)]"
          title="Sync now"
        >
          <ArrowPathIcon className={cn("h-3.5 w-3.5", sync.isPending && "animate-spin")} />
        </span>
      </div>
      <h3 className="mt-1 text-base font-semibold text-[var(--text-1)]">{client.name}</h3>
      <div className="mt-3 flex items-end gap-5">
        <div>
          <div className={cn("font-[var(--font-display)] text-3xl leading-none", (counts?.awaiting ?? 0) > 0 ? "text-amber-600" : "text-[var(--text-4)]")}>
            {counts?.awaiting ?? "—"}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">Awaiting reply</div>
        </div>
        <div>
          <div className={cn("font-[var(--font-display)] text-3xl leading-none", (counts?.urgent ?? 0) > 0 ? "text-red-600" : "text-[var(--text-4)]")}>
            {counts?.urgent ?? "—"}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">Urgent</div>
        </div>
      </div>
      {/* Breakdown of everything that is NOT awaiting a reply, so the headline number stays the
          one call to action. Only non-zero rows render. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {OVERVIEW_ROWS.filter((r) => ((counts?.[r.key] as number) ?? 0) > 0).map((r) => (
          <span key={r.key} className={cn("rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium", r.tone)}>
            {counts?.[r.key] as number} {r.label}
          </span>
        ))}
      </div>
      <div className="mt-2 font-mono text-[11px] text-[var(--text-4)]">
        {countsQ.isLoading
          ? "Loading…"
          : counts?.oldestAwaitingAt
            ? `Longest wait ${formatAge(counts.oldestAwaitingAt)}`
            : "All replied"}
      </div>
    </button>
  );
}

export function CareHome({ onSelectClient }: { onSelectClient: (client: SupportClient) => void }) {
  const clientsQ = useSupportClients();
  const clients = clientsQ.data?.clients ?? [];

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-[var(--text-1)]">Care</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">
          Monitor, triage and route support across every client channel. Replies happen in the native channel —
          here you handle and action.
        </p>
      </div>

      {clientsQ.isLoading && <p className="text-sm text-[var(--text-4)]">Loading clients…</p>}
      {!clientsQ.isLoading && clients.length === 0 && (
        <p className="text-sm text-[var(--text-4)]">No support clients yet. Add one from the legacy dashboard at /app/support.</p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((c) => (
          <ClientCard key={c.id} client={c} onOpen={() => onSelectClient(c)} />
        ))}
      </div>
    </div>
  );
}
