"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import {
  ArrowDownIcon,
  ArrowPathIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  Cog8ToothIcon,
  DocumentChartBarIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type { Conversation, SupportClient } from "@/types/support";
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
import { CareEmpty } from "./care-panel";
import { ConversationDetail } from "./conversation-detail";
import { ConnectorsView } from "@/components/support/support-dashboard";

// One page. Small on purpose: because the views are server-side filters, 50 rows is 50 rows of
// the thing you asked for, and "Load more" walks the rest.
const PAGE_SIZE = 50;

/** The two orders the server can actually produce. Anything else would be a lie — see SortHeader. */
type SortKey = "activity" | "oldest_inbound";

/** A key cap. 3px radius per DESIGN.md's micro-control scale — full radius is status dots only. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[3px] border border-[var(--border-2)] bg-[var(--surface-1)] px-1 font-mono text-[10px] text-[var(--text-3)]">
      {children}
    </kbd>
  );
}

/**
 * One conversation as a TABLE row.
 *
 * Care showed conversations as stacked cards in a 320px rail — three lines of mixed-weight text per
 * row, which reads fine for five and is a wall at two hundred and twenty-six. A table puts each fact
 * in its own column, so the eye scans DOWN one attribute ("who has waited longest?", "what is
 * unowned?") instead of re-parsing every row. It is also why HubSpot, Linear and Zendesk all landed
 * on a table for a queue this size.
 */
function ConversationTableRow({
  conv,
  focused,
  selected,
  selectable,
  showState,
  onOpen,
  onToggleSelect,
  assigneeName,
}: {
  conv: Conversation;
  /** Keyboard cursor. Distinct from "open", which now leaves the index entirely. */
  focused: boolean;
  selected: boolean;
  selectable: boolean;
  /**
   * False when the current tab already filters to this state — on "Awaiting reply" every row is
   * awaiting, so stamping NEEDS REPLY on all 226 of them is the tab's own name, 226 times. A
   * signal that is constant within a view carries no information there.
   */
  showState: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  assigneeName?: string;
}) {
  const state = rowState(conv);
  const waited = waitingSince(conv);
  const late = waited ? isLongWait(waited) : false;

  return (
    <tr
      data-conv-row
      onClick={onOpen}
      className={cn(
        "cursor-pointer",
        selected
          ? "bg-[var(--surface-brand)]"
          : focused
            ? "bg-[var(--surface-1)] ring-1 ring-inset ring-[var(--brand-200)]"
            : undefined,
      )}
    >
      {selectable && (
        <td className="w-8" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="app-checkbox"
            aria-label={`Select conversation from ${conv.customerLabel}`}
          />
        </td>
      )}
      {/*
        Column caps step with the viewport, because the two columns that must survive a phone are
        CUSTOMER and WAITING — how long someone has been ignored is the whole point of the queue.
        Left uncapped, the subject took its natural width and pushed Waiting and Owner off the right
        edge at 390px: reachable by scrolling the table, but nobody scrolls sideways to find the
        number they came for.
      */}
      <td className="max-w-[104px] sm:max-w-[160px] lg:max-w-[200px]">
        <div className="flex items-center gap-2">
          <SourceIcon source={conv.source} className="h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
          <span
            className={cn(
              "truncate text-[13px]",
              conv.unread ? "font-semibold text-[var(--text-1)]" : "text-[var(--text-2)]",
            )}
            title={conv.customerLabel}
          >
            {conv.customerLabel || SOURCE_LABEL[conv.source]}
          </span>
        </div>
      </td>
      <td className="max-w-[124px] sm:max-w-[240px] md:max-w-[300px] lg:max-w-[380px] xl:max-w-[460px]">
        <div
          className={cn("truncate text-[13px]", conv.unread ? "font-medium text-[var(--text-1)]" : "text-[var(--text-2)]")}
          title={conv.subject}
        >
          {conv.subject}
        </div>
        {/* The preview earns a second line only when it says something the subject doesn't — on a
            forwarding inbox the two are frequently the identical string. Dropped below `sm`: 106px
            of a 270-character message is not a preview, and a `title` tooltip is no answer on a
            touch device — the subject is the line that has to survive a phone. */}
        {conv.preview && conv.preview.trim() !== conv.subject.trim() && (
          <div className="hidden truncate text-[12px] text-[var(--text-4)] sm:block" title={conv.preview}>
            {conv.preview}
          </div>
        )}
      </td>
      <td className="hidden lg:table-cell">
        <span className="widget-data-label">{SOURCE_LABEL[conv.source]}</span>
      </td>
      {showState && (
        <td className="hidden md:table-cell">
          <span className={cn("widget-data-label", state.tone)}>{state.label}</span>
        </td>
      )}
      <td className="text-right">
        <span
          className={cn(
            "font-mono text-[12px] whitespace-nowrap",
            late ? "font-semibold text-[var(--warning-500)]" : "text-[var(--text-3)]",
          )}
          title={new Date(lastActivityAt(conv)).toLocaleString()}
        >
          {formatAge(lastActivityAt(conv))}
        </span>
      </td>
      <td className="hidden sm:table-cell">
        {assigneeName ? (
          <span className="widget-data-label" title={`Assigned to ${assigneeName}`}>
            {initialsOf(assigneeName)}
          </span>
        ) : (
          <span className="widget-data-label text-[var(--border-1)]">—</span>
        )}
      </td>
    </tr>
  );
}

/**
 * A sortable column header.
 *
 * Only ever offered for orders the SERVER can produce (`activity` / `oldest_inbound`). A header
 * that sorted the loaded page would repeat the exact lie this module spent two PRs removing —
 * "…among the rows we happened to fetch" — so a column with no server order gets no control.
 */
function SortHeader({
  label,
  active,
  onToggle,
  title,
}: {
  label: string;
  /** Which direction this column currently drives, or null when it is not the active sort. */
  active: "asc" | "desc" | null;
  onToggle: () => void;
  title: string;
}) {
  const Icon = active === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      className={cn(
        "inline-flex items-center gap-1 transition hover:text-[var(--text-2)]",
        active && "text-[var(--text-2)]",
      )}
    >
      {label}
      <Icon className={cn("h-3 w-3", active ? "opacity-100" : "opacity-30")} />
    </button>
  );
}

/**
 * In-cockpit channels & settings hub. Replaces the old jump-out to
 * /app/support?panel=connectors|settings — you stay inside Care. Scope is deliberately just the
 * connected channels + their auto-fetch schedule (ConnectorsView); workflow rules / AI agents /
 * portal-link were dropped as unused per the redesign.
 */
function CareSettingsPanel({ client }: { client: SupportClient }) {
  const updateClient = useUpdateSupportClient(client.id);
  const courseOnly = client.courseRequestOnly ?? false;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="widget-card">
          {/* No close button of its own: the persistent client header owns "back", and an ✕ sitting
              on the MODE panel reads as "dismiss this panel" rather than "leave settings". */}
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">01</span>{" // MODE"}
            </span>
            <span className="widget-header__status">{courseOnly ? "COURSE REQUESTS ONLY" : "FULL TRIAGE"}</span>
          </div>
          <div className="widget-body">
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
        </section>
        <ConnectorsView clientId={client.id} clientSlug={client.slug ?? ""} showAgentLogs={false} />
      </div>
    </div>
  );
}

/**
 * The cockpit is an INDEX and a RECORD, not three columns.
 *
 * It used to be rail │ 320px list │ detail — every pane permanently on screen, so the list of work
 * was a sliver, the thread was a sliver, and the nine saved views ate a fifth of the width to show
 * a filter set you touch a few times a day. That layout is why the queue was unreadable at 226
 * rows and why nothing was ever cleared.
 *
 *   INDEX                                   RECORD
 *   ┌ client · queue readout · actions ┐    ┌ client · ← conversations ┐
 *   │ tabs: the saved views            │    ├──────────────┬───────────┤
 *   │ search · channel · hints         │    │ thread       │ 02 // …   │
 *   │ ┌ table, full width ───────────┐ │    │ (full width) │ properties│
 *   │ │ CUSTOMER SUBJECT … WAITING ↑ │ │    │ composer     │ 03 // …   │
 *   └─┴──────────────────────────────┴─┘    └──────────────┴───────────┘
 *
 * One thing at a time, each with the whole width: the standard index/record shape of every CRM and
 * every issue tracker, and the reason a HubSpot table can carry hundreds of rows legibly.
 */
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
  // Per-view sort override. Null means "whatever this view was designed to show first".
  const [sortOverride, setSortOverride] = useState<SortKey | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  // In-place channel/settings hub — opens inside the cockpit instead of jumping to /app/support.
  const [showSettings, setShowSettings] = useState(false);

  const members = useMemo(() => membersQ.data?.members ?? [], [membersQ.data]);
  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const view = SAVED_VIEWS.find((v) => v.id === activeView) ?? SAVED_VIEWS[0];
  const sort: SortKey = sortOverride ?? (view.params.sort === "oldest_inbound" ? "oldest_inbound" : "activity");

  // The view IS the query. Source, search and sort are folded in as server params too, so a
  // filtered or re-sorted list is a complete walk of the match set rather than a client-side sieve
  // over one page — no control on this screen can hide a conversation that simply hadn't been
  // fetched yet.
  const params = useMemo(
    () => ({
      ...view.params,
      sort,
      ...(sourceFilter !== "all" ? { source: sourceFilter } : {}),
      ...(deferredSearch.trim() ? { q: deferredSearch.trim() } : {}),
      limit: PAGE_SIZE,
    }),
    [view, sort, sourceFilter, deferredSearch],
  );

  const convsQ = useSupportConversationsPaged(client.id, params);
  const countsQ = useSupportConversationCounts(client.id);

  // Only worth a column in a view that can contain more than one state. On "Awaiting reply" or
  // "Replied" it would be identical on every row — the tab's own name, repeated.
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

  const mode: "index" | "record" | "settings" = showSettings ? "settings" : selected ? "record" : "index";

  // Opening a conversation is what marks it read — the same contract the legacy dashboard has
  // always had. Guarded on `conv.unread` so re-opening an already-read thread doesn't fire a
  // pointless write; the mutation is optimistic, so the row de-bolds on this click.
  //
  // Also guarded on canManageSupport because the PATCH route asserts it: without the guard a
  // read-only Care viewer would take a 403 on every open and watch the row re-bold as the
  // optimistic patch rolled back.
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

      // Escape is the way back out of a thread — the only shortcut that belongs to the record.
      if (e.key === "Escape") {
        if (selection.size > 0) { e.preventDefault(); clearSelection(); return; }
        if (mode !== "index") { e.preventDefault(); setSelectedId(null); setShowSettings(false); }
        return;
      }
      // Everything below drives the index's cursor, so it must not fire while a thread is open.
      if (mode !== "index" || conversations.length === 0) return;

      const move = (delta: number) => {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(0, Math.min(conversations.length - 1, (i < 0 ? -1 : i) + delta)));
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

  // A new view (or new results) invalidates the old cursor position — and the old sort, which
  // belongs to the view that was showing when it was chosen.
  useEffect(() => { setFocusedIndex(-1); }, [activeView, sourceFilter, deferredSearch, sort]);
  useEffect(() => { setSortOverride(null); }, [activeView]);

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
  function toggleSort(key: SortKey) {
    setSortOverride(sort === key ? (key === "oldest_inbound" ? "activity" : "oldest_inbound") : key);
  }

  const allLoadedSelected = conversations.length > 0 && conversations.every((c) => selection.has(c.id));
  // Column count, so the empty/loading row can span the table without leaving a ragged cell.
  const columnCount = 4 + (canManageSupport ? 1 : 0) + (showRowState ? 1 : 0) + 1;

  return (
    // w-full + min-w-0: <main> is a row-flex container, so without an explicit fill the cockpit
    // shrink-wraps to its content and leaves a dead strip on the right.
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      {/* ── Client header. Persistent across index / record / settings, so you always know whose
             inbox this is and always have one way back. The second line is the queue's own state
             on the index — the figure that used to require an empty right-hand pane to see. ── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border-2)] px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={() => {
            if (mode === "index") onBack();
            else { setSelectedId(null); setShowSettings(false); }
          }}
          className="shrink-0 rounded-[6px] p-1 transition hover:bg-[var(--surface-1)]"
          title={mode === "index" ? "All clients" : "Back to conversations"}
        >
          <ArrowLeftIcon className="h-4 w-4 text-[var(--text-3)]" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold leading-tight text-[var(--text-1)]" title={client.name}>
            {client.name}
          </h2>
          {/*
            Wraps rather than truncates. With `truncate` the readout ended "…longest 1d · 1 urg" at
            390px, so the urgent count — the one figure on the line that is a call to action — was
            clipped away entirely. A phone spends one extra line on it; that is the right trade.
          */}
          <div className="widget-data-label mt-0.5">
            {mode === "settings" ? (
              "Channels & settings"
            ) : mode === "record" ? (
              "Conversation"
            ) : countsQ.isLoading ? (
              "Loading queue…"
            ) : counts && counts.awaiting > 0 ? (
              <>
                <span className="font-semibold text-[var(--warning-500)]">{counts.awaiting} awaiting</span>
                {counts.oldestAwaitingAt && ` · longest ${formatAge(counts.oldestAwaitingAt)}`}
                {counts.urgent > 0 && (
                  <span className="font-semibold text-[var(--danger-500)]">{` · ${counts.urgent} urgent`}</span>
                )}
              </>
            ) : (
              "All replied"
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex items-center gap-1.5 rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2 py-1.5 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)] disabled:opacity-60 sm:px-2.5"
            title="Sync now"
          >
            <ArrowPathIcon className={cn("h-3.5 w-3.5", sync.isPending && "animate-spin")} />
            <span className="hidden sm:inline">{sync.isPending ? "Syncing…" : "Sync now"}</span>
          </button>
          {canManageSupport && (
            <>
              <button
                type="button"
                onClick={() => { setSelectedId(null); setShowSettings(true); }}
                className={cn(
                  "rounded-[6px] border p-1.5 transition",
                  mode === "settings"
                    ? "border-[var(--brand-200)] bg-[var(--surface-brand)] text-[var(--brand-700)]"
                    : "border-[var(--border-2)] bg-[var(--surface-0)] text-[var(--text-3)] hover:bg-[var(--surface-1)]",
                )}
                title="Channels &amp; settings"
                aria-label="Channels and settings"
              >
                <Cog8ToothIcon className="h-4 w-4" />
              </button>
              <a
                href={`/app/support?client=${client.id}&tab=reports`}
                className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] p-1.5 text-[var(--text-3)] transition hover:bg-[var(--surface-1)]"
                title="Monthly reports"
                aria-label="Monthly reports"
              >
                <DocumentChartBarIcon className="h-4 w-4" />
              </a>
            </>
          )}
        </div>
      </header>

      {mode === "settings" ? (
        <CareSettingsPanel client={client} />
      ) : mode === "record" && selected ? (
        <ConversationDetail
          key={selected.id}
          clientId={client.id}
          conversation={selected}
          connections={connectionsQ.data?.connections ?? []}
        />
      ) : (
        <>
          {/* ── The saved views, as tabs. Nine rows in a rail read as a filter dropdown and cost a
                 fifth of the width; across the top they read as the queues they are, and the width
                 goes to the work. The hairline before "Browse" is the same QUEUES / BROWSE split
                 the rail carried. ── */}
          <nav
            className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--border-2)] px-2"
            aria-label="Conversation views"
          >
            {VIEW_GROUPS.map((group, gi) => (
              <Fragment key={group.label}>
                {gi > 0 && <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-[var(--border-2)]" />}
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
                      type="button"
                      onClick={() => setActiveView(v.id)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2 text-[13px] transition",
                        isActive
                          ? "border-[var(--brand-600)] font-medium text-[var(--brand-700)]"
                          : "border-transparent text-[var(--text-3)] hover:text-[var(--text-1)]",
                      )}
                    >
                      {v.label}
                      <span
                        className={cn(
                          "font-mono text-[11px]",
                          isQueue ? "font-semibold text-[var(--warning-500)]" : "text-[var(--text-4)]",
                        )}
                      >
                        {countsQ.isLoading ? "·" : count}
                      </span>
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </nav>

          {/* ── Toolbar, or the bulk bar when something is selected. They occupy the same strip
                 deliberately: acting on a selection replaces filtering it, and a bar that appears
                 as a fourth stacked row is what pushes the table off a laptop screen. ── */}
          {selection.size > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border-2)] bg-[var(--surface-brand)] px-3 py-2 sm:px-4">
              <span className="font-mono text-[11px] font-semibold text-[var(--brand-700)]">
                {selection.size} selected
              </span>
              <button
                type="button"
                onClick={() => runBatch({ status: "closed" })}
                className="rounded-[6px] border border-[var(--border-2)] bg-[var(--surface-0)] px-2.5 py-1 text-xs font-medium text-[var(--text-2)] transition hover:bg-[var(--surface-1)]"
              >
                Close
              </button>
              <select
                onChange={(e) => e.target.value && runBatch({ status: e.target.value })}
                defaultValue=""
                aria-label="Set status"
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
                aria-label="Assign to"
                className="app-select-compact h-8 w-auto text-xs"
              >
                <option value="" disabled>Assign…</option>
                <option value="none">Unassign</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={clearSelection}
                className="ml-auto text-[11px] text-[var(--text-3)] transition hover:text-[var(--text-1)]"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-2)] px-3 py-2 sm:px-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer, subject or message…"
                aria-label="Search conversations"
                className="app-input-compact min-w-0 max-w-xs flex-1 text-sm"
              />
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                aria-label="Filter by channel"
                className="app-select-compact h-8 w-auto text-xs"
              >
                <option value="all">All channels</option>
                {sources.map((s) => (
                  <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
                ))}
              </select>
              {/* Keyboard triage is the whole point of the redesign, and an invisible shortcut is a
                  shortcut nobody uses — so it is stated once, quietly, where the eye lands before
                  the first row. */}
              {canManageSupport && conversations.length > 0 && (
                <p className="ml-auto hidden shrink-0 font-mono text-[10px] tracking-[0.4px] text-[var(--text-4)] lg:block">
                  <Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>↵</Kbd> open · <Kbd>E</Kbd> close · <Kbd>S</Kbd> snooze · <Kbd>X</Kbd> select
                </p>
              )}
            </div>
          )}

          {/* ── The queue. `overflow-auto` on the scroll container, not `overflow-hidden` on a
                 shell: a table narrower than its content must be reachable by scrolling, which is
                 the TABLE-SCROLL rule in audit:ui and the commonest way a column vanishes. ── */}
          <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
            <table className="app-table app-table--dense">
              <thead className="sticky top-0 z-10">
                <tr>
                  {canManageSupport && (
                    <th scope="col" className="w-8">
                      <input
                        type="checkbox"
                        checked={allLoadedSelected}
                        onChange={() =>
                          setSelection(allLoadedSelected ? new Set() : new Set(conversations.map((c) => c.id)))
                        }
                        disabled={conversations.length === 0}
                        className="app-checkbox"
                        aria-label="Select all loaded conversations"
                      />
                    </th>
                  )}
                  {/* Trailing columns are sized to their content so the slack lands in SUBJECT —
                      without this, auto table layout handed 190px to a column reading "REDDIT". */}
                  <th scope="col" className="w-[200px] text-left">Customer</th>
                  <th scope="col" className="text-left">Subject</th>
                  <th scope="col" className="hidden w-[120px] text-left lg:table-cell">Channel</th>
                  {showRowState && <th scope="col" className="hidden w-[120px] text-left md:table-cell">State</th>}
                  <th scope="col" className="w-[86px] text-right">
                    <SortHeader
                      label="Waiting"
                      active={sort === "oldest_inbound" ? "asc" : "desc"}
                      onToggle={() => toggleSort("oldest_inbound")}
                      title={
                        sort === "oldest_inbound"
                          ? "Longest wait first — click for most recent activity"
                          : "Most recent activity first — click for longest wait"
                      }
                    />
                  </th>
                  <th scope="col" className="hidden w-[72px] text-left sm:table-cell">Owner</th>
                </tr>
              </thead>
              <tbody>
                {convsQ.isLoading && (
                  <tr>
                    <td colSpan={columnCount} className="text-center text-sm text-[var(--text-4)]">
                      Loading conversations…
                    </td>
                  </tr>
                )}
                {!convsQ.isLoading && conversations.length === 0 && (
                  <tr>
                    <td colSpan={columnCount}>
                      <CareEmpty
                        headline={
                          activeView === DEFAULT_VIEW_ID && !deferredSearch.trim()
                            ? "Nothing is waiting on a reply."
                            : "Nothing matches this view."
                        }
                        body={
                          activeView === DEFAULT_VIEW_ID && !deferredSearch.trim()
                            ? "Every customer message has been answered. New mail lands here on the next sync."
                            : "Try another tab, clear the search, or sync to pull anything new."
                        }
                      />
                    </td>
                  </tr>
                )}
                {conversations.map((c, i) => (
                  <ConversationTableRow
                    key={c.id}
                    conv={c}
                    focused={i === focusedIndex}
                    selected={selection.has(c.id)}
                    selectable={canManageSupport}
                    showState={showRowState}
                    onOpen={() => openConversation(c)}
                    onToggleSelect={() => toggleSelect(c.id)}
                    assigneeName={c.assigneeId ? memberName.get(c.assigneeId) : undefined}
                  />
                ))}
              </tbody>
            </table>

            {convsQ.hasNextPage && (
              <button
                type="button"
                onClick={() => void convsQ.fetchNextPage()}
                disabled={convsQ.isFetchingNextPage}
                className="w-full border-t border-[var(--border-3)] px-3 py-2.5 text-xs font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)] disabled:opacity-50"
              >
                {convsQ.isFetchingNextPage ? "Loading…" : `Load ${PAGE_SIZE} more`}
              </button>
            )}
            {/* Says outright when the list is complete, so an empty-looking queue is never
                confused with a truncated one — the ambiguity the old fixed 100-row page created. */}
            {!convsQ.isLoading && !convsQ.hasNextPage && conversations.length > 0 && (
              <p className="border-t border-[var(--border-3)] px-3 py-2.5 text-center font-mono text-[10px] uppercase tracking-[0.6px] text-[var(--text-4)]">
                End of list · {conversations.length} shown
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
