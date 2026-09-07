"use client";

import { ArrowPathIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type { ClientQueueSummary, SupportClient } from "@/types/support";
import { useSupportClients, useClientQueueSummaries, useSyncSupportClient } from "@/hooks/use-support";
import { formatAge, isLongWait } from "./care-constants";
import { CareEmpty, CarePanel, CareStat } from "./care-panel";

/**
 * Care home — one row per client, worst-off first, answering one question: which client is being
 * let down right now?
 *
 * Two things it no longer does. It doesn't render its own `<h1>Care</h1>` — AppShell already puts
 * that at the top of the page, so the title appeared twice. And it doesn't fetch counts per row:
 * one workspace-wide roll-up (useClientQueueSummaries) replaces ~10 indexed COUNTs per client, so
 * the figures arrive together instead of cascading in and the page costs the same with 3 clients or
 * 30.
 */
function ClientRow({
  client,
  summary,
  loading,
  onOpen,
}: {
  client: SupportClient;
  summary?: ClientQueueSummary;
  loading: boolean;
  onOpen: () => void;
}) {
  const sync = useSyncSupportClient(client.id);

  const awaiting = summary?.awaiting ?? 0;
  const oldest = summary?.oldestAwaitingAt ?? null;
  const stale = oldest ? isLongWait(oldest) : false;
  const urgent = summary?.urgent ?? 0;

  return (
    <div
      className={cn(
        "group flex items-center gap-4 border-b border-[var(--border-3)] transition last:border-b-0 hover:bg-[var(--surface-1)]",
        // The one structural signal: a client with someone waiting too long is marked down the left
        // edge, so triage order is legible before you read a single number.
        stale ? "border-l-2 border-l-[var(--warning-500)]" : "border-l-2 border-l-transparent",
      )}
    >
      {/*
        The row is a real <button>, not a div with role="button" wrapping another button. Nesting an
        interactive element inside one is invalid, and the sync icon inside it was unreachable by
        keyboard. The button covers the row's content; Sync sits outside it as a sibling.
      */}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left"
      >
        <div className="w-12 shrink-0 text-right">
          <div
            className={cn(
              "font-[family-name:var(--font-display)] text-[28px] leading-none",
              awaiting > 0 ? "text-[var(--warning-500)]" : "text-[var(--text-4)]",
            )}
          >
            {loading ? "·" : awaiting}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-[var(--text-1)]">{client.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 widget-data-label">
            <span>{loading ? "Loading…" : awaiting > 0 ? "Awaiting reply" : "All replied"}</span>
            {oldest && (
              <>
                <span className="text-[var(--border-1)]">·</span>
                <span className={cn(stale && "font-semibold text-[var(--warning-500)]")}>
                  Longest wait {formatAge(oldest)}
                </span>
              </>
            )}
            {urgent > 0 && (
              <>
                <span className="text-[var(--border-1)]">·</span>
                <span className="font-semibold text-[var(--danger-500)]">{urgent} urgent</span>
              </>
            )}
          </div>
        </div>

        {/* Context, not a call to action — mono and quiet so the headline figure stays the signal. */}
        <div className="hidden shrink-0 items-center gap-6 sm:flex">
          {[
            { label: "Unassigned", value: summary?.unassigned },
            { label: "Replied", value: summary?.replied },
            { label: "Open", value: summary?.open },
          ].map((s) => (
            <div key={s.label} className="text-right">
              <div className="font-mono text-[13px] text-[var(--text-2)]">{s.value ?? "—"}</div>
              <div className="widget-data-label">{s.label}</div>
            </div>
          ))}
        </div>
      </button>

      <button
        type="button"
        onClick={() => sync.mutate()}
        disabled={sync.isPending}
        title={`Sync ${client.name} now`}
        aria-label={`Sync ${client.name} now`}
        className="mr-3 shrink-0 rounded-[6px] p-1.5 text-[var(--text-4)] opacity-0 transition hover:bg-[var(--surface-2)] hover:text-[var(--text-2)] focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
      >
        <ArrowPathIcon className={cn("h-4 w-4", sync.isPending && "animate-spin")} />
      </button>
    </div>
  );
}

export function CareHome({ onSelectClient }: { onSelectClient: (client: SupportClient) => void }) {
  const clientsQ = useSupportClients();
  const summariesQ = useClientQueueSummaries();
  const clients = clientsQ.data?.clients ?? [];
  const summaries = summariesQ.data?.summaries ?? {};

  // Worst first. A dashboard that lists clients alphabetically makes you do the triage it exists to
  // do for you: longest wait wins, then most waiting, then name for a stable order.
  const ordered = [...clients].sort((a, b) => {
    const sa = summaries[a.id];
    const sb = summaries[b.id];
    const oa = sa?.oldestAwaitingAt ? Date.parse(sa.oldestAwaitingAt) : Infinity;
    const ob = sb?.oldestAwaitingAt ? Date.parse(sb.oldestAwaitingAt) : Infinity;
    if (oa !== ob) return oa - ob;
    if ((sb?.awaiting ?? 0) !== (sa?.awaiting ?? 0)) return (sb?.awaiting ?? 0) - (sa?.awaiting ?? 0);
    return a.name.localeCompare(b.name);
  });

  const totals = Object.values(summaries).reduce(
    (acc, s) => ({
      awaiting: acc.awaiting + s.awaiting,
      urgent: acc.urgent + s.urgent,
      unassigned: acc.unassigned + s.unassigned,
    }),
    { awaiting: 0, urgent: 0, unassigned: 0 },
  );
  const clientsWaiting = Object.values(summaries).filter((s) => s.awaiting > 0).length;
  const loading = clientsQ.isLoading || summariesQ.isLoading;

  return (
    <div className="mx-auto h-full w-full max-w-5xl overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      <div className="space-y-4">
        {/* Across every client, before you pick one — so "is anything on fire?" is answered on
            arrival rather than by opening each client in turn. */}
        <CarePanel
          number="01"
          title="Across all clients"
          right={clients.length > 0 ? `${clientsWaiting}/${clients.length} WAITING` : undefined}
        >
          <div className="grid grid-cols-3 gap-4">
            <CareStat
              value={loading ? "·" : totals.awaiting}
              label="Awaiting reply"
              size="lg"
              tone={totals.awaiting > 0 ? "attention" : "muted"}
            />
            <CareStat
              value={loading ? "·" : totals.unassigned}
              label="Unassigned"
              size="lg"
              tone={totals.unassigned > 0 ? "default" : "muted"}
            />
            <CareStat
              value={loading ? "·" : totals.urgent}
              label="Urgent"
              size="lg"
              tone={totals.urgent > 0 ? "critical" : "muted"}
            />
          </div>
        </CarePanel>

        <CarePanel number="02" title="Clients" right={clients.length ? String(clients.length) : undefined} flush>
          {loading && <p className="px-4 py-6 text-sm text-[var(--text-4)]">Loading clients…</p>}

          {!loading && clients.length === 0 && (
            <CareEmpty
              headline="No clients in Care yet."
              body="Connect a client's support channels — a mailbox, Discord, app reviews — and their conversations land here."
            />
          )}

          {!loading &&
            ordered.map((c) => (
              <ClientRow
                key={c.id}
                client={c}
                summary={summaries[c.id]}
                loading={summariesQ.isLoading}
                onOpen={() => onSelectClient(c)}
              />
            ))}
        </CarePanel>

        {!loading && clients.length > 0 && totals.awaiting === 0 && (
          <CarePanel number="03" title="Status">
            <div className="flex items-center gap-3">
              <ChatBubbleLeftRightIcon className="h-5 w-5 shrink-0 text-[var(--success-500)]" />
              <p className="text-[13px] text-[var(--text-2)]">
                Every customer has been answered. Nothing is waiting on the team.
              </p>
            </div>
          </CarePanel>
        )}
      </div>
    </div>
  );
}
