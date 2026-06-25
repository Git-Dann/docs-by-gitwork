"use client";

import { useMemo, useState, useDeferredValue } from "react";
import { ArrowPathIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type { Conversation, SupportClient } from "@/types/support";
import {
  useSupportConversations,
  useSupportConnections,
  useSupportMembers,
  useSyncSupportClient,
  useBatchTriageConversations,
} from "@/hooks/use-support";
import { usePermissions } from "@/hooks/use-permissions";
import {
  SAVED_VIEWS,
  SourceIcon,
  SOURCE_LABEL,
  STATUS_TONE,
  STATUS_LABEL,
  PRIORITY_DOT,
  SENTIMENT_DOT,
  formatAge,
} from "./care-constants";
import { ConversationDetail } from "./conversation-detail";

function ConversationRow({
  conv,
  active,
  selected,
  selectable,
  onOpen,
  onToggleSelect,
  assigneeName,
}: {
  conv: Conversation;
  active: boolean;
  selected: boolean;
  selectable: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  assigneeName?: string;
}) {
  return (
    <div
      className={cn(
        "flex cursor-pointer items-start gap-2.5 border-b border-[var(--border-2)] px-3 py-2.5 transition",
        active ? "bg-[var(--brand-50)]" : "hover:bg-[var(--surface-1)]",
      )}
      onClick={onOpen}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleSelect}
          className="mt-1"
        />
      )}
      <span className={cn("mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[conv.priority])} title={conv.priority} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[var(--text-1)]">
          <SourceIcon source={conv.source} className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
          <span className={cn("truncate text-sm", conv.unread ? "font-semibold" : "font-medium")}>{conv.subject}</span>
        </div>
        <div className="mt-0.5 truncate text-xs text-[var(--text-3)]">{conv.preview || conv.customerLabel}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={cn("rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium", STATUS_TONE[conv.status])}>
            {STATUS_LABEL[conv.status]}
          </span>
          <span className={cn("inline-block h-1.5 w-1.5 rounded-full", SENTIMENT_DOT[conv.sentiment])} />
          {assigneeName && (
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">{assigneeName}</span>
          )}
        </div>
      </div>
      <span className="shrink-0 font-mono text-[11px] text-[var(--text-4)]">{formatAge(conv.receivedAt)}</span>
    </div>
  );
}

export function ClientCockpit({
  client,
  currentUserId,
  onBack,
}: {
  client: SupportClient;
  currentUserId?: string;
  onBack: () => void;
}) {
  const convsQ = useSupportConversations(client.id);
  const connectionsQ = useSupportConnections(client.id);
  const membersQ = useSupportMembers(client.id);
  const sync = useSyncSupportClient(client.id);
  const batch = useBatchTriageConversations(client.id);
  const { canManageSupport } = usePermissions();

  const [activeView, setActiveView] = useState("needs-action");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const conversations = useMemo(() => convsQ.data?.conversations ?? [], [convsQ.data]);
  const members = useMemo(() => membersQ.data?.members ?? [], [membersQ.data]);
  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const view = SAVED_VIEWS.find((v) => v.id === activeView) ?? SAVED_VIEWS[0];

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return conversations.filter((c) => {
      if (!view.predicate(c, currentUserId)) return false;
      if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
      if (q && !(`${c.subject} ${c.preview} ${c.customerLabel}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [conversations, view, sourceFilter, deferredSearch, currentUserId]);

  // View counts (over all conversations, ignoring source/search) for the rail badges.
  const viewCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const v of SAVED_VIEWS) counts[v.id] = conversations.filter((c) => v.predicate(c, currentUserId)).length;
    return counts;
  }, [conversations, currentUserId]);

  const selected = selectedId ? conversations.find((c) => c.id === selectedId) ?? null : null;
  const sources = useMemo(() => Array.from(new Set(conversations.map((c) => c.source))), [conversations]);

  function toggleSelect(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelection(new Set());
  }
  function runBatch(data: Parameters<typeof batch.mutate>[0]["data"]) {
    batch.mutate({ conversationIds: [...selection], data }, { onSuccess: clearSelection });
  }

  return (
    <div className="flex h-full min-h-0">
      {/* LEFT — saved views (rail on lg+; below that it collapses into the list header) */}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-[var(--border-2)] lg:flex">
        <div className="flex items-center gap-2 border-b border-[var(--border-2)] px-3 py-3">
          <button onClick={onBack} className="rounded-[6px] p-1 hover:bg-[var(--surface-1)]" title="All clients">
            <ArrowLeftIcon className="h-4 w-4 text-[var(--text-3)]" />
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--text-1)]">{client.name}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">Cockpit</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[1.2px] text-[var(--text-4)]">01 // Views</div>
          {SAVED_VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setActiveView(v.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-sm transition",
                activeView === v.id ? "bg-[var(--brand-50)] font-medium text-[var(--brand-700)]" : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
              )}
            >
              <span>{v.label}</span>
              <span className="font-mono text-[11px] text-[var(--text-4)]">{viewCounts[v.id] ?? 0}</span>
            </button>
          ))}
        </nav>
        <div className="border-t border-[var(--border-2)] p-2">
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-[var(--border-2)] px-2 py-2 text-xs font-medium hover:bg-[var(--surface-1)] disabled:opacity-60"
          >
            <ArrowPathIcon className={cn("h-3.5 w-3.5", sync.isPending && "animate-spin")} />
            {sync.isPending ? "Syncing…" : "Sync now"}
          </button>
          <a
            href="/app/support"
            className="mt-1.5 block rounded-[6px] px-2 py-1.5 text-center text-[11px] text-[var(--text-4)] hover:bg-[var(--surface-1)]"
          >
            Connectors & reports →
          </a>
        </div>
      </aside>

      {/* MIDDLE — conversation list. Full-width on small screens; fixed rail on lg+.
          Hidden on small screens while a conversation is open (single-pane master-detail). */}
      <section
        className={cn(
          "min-h-0 w-full flex-col border-r border-[var(--border-2)] lg:flex lg:w-80 lg:shrink-0 xl:w-96",
          selected ? "hidden lg:flex" : "flex",
        )}
      >
        {/* Mobile toolbar — the views rail is hidden < lg, so surface its controls here. */}
        <div className="flex items-center gap-2 border-b border-[var(--border-2)] px-3 py-2 lg:hidden">
          <button onClick={onBack} className="rounded-[6px] p-1 hover:bg-[var(--surface-1)]" title="All clients">
            <ArrowLeftIcon className="h-4 w-4 text-[var(--text-3)]" />
          </button>
          <span className="truncate text-sm font-semibold text-[var(--text-1)]">{client.name}</span>
          <select
            value={activeView}
            onChange={(e) => setActiveView(e.target.value)}
            className="ml-auto rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-1.5 py-1 text-xs"
          >
            {SAVED_VIEWS.map((v) => (
              <option key={v.id} value={v.id}>{v.label} ({viewCounts[v.id] ?? 0})</option>
            ))}
          </select>
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="rounded-[6px] p-1 hover:bg-[var(--surface-1)] disabled:opacity-60"
            title="Sync now"
          >
            <ArrowPathIcon className={cn("h-4 w-4 text-[var(--text-3)]", sync.isPending && "animate-spin")} />
          </button>
        </div>
        <div className="flex items-center justify-between border-b border-[var(--border-2)] px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[1.2px] text-[var(--text-4)]">02 // Conversations</span>
          <span className="font-mono text-[11px] text-[var(--text-4)]">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2 border-b border-[var(--border-2)] px-3 py-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="min-w-0 flex-1 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1 text-sm"
          />
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-1.5 py-1 text-xs"
          >
            <option value="all">All channels</option>
            {sources.map((s) => (
              <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
            ))}
          </select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {convsQ.isLoading && <p className="px-3 py-4 text-sm text-[var(--text-4)]">Loading…</p>}
          {!convsQ.isLoading && filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-[var(--text-4)]">Nothing here. Try another view or Sync now.</p>
          )}
          {filtered.map((c) => (
            <ConversationRow
              key={c.id}
              conv={c}
              active={c.id === selectedId}
              selected={selection.has(c.id)}
              selectable={canManageSupport}
              onOpen={() => setSelectedId(c.id)}
              onToggleSelect={() => toggleSelect(c.id)}
              assigneeName={c.assigneeId ? memberName.get(c.assigneeId) : undefined}
            />
          ))}
        </div>

        {/* Bulk action bar */}
        {selection.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 shadow-lg">
            <span className="font-mono text-[11px] text-[var(--text-3)]">{selection.size} selected</span>
            <select
              onChange={(e) => e.target.value && runBatch({ status: e.target.value })}
              defaultValue=""
              className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-1.5 py-1 text-xs"
            >
              <option value="" disabled>Status…</option>
              {(["open", "snoozed", "closed", "ignored"] as const).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <select
              onChange={(e) => e.target.value && runBatch({ assigneeId: e.target.value === "none" ? null : e.target.value })}
              defaultValue=""
              className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-1.5 py-1 text-xs"
            >
              <option value="" disabled>Assign…</option>
              <option value="none">Unassign</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <button onClick={clearSelection} className="ml-auto text-[11px] text-[var(--text-4)] hover:text-[var(--text-2)]">
              Clear
            </button>
          </div>
        )}
      </section>

      {/* RIGHT — detail. Full-screen on small screens (only when a conversation is open);
          always present on lg+. */}
      <section className={cn("min-w-0 flex-1", selected ? "flex" : "hidden lg:flex")}>
        {selected ? (
          <ConversationDetail
            key={selected.id}
            clientId={client.id}
            conversation={selected}
            connections={connectionsQ.data?.connections ?? []}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-[var(--text-4)]">
            Select a conversation to triage.
          </div>
        )}
      </section>
    </div>
  );
}
