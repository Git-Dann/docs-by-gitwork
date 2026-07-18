"use client";

import { useMemo } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type { SupportClient, ConversationStatus } from "@/types/support";
import { useSupportClients, useSupportConversations, useSyncSupportClient } from "@/hooks/use-support";
import { formatAge, STATUS_TONE, STATUS_LABEL } from "./care-constants";

// Statuses shown on the overview breakdown, in workflow order.
const OVERVIEW_STATUSES: ConversationStatus[] = ["new", "open", "snoozed", "closed"];

function ClientCard({ client, onOpen }: { client: SupportClient; onOpen: () => void }) {
  const convsQ = useSupportConversations(client.id);
  const sync = useSyncSupportClient(client.id);

  const stats = useMemo(() => {
    const convs = convsQ.data?.conversations ?? [];
    const active = convs.filter((c) => c.status === "new" || c.status === "open");
    const urgent = active.filter((c) => c.priority === "urgent");
    const oldest = active.reduce<string | null>(
      (acc, c) => (!acc || new Date(c.receivedAt) < new Date(acc) ? c.receivedAt : acc),
      null,
    );
    const byStatus = {} as Record<ConversationStatus, number>;
    for (const c of convs) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    return { needsAction: active.length, urgent: urgent.length, oldest, byStatus };
  }, [convsQ.data]);

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
          <div className={cn("font-[var(--font-display)] text-3xl leading-none", stats.needsAction > 0 ? "text-[var(--text-1)]" : "text-[var(--text-4)]")}>
            {stats.needsAction}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">Needs action</div>
        </div>
        <div>
          <div className={cn("font-[var(--font-display)] text-3xl leading-none", stats.urgent > 0 ? "text-red-600" : "text-[var(--text-4)]")}>
            {stats.urgent}
          </div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">Urgent</div>
        </div>
      </div>
      {/* All-status breakdown — colour-coded so the overview monitors every status, not just
          "needs action". Only non-zero statuses render. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {OVERVIEW_STATUSES.filter((s) => (stats.byStatus[s] ?? 0) > 0).map((s) => (
          <span key={s} className={cn("rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium", STATUS_TONE[s])}>
            {stats.byStatus[s]} {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
      <div className="mt-2 font-mono text-[11px] text-[var(--text-4)]">
        {stats.oldest ? `Oldest unactioned ${formatAge(stats.oldest)} ago` : convsQ.isLoading ? "Loading…" : "All clear"}
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
