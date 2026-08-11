"use client";

import { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { ArrowPathIcon, ArrowLeftIcon, Cog8ToothIcon, DocumentChartBarIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type { Conversation, ConversationViewCounts, SupportClient } from "@/types/support";
import {
  useSupportConversationsPaged,
  useSupportConversationCounts,
  useSupportConnections,
  useSupportMembers,
  useSyncSupportClient,
  useBatchTriageConversations,
  useMarkConversationRead,
  useCloseConversation,
  useSnoozeConversation,
  useUpdateSupportClient,
} from "@/hooks/use-support";
import { usePermissions } from "@/hooks/use-permissions";
import {
  SAVED_VIEWS,
  VIEW_GROUPS,
  DEFAULT_VIEW_ID,
  SourceIcon,
  SOURCE_LABEL,
  STATUS_LABEL,
  formatAge,
  initialsOf,
  isLongWait,
  lastActivityAt,
  rowState,
  waitingSince,
} from "./care-constants";
import { ConversationDetail } from "./conversation-detail";
import { ConnectorsView } from "@/components/support/support-dashboard";

// One page. Small on purpose: because the views are server-side filters, 50 rows is 50 rows of
// the thing you asked for, and "Load more" walks the rest.
const PAGE_SIZE = 50;

/**
 * What the right-hand 60% of the screen shows when nothing is open.
 *
 * It said "Select a conversation to triage." — an instruction, occupying the largest area on the
 * page, telling you to do the thing you were obviously about to do. It is the natural home for
 * the state of the queue: how much is waiting, how long the worst one has waited, and one button
 * that starts you on it.
 */
function QueueOverview({
  counts,
  loading,
  nextUp,
  onOpen,
  onStart,
}: {
  counts?: ConversationViewCounts;
  loading: boolean;
  /** The longest-waiting few, so the pane is a place to start work rather than a status card. */
  nextUp: Conversation[];
  onOpen: (c: Conversation) => void;
  onStart: () => void;
}) {
  if (loading || !counts) {
    return <div className="flex h-full w-full items-center justify-center text-sm text-[var(--text-4)]">Loading queue…</div>;
  }

  const clear = counts.awaiting === 0;
  const stats: Array<{ label: string; value: number | string; tone?: string }> = [
    { label: "Awaiting reply", value: counts.awaiting, tone: counts.awaiting > 0 ? "text-amber-600" : undefined },
    { label: "Unassigned", value: counts.unassigned },
    { label: "Urgent", value: counts.urgent, tone: counts.urgent > 0 ? "text-red-600" : undefined },
    { label: "Replied", value: counts.replied, tone: "text-emerald-600" },
  ];

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto p-8">
      <div className="w-full max-w-md">
        <div className="font-mono text-[10px] uppercase tracking-[1.2px] text-[var(--text-4)]">Queue</div>
        <h2 className="mt-1 text-[22px] font-semibold leading-snug text-[var(--text-1)]">
          {clear ? "Everything has been answered." : `${counts.awaiting} waiting on a reply`}
        </h2>
        {counts.oldestAwaitingAt && (
          <p className="mt-1 text-[13px] text-[var(--text-3)]">
            The longest has been waiting{" "}
            <span className={cn(isLongWait(counts.oldestAwaitingAt) && "font-semibold text-amber-700")}>
              {formatAge(counts.oldestAwaitingAt)}
            </span>
            .
          </p>
        )}

        {/* Stat figures in DM Serif Display + mono unit labels, per DESIGN.md's stat grammar. */}
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[var(--border-2)] pt-5">
          {stats.map((s) => (
            <div key={s.label}>
              <div
                className={cn(
                  "font-[var(--font-display)] text-[32px] leading-none",
                  s.tone ?? "text-[var(--text-1)]",
                  s.value === 0 && !s.tone && "text-[var(--text-4)]",
                )}
              >
                {s.value}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">{s.label}</div>
            </div>
          ))}
        </div>

        {!clear && (
          <button
            type="button"
            onClick={onStart}
            className="mt-6 w-full rounded-[6px] bg-[var(--brand-700)] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-800)]"
          >
            Start with the longest wait
          </button>
        )}

        {/* Next up — the pane is otherwise a status card floating in a very large empty area.
            These are the actual longest waits, one click each, so the space does work. */}
        {nextUp.length > 0 && (
          <div className="mt-6 border-t border-[var(--border-2)] pt-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[1.2px] text-[var(--text-4)]">Next up</div>
            <div className="overflow-hidden rounded-[8px] border border-[var(--border-2)]">
              {nextUp.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpen(c)}
                  className="flex w-full items-center gap-3 border-b border-[var(--border-2)] px-3 py-2 text-left transition last:border-b-0 hover:bg-[var(--surface-1)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-[var(--text-1)]">{c.customerLabel}</span>
                    <span className="block truncate text-[12px] text-[var(--text-4)]">{c.preview || c.subject}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[11px]",
                      c.lastInboundAt && isLongWait(c.lastInboundAt) ? "font-semibold text-amber-600" : "text-[var(--text-4)]",
                    )}
                  >
                    {formatAge(lastActivityAt(c))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mt-4 text-center font-mono text-[10px] tracking-[0.4px] text-[var(--text-4)]">
          <Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>↵</Kbd> open · <Kbd>E</Kbd> close · <Kbd>S</Kbd> snooze
        </p>
      </div>
    </div>
  );
}

/** A key cap. 3px radius per DESIGN.md's micro-control scale — full radius is status dots only. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[3px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1 font-mono text-[10px] text-[var(--text-3)]">
      {children}
    </kbd>
  );
}

function ConversationRow({
  conv,
  active,
  focused,
  selected,
  selectable,
  showState,
  onOpen,
  onToggleSelect,
  assigneeName,
}: {
  conv: Conversation;
  active: boolean;
  /** Keyboard cursor. Distinct from `active` (opened) so j/k can move without loading a thread. */
  focused: boolean;
  selected: boolean;
  selectable: boolean;
  /**
   * False when the current view already filters to this state — in "Awaiting reply" every row is
   * awaiting, so stamping NEEDS REPLY on all 226 of them is 226 repetitions of the view's own
   * name. A signal that is constant within a view carries no information there; suppressing it
   * is what lets the eye reach the content.
   */
  showState: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  assigneeName?: string;
}) {
  const awaiting = conv.replyState === "awaiting_reply" && conv.status !== "closed" && conv.status !== "ignored";
  const waitingFrom = waitingSince(conv);
  const longWait = awaiting && waitingFrom ? isLongWait(waitingFrom) : false;
  const state = rowState(conv);
  const urgent = conv.priority === "urgent";

  return (
    <div
      data-conv-row
      className={cn(
        "group relative cursor-pointer border-b border-[var(--border-2)] py-2 pr-3 transition",
        // The accent bar marks unanswered work in MIXED views. In a view that is already filtered
        // to awaiting it would paint every row amber, which is wallpaper rather than a signal.
        showState && awaiting ? "border-l-2 border-l-amber-400 pl-[10px]" : "border-l-2 border-l-transparent pl-[10px]",
        active
          ? "bg-[var(--brand-50)]"
          : focused
            ? "bg-[var(--surface-1)] ring-1 ring-inset ring-[var(--brand-200,var(--border-1))]"
            : "hover:bg-[var(--surface-1)]",
      )}
      onClick={onOpen}
    >
      {/* ── Line 1: who + when. Sender leads, because triage is about people, and the subject
             is frequently a reference number that identifies nothing. ── */}
      <div className="flex items-center gap-2">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggleSelect}
            // Reveal on hover / when in use, so a resting list is content rather than controls.
            className={cn(
              "h-3.5 w-3.5 shrink-0 rounded-[3px] transition group-hover:opacity-100",
              selected ? "opacity-100" : "opacity-0 focus:opacity-100",
            )}
          />
        )}
        <SourceIcon
          source={conv.source}
          className={cn("h-3.5 w-3.5 shrink-0", awaiting ? "text-amber-500" : "text-[var(--text-4)]")}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px]",
            conv.unread ? "font-semibold text-[var(--text-1)]" : "font-medium text-[var(--text-2)]",
          )}
        >
          {conv.customerLabel || SOURCE_LABEL[conv.source]}
        </span>
        {urgent && (
          <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.6px] text-red-600">
            Urgent
          </span>
        )}
        {/* Age of the LATEST message, not the thread's first — a thread replied to an hour ago
            must not read as three months old. Goes amber once a wait crosses the threshold, so
            the passage of time is itself the alarm. */}
        <span
          className={cn(
            "shrink-0 font-mono text-[11px]",
            longWait ? "font-semibold text-amber-600" : "text-[var(--text-4)]",
          )}
          title={new Date(lastActivityAt(conv)).toLocaleString()}
        >
          {formatAge(lastActivityAt(conv))}
        </span>
      </div>

      {/* ── Line 2: what it is about ── */}
      <div
        className={cn(
          "mt-1 truncate pl-[22px] text-[13px]",
          conv.unread ? "text-[var(--text-1)]" : "text-[var(--text-2)]",
        )}
      >
        {conv.subject}
      </div>

      {/* ── Line 3: only rendered when it has something to say ──
             The Gmail connector used to write `preview: subject`, so this line repeated the line
             above it on every row. It is now the real message body, and null when the body adds
             nothing — in which case the row collapses to two lines and more of the queue fits on
             screen, which matters far more at 226 rows than at 6. */}
      {(conv.preview || showState || assigneeName) && (
        <div className="mt-0.5 flex items-baseline gap-2 pl-[22px]">
          {showState && (
            <span
              // Fixed width so the labels form an aligned column; `truncate` so a longer label
              // added later clips instead of shoving the preview out of alignment on that row.
              className={cn(
                "w-[80px] shrink-0 truncate font-mono text-[10px] font-semibold uppercase tracking-[0.6px]",
                state.tone,
              )}
              title={state.since ? `${state.label} — ${new Date(state.since).toLocaleString()}` : state.label}
            >
              {state.label}
            </span>
          )}
          {conv.preview && (
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-4)]">{conv.preview}</span>
          )}
          {assigneeName && (
            <span
              // Its own muted tone and a gap keep it from reading as part of the state readout —
              // "HB NEEDS REPLY" ran together as one string when they sat adjacent.
              className="ml-auto shrink-0 rounded-[3px] bg-[var(--surface-1)] px-1 font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-3)]"
              title={`Assigned to ${assigneeName}`}
            >
              {initialsOf(assigneeName)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * In-cockpit channels & settings hub. Replaces the old jump-out to
 * /app/support?panel=connectors|settings — you stay inside Care. Scope is
 * deliberately just the connected channels + their auto-fetch schedule
 * (ConnectorsView); workflow rules / AI agents / portal-link were dropped as
 * unused per the redesign. Agent-activity logs are hidden here too.
 */
function CareSettingsPanel({ client, onClose }: { client: SupportClient; onClose: () => void }) {
  const updateClient = useUpdateSupportClient(client.id);
  const courseOnly = client.courseRequestOnly ?? false;
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border-2)] px-5 py-4">
        <button onClick={onClose} className="-ml-1 rounded-[6px] p-1 hover:bg-[var(--surface-1)]" title="Back to inbox">
          <ArrowLeftIcon className="h-4 w-4 text-[var(--text-3)]" />
        </button>
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[1.2px] text-[var(--text-4)]">Channels &amp; settings</div>
          <h2 className="text-lg font-semibold leading-snug text-[var(--text-1)]">Connected channels</h2>
        </div>
        <button
          onClick={onClose}
          className="ml-auto rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-[var(--surface-1)] hover:text-[var(--text-2)]"
          title="Close"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto max-w-3xl space-y-5">
          {/* Support-paused / course-requests-only mode */}
          <div className="rounded-[10px] border border-[var(--border-2)] bg-[var(--surface-0)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--text-1)]">Support paused — course requests only</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-3)]">
                  Keep pulling the inbox quietly, but skip all triage, tickets and auto-replies. Incoming
                  “New Feedback” emails are auto-filed into the Course Requests wiki (course requests only —
                  bugs and general feedback are left untouched in the inbox).
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={courseOnly}
                disabled={updateClient.isPending}
                onClick={() => updateClient.mutate({ courseRequestOnly: !courseOnly })}
                title={courseOnly ? "Turn off — resume normal triage" : "Turn on — pause support, course requests only"}
                className={cn(
                  "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50",
                  courseOnly ? "bg-[var(--brand-600)]" : "bg-[var(--border-1)]",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                    courseOnly ? "translate-x-[22px]" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>
          </div>
          <ConnectorsView clientId={client.id} clientSlug={client.slug ?? ""} showAgentLogs={false} />
        </div>
      </div>
    </div>
  );
}

export function ClientCockpit({
  client,
  onBack,
}: {
  client: SupportClient;
  // No currentUserId: "Assigned to me" is now a server query (assigneeId=me), resolved from the
  // session server-side, so the client no longer needs to know who it is to filter.
  onBack: () => void;
}) {
  const connectionsQ = useSupportConnections(client.id);
  const membersQ = useSupportMembers(client.id);
  const sync = useSyncSupportClient(client.id);
  const batch = useBatchTriageConversations(client.id);
  const markRead = useMarkConversationRead(client.id);
  const close = useCloseConversation(client.id);
  const snooze = useSnoozeConversation(client.id);
  const { canManageSupport } = usePermissions();

  const [activeView, setActiveView] = useState(DEFAULT_VIEW_ID);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  // Keyboard cursor, independent of which conversation is open.
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement | null>(null);
  // In-place channel/settings hub — opens inside the cockpit instead of jumping to /app/support.
  const [showSettings, setShowSettings] = useState(false);

  const members = useMemo(() => membersQ.data?.members ?? [], [membersQ.data]);
  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const view = SAVED_VIEWS.find((v) => v.id === activeView) ?? SAVED_VIEWS[0];

  // The view IS the query. Source and search are folded in as server params too, so a filtered
  // list is a complete walk of the match set rather than a client-side sieve over one page —
  // searching or filtering by channel can no longer hide a conversation that simply hadn't
  // been fetched yet.
  const params = useMemo(
    () => ({
      ...view.params,
      ...(sourceFilter !== "all" ? { source: sourceFilter } : {}),
      ...(deferredSearch.trim() ? { q: deferredSearch.trim() } : {}),
      limit: PAGE_SIZE,
    }),
    [view, sourceFilter, deferredSearch],
  );

  const convsQ = useSupportConversationsPaged(client.id, params);
  const countsQ = useSupportConversationCounts(client.id);

  // Only worth showing per row in a view that can contain more than one state. In "Awaiting
  // reply" or "Replied" the label would be identical on every row — the view's own name,
  // repeated 226 times.
  const showRowState = !view.params.replyState;

  const conversations = useMemo(
    () => convsQ.data?.pages.flatMap((p) => p.conversations) ?? [],
    [convsQ.data],
  );

  // Badge numbers come from server-side COUNTs over the whole client, so they mean what they
  // say. Deriving them from the loaded rows would make every badge cap at the page size.
  const counts = countsQ.data?.counts;
  const viewCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const v of SAVED_VIEWS) out[v.id] = counts ? counts[v.counts] : 0;
    return out;
  }, [counts]);

  const selected = selectedId ? conversations.find((c) => c.id === selectedId) ?? null : null;
  const sources = useMemo(
    () => Array.from(new Set(connectionsQ.data?.connections.map((c) => c.source) ?? [])),
    [connectionsQ.data],
  );

  // Opening a conversation is what marks it read — the same contract the legacy
  // dashboard has always had. Guarded on `conv.unread` so re-opening an already-read
  // thread doesn't fire a pointless write; the mutation is optimistic, so the subject
  // de-bolds on this click.
  //
  // Also guarded on canManageSupport because the PATCH route asserts it: without the
  // guard a read-only Care viewer would take a 403 on every open and watch the row
  // re-bold as the optimistic patch rolled back.
  function openConversation(conv: Conversation) {
    setShowSettings(false);
    setSelectedId(conv.id);
    if (conv.unread && canManageSupport) markRead.mutate(conv.id);
  }

  /**
   * Keyboard triage. This is the difference between a queue you read and a queue you clear.
   *
   * The live board is 226 unanswered threads, 1 replied, 0 closed — nobody has ever burned it
   * down, and with a mouse-only UI nobody will: every item costs a click to open, a scroll to
   * the action, a click to act, and a click back. Front, Superhuman, Missive and Linear are all
   * keyboard-first for exactly this reason, and it is the single biggest workflow gap here.
   *
   * j/k or ↓/↑ move · Enter opens · e closes · s snoozes a day · x selects · Esc clears.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Never hijack typing — the search box, the reply composer and the notes field all live
      // on this screen, and a bare "e" must stay a letter while any of them has focus.
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (conversations.length === 0) return;

      const move = (delta: number) => {
        e.preventDefault();
        setFocusedIndex((i) => {
          const next = Math.max(0, Math.min(conversations.length - 1, (i < 0 ? -1 : i) + delta));
          return next;
        });
      };

      switch (e.key) {
        case "j": case "ArrowDown": return move(1);
        case "k": case "ArrowUp": return move(-1);
        case "Enter": {
          const conv = conversations[focusedIndex];
          if (conv) { e.preventDefault(); openConversation(conv); }
          return;
        }
        case "x": {
          const conv = conversations[focusedIndex];
          if (conv && canManageSupport) { e.preventDefault(); toggleSelect(conv.id); }
          return;
        }
        case "e": {
          const conv = conversations[focusedIndex];
          if (conv && canManageSupport) {
            e.preventDefault();
            close.mutate({ convId: conv.id });
            // Hold position rather than following the row out of the view it just left, so a
            // run of closes walks down the queue instead of bouncing back to the top.
            setFocusedIndex((i) => Math.min(i, conversations.length - 2));
          }
          return;
        }
        case "s": {
          const conv = conversations[focusedIndex];
          if (conv && canManageSupport) {
            e.preventDefault();
            snooze.mutate({ convId: conv.id, until: new Date(Date.now() + 24 * 3600_000).toISOString() });
            setFocusedIndex((i) => Math.min(i, conversations.length - 2));
          }
          return;
        }
        case "Escape":
          if (selection.size > 0) { e.preventDefault(); clearSelection(); }
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Keep the keyboard cursor on screen. `block: "nearest"` so moving one row nudges the list
  // rather than recentring it, which is disorienting when you are scanning.
  useEffect(() => {
    if (focusedIndex < 0) return;
    const rows = listRef.current?.querySelectorAll("[data-conv-row]");
    rows?.[focusedIndex]?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  // A new view (or new results) invalidates the old cursor position.
  useEffect(() => { setFocusedIndex(-1); }, [activeView, sourceFilter, deferredSearch]);

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
    // w-full + min-w-0: <main> is a row-flex container, so without an explicit fill the
    // cockpit shrink-wraps to its content and leaves a dead strip on the right (the
    // detail pane never reaches the viewport edge). Fill the whole main area.
    <div className="flex h-full min-h-0 w-full min-w-0">
      {/* LEFT — saved views. Only a rail on wide desktops (xl+); below that it would
          crush the thread/detail into a sliver, so it collapses into the list-header
          dropdown instead (the 1024–1279 tablet band was the broken case). */}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-[var(--border-2)] xl:flex">
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
          {/* One NN sequence per screen, per DESIGN.md: 01 QUEUES (here) → 02 CONVERSATIONS
              (list) → 03 THREAD / 04 TRIAGE / 05 NOTES / 06 REPLY (detail). "Manage" below is a
              footer action group, not a widget, so it carries no number — previously it was also
              numbered 03, which collided with "03 // Thread" on the very same screen. */}
          <div className="widget-header__label mb-1 px-2">
            <span className="widget-header__label--number">01</span>{" // QUEUES"}
          </div>
          {VIEW_GROUPS.map((group, gi) => (
            <div key={group.label} className={cn(gi > 0 && "mt-3 border-t border-[var(--border-2)] pt-3")}>
              {/* Queues (work to pick up) vs Browse (everything else). Nine undifferentiated
                  rows read as a filter dropdown; two named groups read as a place to start.
                  The first group's label is suppressed because the pane header already says
                  QUEUES — printing it twice, one line apart, is noise. The hairline above
                  "Browse" is what actually communicates the split. */}
              {gi > 0 && (
                <div className="app-eyebrow mb-1 px-2 text-[9px]">{group.label}</div>
              )}
              {group.ids.map((id) => {
                const v = SAVED_VIEWS.find((s) => s.id === id);
                if (!v) return null;
                const count = viewCounts[v.id] ?? 0;
                const isActive = activeView === v.id;
                // The awaiting queue is the only count that is a call to action, so it is the
                // only one that carries colour. Everything else stays a quiet readout.
                const isQueue = v.id === DEFAULT_VIEW_ID && count > 0;
                return (
                  <button
                    key={v.id}
                    onClick={() => setActiveView(v.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-[13px] transition",
                      isActive
                        ? "bg-[var(--brand-50)] font-medium text-[var(--brand-700)]"
                        : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                    )}
                  >
                    <span className="truncate">{v.label}</span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-[11px]",
                        isQueue ? "font-semibold text-[var(--warning-500)]" : "text-[var(--text-4)]",
                      )}
                    >
                      {countsQ.isLoading ? "·" : count}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="space-y-1.5 border-t border-[var(--border-2)] p-2">
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-[var(--border-2)] px-2 py-2 text-xs font-medium hover:bg-[var(--surface-1)] disabled:opacity-60"
          >
            <ArrowPathIcon className={cn("h-3.5 w-3.5", sync.isPending && "animate-spin")} />
            {sync.isPending ? "Syncing…" : "Sync now"}
          </button>
          {canManageSupport && (
            <div className="app-eyebrow mb-1 px-2 pt-1">Manage</div>
          )}
          {canManageSupport && (
            <div className="grid grid-cols-1 gap-1">
              <button
                type="button"
                onClick={() => { setSelectedId(null); setShowSettings(true); }}
                className={cn(
                  "flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-xs font-medium transition",
                  showSettings
                    ? "bg-[var(--brand-50)] text-[var(--brand-700)]"
                    : "text-[var(--text-2)] hover:bg-[var(--surface-1)]",
                )}
              >
                <Cog8ToothIcon className={cn("h-4 w-4", showSettings ? "text-[var(--brand-700)]" : "text-[var(--text-4)]")} />
                Channels &amp; settings
              </button>
              <a
                href={`/app/support?client=${client.id}&tab=reports`}
                className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              >
                <DocumentChartBarIcon className="h-4 w-4 text-[var(--text-4)]" />
                Reports
              </a>
            </div>
          )}
        </div>
      </aside>

      {/* MIDDLE — conversation list. Full-width until xl; a fixed rail beside the detail
          at xl+. Hidden while a conversation is open below xl (single-pane master-detail),
          so the detail gets the whole viewport on tablets. */}
      <section
        className={cn(
          "min-h-0 w-full flex-col border-r border-[var(--border-2)] xl:flex xl:w-80 xl:shrink-0",
          selected || showSettings ? "hidden xl:flex" : "flex",
        )}
      >
        {/* List-header toolbar — the views rail is hidden < xl, so surface its controls here. */}
        <div className="flex items-center gap-2 border-b border-[var(--border-2)] px-3 py-2 xl:hidden">
          <button onClick={onBack} className="rounded-[6px] p-1 hover:bg-[var(--surface-1)]" title="All clients">
            <ArrowLeftIcon className="h-4 w-4 text-[var(--text-3)]" />
          </button>
          <span className="truncate text-sm font-semibold text-[var(--text-1)]">{client.name}</span>
          <select
            value={activeView}
            onChange={(e) => setActiveView(e.target.value)}
            className="app-select-compact ml-auto h-8 w-auto text-xs"
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
        <div className="widget-header">
          <span className="widget-header__label">
            <span className="widget-header__label--number">02</span>{" // CONVERSATIONS"}
          </span>
          <span className="widget-header__status">
            {conversations.length}
            {convsQ.hasNextPage ? "+" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 border-b border-[var(--border-2)] px-3 py-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="app-input-compact min-w-0 flex-1 text-sm"
          />
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="app-select-compact h-8 w-auto text-xs"
          >
            <option value="all">All channels</option>
            {sources.map((s) => (
              <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
            ))}
          </select>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {convsQ.isLoading && <p className="px-3 py-4 text-sm text-[var(--text-4)]">Loading…</p>}
          {!convsQ.isLoading && conversations.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-[var(--text-4)]">
              {activeView === DEFAULT_VIEW_ID && !deferredSearch.trim()
                ? "Nothing awaiting a reply — every customer message has been answered."
                : "Nothing here. Try another view or Sync now."}
            </p>
          )}
          {conversations.map((c, i) => (
            <ConversationRow
              key={c.id}
              conv={c}
              active={c.id === selectedId}
              focused={i === focusedIndex}
              selected={selection.has(c.id)}
              selectable={canManageSupport}
              showState={showRowState}
              onOpen={() => openConversation(c)}
              onToggleSelect={() => toggleSelect(c.id)}
              assigneeName={c.assigneeId ? memberName.get(c.assigneeId) : undefined}
            />
          ))}
          {convsQ.hasNextPage && (
            <button
              type="button"
              onClick={() => void convsQ.fetchNextPage()}
              disabled={convsQ.isFetchingNextPage}
              className="w-full border-b border-[var(--border-2)] px-3 py-2.5 text-xs font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
            >
              {convsQ.isFetchingNextPage ? "Loading…" : `Load ${PAGE_SIZE} more`}
            </button>
          )}
          {/* Says outright when the list is complete, so an empty-looking queue is never
              confused with a truncated one — the ambiguity the old fixed 100-row page created. */}
          {!convsQ.isLoading && !convsQ.hasNextPage && conversations.length > 0 && (
            <p className="px-3 py-3 text-center font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">
              End of list · {conversations.length} shown
            </p>
          )}
          {/* Keyboard triage is the whole point of the redesign, and an invisible shortcut is a
              shortcut nobody uses — so it is stated once, quietly, at the foot of the list. */}
          {canManageSupport && conversations.length > 0 && (
            <p className="px-3 pb-3 text-center font-mono text-[10px] tracking-[0.4px] text-[var(--text-4)]">
              <Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>↵</Kbd> open · <Kbd>E</Kbd> close · <Kbd>S</Kbd> snooze · <Kbd>X</Kbd> select
            </p>
          )}
        </div>

        {/* Bulk action bar */}
        {selection.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-2)] bg-[var(--surface-0)] px-3 py-2 shadow-lg">
            <span className="font-mono text-[11px] text-[var(--text-3)]">{selection.size} selected</span>
            <select
              onChange={(e) => e.target.value && runBatch({ status: e.target.value })}
              defaultValue=""
              className="app-select-compact h-8 w-auto text-xs"
            >
              <option value="" disabled>Status…</option>
              {(["open", "snoozed", "closed", "ignored"] as const).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
            <select
              onChange={(e) => e.target.value && runBatch({ assigneeId: e.target.value === "none" ? null : e.target.value })}
              defaultValue=""
              className="app-select-compact h-8 w-auto text-xs"
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

      {/* RIGHT — detail. Full-viewport below xl (only when a conversation or the
          settings hub is open); the flex-1 pane beside the list at xl+. */}
      <section className={cn("min-w-0 flex-1", selected || showSettings ? "flex" : "hidden xl:flex")}>
        {showSettings ? (
          <CareSettingsPanel client={client} onClose={() => setShowSettings(false)} />
        ) : selected ? (
          <ConversationDetail
            key={selected.id}
            clientId={client.id}
            conversation={selected}
            connections={connectionsQ.data?.connections ?? []}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <QueueOverview
            counts={counts}
            loading={countsQ.isLoading}
            // The awaiting view is sorted oldest-first, so the head of the list IS the longest
            // waits. In any other view this is simply "what's at the top", which is still the
            // most useful thing to offer.
            nextUp={conversations.slice(0, 5)}
            onOpen={openConversation}
            onStart={() => {
              // Jump straight to the top of the awaiting queue, which after the oldest-first sort
              // is the longest-waiting customer — the correct place to start a session.
              if (activeView !== DEFAULT_VIEW_ID) setActiveView(DEFAULT_VIEW_ID);
              const first = conversations[0];
              if (first && activeView === DEFAULT_VIEW_ID) openConversation(first);
              setFocusedIndex(0);
            }}
          />
        )}
      </section>
    </div>
  );
}
