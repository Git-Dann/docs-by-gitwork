"use client";

import { useState } from "react";
import { ArrowPathIcon, ArrowRightIcon, LifebuoyIcon, PlusIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import type { ClientQueueSummary, OldestAwaitingItem, SupportClient } from "@/types/support";
import {
  useSupportClients,
  useClientQueueSummaries,
  useOldestAwaiting,
  useSyncSupportClient,
} from "@/hooks/use-support";
import { SourceIcon, formatAge, isLongWait } from "./care-constants";
import { CareEmpty, CarePanel } from "./care-panel";
import { ingestOnlyReason, partitionCareClients } from "@/lib/care-mode";
import { AddClientModal } from "./care-add-client";
import { usePermissions } from "@/hooks/use-permissions";
import { BigFigure, SplitBar } from "@/components/dashboard/tile-parts";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonRows } from "@/components/ui/motion/skeleton";
import { cardBasis, cardsPerRow } from "@/lib/client-portal-layout";

/**
 * Care home — which client is being let down right now, and what to do about it first.
 *
 * ── What was wrong with it ───────────────────────────────────────────────────────────────────
 * It was two cards floating in a void. The wrapper was `mx-auto h-full max-w-5xl overflow-y-auto`
 * around a plain `space-y-4` block of two natural-height panels: `h-full` made it the scroller,
 * but nothing inside it was a flex child, so nothing could claim the slack. With two clients the
 * content came to ~320px and ~1,100px of the viewport was empty — the exact thing "we absolutely
 * cannot have large gaps" exists to prevent (CLAUDE.md §129.1, §130). A third panel read "Every
 * customer has been answered" and mounted ONLY when nothing was waiting, so on a real workspace
 * nobody had ever seen it.
 *
 * Three figures led the page — awaiting, unassigned, urgent — at equal weight, and two of them
 * read **573 / 573**. That is not a coincidence: `unassigned` is a strict SUBSET of `awaiting`
 * (`{...awaiting, assigneeId: null}`), so when nothing is assigned the two are identical by
 * construction. A number that always equals the one beside it says nothing, so it moved into the
 * readout where it is one fact among several rather than a headline.
 *
 * ── The shape now ────────────────────────────────────────────────────────────────────────────
 *   01 // THE DESK          hero: the one figure, who is worst off, and the first thing to do
 *   02 // NEEDS YOU FIRST   the next people to answer, across every client — one click each
 *   03 // CLIENTS           who is being let down — cards up to four, dense rows beyond
 *   (foot)                  ingest-only clients, unnumbered: not part of this queue
 *
 * 02 and 03 sit side by side from `lg` and fill the remaining height between them.
 *
 * It still renders no `<h1>Care</h1>` — AppShell owns that — and still costs one workspace-wide
 * roll-up rather than ~10 indexed COUNTs per client.
 */

/**
 * Amber for a long wait, at a ratio that can actually be read.
 *
 * ⚠️ `--warning-500` is `#D97706` in light, which measures **3.19:1** against `--surface-0` — under
 * AA for the 11px data labels this appears on. It is the right token for a BAR or a side stroke,
 * where nothing has to be legible; it is the wrong one for small text, and DESIGN.md's badge
 * recipe already names `text-amber-700` for the readable form. The amber family is remapped for
 * dark (§131), so this flips. §129.1's rule still holds alongside it: the weight is doing most of
 * the work, the colour is the confirmation.
 */
const STALE_TEXT = "font-semibold text-amber-700";

/** Semantic fills for the split bars. Tokens, so they flip with the theme. */
const BAR = {
  awaiting: "var(--warning-500)",
  replied: "var(--success-500)",
  unassigned: "var(--brand-500)",
} as const;

/**
 * Past this many clients the cards become a wall and the dense row is the better read. Below it,
 * cards grow into the height the panel has — which is what stops a two-client workspace drawing
 * 120px of content above 900px of nothing.
 */
const CARD_LIMIT = 4;

type Totals = {
  awaiting: number;
  urgent: number;
  unassigned: number;
  replied: number;
  oldestAwaitingAt: string | null;
  worstClient: SupportClient | null;
};

function sumTotals(clients: SupportClient[], summaries: Record<string, ClientQueueSummary>): Totals {
  const t: Totals = { awaiting: 0, urgent: 0, unassigned: 0, replied: 0, oldestAwaitingAt: null, worstClient: null };
  for (const c of clients) {
    const s = summaries[c.id];
    if (!s) continue;
    t.awaiting += s.awaiting;
    t.urgent += s.urgent;
    t.unassigned += s.unassigned;
    t.replied += s.replied;
    // The worst client is the one whose customer has waited LONGEST, not the one with the most
    // waiting: a single person ignored for six months is a worse fact than fifty ignored for a day.
    if (s.oldestAwaitingAt && (!t.oldestAwaitingAt || s.oldestAwaitingAt < t.oldestAwaitingAt)) {
      t.oldestAwaitingAt = s.oldestAwaitingAt;
      t.worstClient = c;
    }
  }
  return t;
}

/** Worst first: longest wait, then most waiting, then name for a stable order. */
function byWorst(summaries: Record<string, ClientQueueSummary>) {
  return (a: SupportClient, b: SupportClient) => {
    const sa = summaries[a.id];
    const sb = summaries[b.id];
    const oa = sa?.oldestAwaitingAt ? Date.parse(sa.oldestAwaitingAt) : Infinity;
    const ob = sb?.oldestAwaitingAt ? Date.parse(sb.oldestAwaitingAt) : Infinity;
    if (oa !== ob) return oa - ob;
    if ((sb?.awaiting ?? 0) !== (sa?.awaiting ?? 0)) return (sb?.awaiting ?? 0) - (sa?.awaiting ?? 0);
    return a.name.localeCompare(b.name);
  };
}

/** The sync control, shared by the card and the row so the two cannot drift apart. */
function SyncButton({ client, className }: { client: SupportClient; className?: string }) {
  const sync = useSyncSupportClient(client.id);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); sync.mutate(); }}
      disabled={sync.isPending}
      title={`Sync ${client.name} now`}
      aria-label={`Sync ${client.name} now`}
      className={cn(
        "shrink-0 rounded-[6px] p-1.5 text-[var(--text-4)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text-2)] disabled:opacity-50",
        className,
      )}
    >
      <ArrowPathIcon className={cn("h-4 w-4", sync.isPending && "animate-spin")} />
    </button>
  );
}

/**
 * One client as a card, for a workspace with a handful of them. The grid is `flex-wrap` +
 * `flex-1` + `cardBasis(cardsPerRow(n))` so two clients each take half the width and a short last
 * row stretches rather than leaving a hole (§129.1).
 */
function ClientCard({
  client,
  summary,
  loading,
  basis,
  onOpen,
}: {
  client: SupportClient;
  summary?: ClientQueueSummary;
  loading: boolean;
  basis: string;
  onOpen: () => void;
}) {
  const awaiting = summary?.awaiting ?? 0;
  const oldest = summary?.oldestAwaitingAt ?? null;
  const stale = oldest ? isLongWait(oldest) : false;
  const urgent = summary?.urgent ?? 0;

  return (
    <li className="group relative flex min-w-[min(100%,260px)] flex-1" style={{ flexBasis: basis }}>
      <button
        type="button"
        onClick={onOpen}
        data-care-client-open
        className={cn(
          // A coloured side stroke squares its own corners — a stroke bending round a radius is
          // what DESIGN.md rules out, and `straight-side-stroke.test.ts` enforces it.
          "flex w-full flex-col rounded-[10px] rounded-l-none border border-l-[3px] border-[var(--border-2)] bg-[var(--surface-0)] p-4 text-left transition hover:bg-[var(--surface-1)]",
          urgent > 0
            ? "border-l-[var(--danger-500)]"
            : stale
              ? "border-l-[var(--warning-500)]"
              : awaiting > 0
                ? "border-l-[var(--brand-500)]"
                : "border-l-[var(--success-500)]",
        )}
      >
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0 truncate text-[14px] font-semibold text-[var(--text-1)]" title={client.name}>
            {client.name}
          </span>
          {urgent > 0 && (
            <span className="shrink-0 rounded-[4px] border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
              {urgent} urgent
            </span>
          )}
        </span>

        <span
          className={cn(
            "mt-2 block font-[family-name:var(--font-display)] text-[32px] leading-none",
            awaiting > 0 ? "text-[var(--warning-500)]" : "text-[var(--text-4)]",
          )}
        >
          {loading ? "·" : awaiting}
        </span>
        <span className="widget-data-label mt-1 block">
          {loading ? "Loading…" : awaiting > 0 ? "Awaiting reply" : "All replied"}
        </span>

        {oldest && (
          <span className={cn("widget-data-label mt-1.5 block", stale && STALE_TEXT)}>
            Longest wait {formatAge(oldest)}
          </span>
        )}

        {/* Proportion, not three more numerals. The key under the bar carries the figures, and
            `mt-auto` pins it to the foot so every card's bar lines up however tall the row is. */}
        <span className="mt-auto block pt-3">
          <SplitBar
            parts={[
              { label: "awaiting", n: summary?.awaiting ?? 0, colour: BAR.awaiting },
              { label: "replied", n: summary?.replied ?? 0, colour: BAR.replied },
              { label: "unassigned", n: summary?.unassigned ?? 0, colour: BAR.unassigned },
            ]}
          />
        </span>
      </button>

      {/* Outside the button: nesting one interactive element inside another is invalid markup, and
          the sync icon was unreachable by keyboard when it sat inside. */}
      <SyncButton
        client={client}
        className="absolute right-2 top-2 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
      />
    </li>
  );
}

/** One client as a dense row, for a workspace past `CARD_LIMIT` where cards would be a wall. */
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
  const awaiting = summary?.awaiting ?? 0;
  const oldest = summary?.oldestAwaitingAt ?? null;
  const stale = oldest ? isLongWait(oldest) : false;
  const urgent = summary?.urgent ?? 0;

  return (
    <div
      className={cn(
        "group flex items-center gap-4 border-b border-l-2 border-[var(--border-3)] transition last:border-b-0 hover:bg-[var(--surface-1)]",
        // The one structural signal: a client with someone waiting too long is marked down the
        // left edge, so triage order is legible before you read a single number.
        stale ? "border-l-[var(--warning-500)]" : "border-l-transparent",
      )}
    >
      <button type="button" onClick={onOpen} data-care-client-open className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left">
        <span className="w-12 shrink-0 text-right">
          <span
            className={cn(
              "block font-[family-name:var(--font-display)] text-[28px] leading-none",
              awaiting > 0 ? "text-[var(--warning-500)]" : "text-[var(--text-4)]",
            )}
          >
            {loading ? "·" : awaiting}
          </span>
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-[var(--text-1)]">{client.name}</span>
          <span className="widget-data-label mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>{loading ? "Loading…" : awaiting > 0 ? "Awaiting reply" : "All replied"}</span>
            {oldest && (
              <>
                <span aria-hidden className="text-[var(--text-4)]">·</span>
                <span className={cn(stale && STALE_TEXT)}>
                  Longest wait {formatAge(oldest)}
                </span>
              </>
            )}
            {urgent > 0 && (
              <>
                <span aria-hidden className="text-[var(--text-4)]">·</span>
                <span className="font-semibold text-[var(--danger-500)]">{urgent} urgent</span>
              </>
            )}
          </span>
        </span>

        {/* Context, not a call to action — mono and quiet so the headline figure stays the signal. */}
        <span className="hidden shrink-0 items-center gap-6 sm:flex">
          {[
            { label: "Unassigned", value: summary?.unassigned },
            { label: "Replied", value: summary?.replied },
            { label: "Open", value: summary?.open },
          ].map((s) => (
            <span key={s.label} className="block text-right">
              <span className="block font-mono text-[13px] text-[var(--text-2)]">{s.value ?? "—"}</span>
              <span className="widget-data-label block">{s.label}</span>
            </span>
          ))}
        </span>
      </button>

      <SyncButton client={client} className="mr-3 opacity-0 focus-visible:opacity-100 group-hover:opacity-100" />
    </div>
  );
}

/**
 * The next people to answer, across every client, worst first.
 *
 * This is what makes a two-client workspace read as a desk rather than a directory, and it is
 * what fills the height the old page left empty. §42.10 put the same list on the cockpit's empty
 * pane, where it could only be seen by someone who had already picked a client and then opened
 * nothing — so almost nobody saw it.
 *
 * Each row opens that conversation directly. Opening its client instead would land you on a
 * queue sorted newest-first (§42.15), i.e. anywhere but the row you just clicked.
 */
function NeedsYouFirst({
  items,
  loading,
  onOpen,
}: {
  items: OldestAwaitingItem[];
  loading: boolean;
  onOpen: (item: OldestAwaitingItem) => void;
}) {
  if (loading) return <SkeletonRows count={4} className="p-4" />;

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <LifebuoyIcon className="h-6 w-6 text-[var(--success-500)]" />
        <p className="text-[13px] text-[var(--text-2)]">Nobody is waiting on a reply.</p>
      </div>
    );
  }

  return (
    <ul data-care-needs-first>
      {items.map((it) => {
        const stale = it.waitingSince ? isLongWait(it.waitingSince) : false;
        return (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => onOpen(it)}
              className={cn(
                "flex w-full items-start gap-3 border-b border-l-2 border-[var(--border-3)] px-4 py-2.5 text-left transition last:border-b-0 hover:bg-[var(--surface-1)]",
                stale ? "border-l-[var(--warning-500)]" : "border-l-transparent",
              )}
            >
              <SourceIcon source={it.source} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-4)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[var(--text-1)]" title={it.subject}>
                  {it.subject}
                </span>
                <span className="widget-data-label mt-0.5 block truncate" title={`${it.customerLabel} · ${it.clientName}`}>
                  {it.customerLabel} · {it.clientName}
                </span>
              </span>
              <span
                className={cn(
                  "widget-data-label shrink-0 tabular-nums",
                  stale && STALE_TEXT,
                  it.priority === "urgent" && "font-semibold text-[var(--danger-500)]",
                )}
              >
                {it.waitingSince ? formatAge(it.waitingSince) : "—"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function CareHome({
  onSelectClient,
}: {
  /** `conversationId` opens that client's Care straight on the record, not on its queue. */
  onSelectClient: (client: SupportClient, conversationId?: string) => void;
}) {
  const clientsQ = useSupportClients();
  const summariesQ = useClientQueueSummaries();
  const oldestQ = useOldestAwaiting(6);
  const { canManageSupport } = usePermissions();
  const [showAddClient, setShowAddClient] = useState(false);

  // The desk is the page. An ingest-only client — one whose mail we harvest and never answer — is
  // not a client anyone is failing to reply to, so it is out of the list and the totals, and sits
  // in a quiet line at the foot instead. Wedge was 249 of the 573 "awaiting a reply", which is how
  // a golf-course importer came to be reported as the second-worst support backlog Gitwork had.
  const { desk: clients, ingestOnly } = partitionCareClients(clientsQ.data?.clients ?? []);
  const summaries = summariesQ.data?.summaries ?? {};
  const loading = clientsQ.isLoading || summariesQ.isLoading;

  const ordered = [...clients].sort(byWorst(summaries));
  const totals = sumTotals(clients, summaries);
  const clientsWaiting = clients.filter((c) => (summaries[c.id]?.awaiting ?? 0) > 0).length;
  const asCards = ordered.length > 0 && ordered.length <= CARD_LIMIT;
  const basis = cardBasis(cardsPerRow(Math.min(ordered.length, CARD_LIMIT)), 12);
  const worst = totals.worstClient;
  const oldest = oldestQ.data?.items ?? [];
  const byId = new Map(clients.map((c) => [c.id, c]));

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4">
        {/* ── 01 // THE DESK ─────────────────────────────────────────────────────────────────
            One figure, who is worst off, and the first thing to do about it. Modelled on the
            Portal client hero (§129): widget-card, widget-header, a quiet brand wash behind the
            identity, and an actions group that drops to its own full-width line below `sm`. */}
        <section className="widget-card motion-rise shrink-0">
          <div className="widget-header">
            <span className="widget-header__label">
              <span className="widget-header__label--number">01</span>
              {" // THE DESK"}
            </span>
            <span className="widget-header__status">
              {clients.length > 0 ? `${clientsWaiting}/${clients.length} WAITING` : ""}
            </span>
          </div>

          <div className="relative overflow-hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,var(--surface-brand-soft)_0%,transparent_55%)]"
            />
            <div className="relative flex flex-wrap items-start gap-5 p-6">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[12px] border border-[var(--border-2)] bg-[var(--surface-0)] shadow-[var(--shadow-xs)]">
                <LifebuoyIcon className="h-7 w-7 text-[var(--brand-700)]" />
              </div>

              <div className="min-w-0 flex-1 basis-[240px]">
                {loading ? (
                  <>
                    <Skeleton className="h-8 w-28" />
                    <Skeleton className="mt-3 h-3 w-56" />
                  </>
                ) : totals.awaiting > 0 ? (
                  <>
                    <BigFigure value={totals.awaiting} unit="awaiting a reply" />
                    {/*
                      Wraps rather than truncates. Truncating this line is how the urgent count —
                      the one figure on it that is a call to action — got clipped away at 390px
                      before (§42.12). A phone spends one more line; that is the right trade.
                    */}
                    <p className="widget-data-label mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      {totals.oldestAwaitingAt && (
                        <span className={cn(isLongWait(totals.oldestAwaitingAt) && STALE_TEXT)}>
                          {`Longest wait ${formatAge(totals.oldestAwaitingAt)}`}
                          {worst ? ` · ${worst.name}` : ""}
                        </span>
                      )}
                      {totals.urgent > 0 && (
                        <>
                          <span aria-hidden className="text-[var(--text-4)]">·</span>
                          <span className="font-semibold text-[var(--danger-500)]">{totals.urgent} urgent</span>
                        </>
                      )}
                      {totals.unassigned > 0 && (
                        <>
                          <span aria-hidden className="text-[var(--text-4)]">·</span>
                          <span>{totals.unassigned} unassigned</span>
                        </>
                      )}
                    </p>
                    <SplitBar
                      parts={[
                        { label: "awaiting", n: totals.awaiting, colour: BAR.awaiting },
                        { label: "replied", n: totals.replied, colour: BAR.replied },
                      ]}
                    />
                  </>
                ) : (
                  /* The state the old `03 // Status` panel was for — and which only ever mounted
                     when nothing was waiting, so on a real workspace nobody saw it. It is the
                     hero's own empty state now, where it will actually be read. */
                  <>
                    <p className="font-[family-name:var(--font-display)] text-[28px] leading-tight text-[var(--text-1)]">
                      {clients.length === 0 ? "No clients in Care yet" : "Nothing is waiting"}
                    </p>
                    <p className="widget-data-label mt-2">
                      {clients.length === 0
                        ? "Add a client and connect their channels"
                        : "Every customer has been answered"}
                    </p>
                  </>
                )}
              </div>

              <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto sm:justify-end sm:self-end">
                {worst && (
                  <Button type="button" size="sm" onClick={() => onSelectClient(worst)}>
                    Start with the longest wait
                    <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
                {/* A real button, where it belongs. It used to be a 10px mono text link in the
                    Clients panel's header that REPLACED the client count. */}
                {canManageSupport && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowAddClient(true)}>
                    <PlusIcon className="mr-1 h-3.5 w-3.5" />
                    Add client
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── The band that fills the page ───────────────────────────────────────────────────
            The pairing idiom (§129.1): one card owns the row's height and the other fills it.
            The LEADER is "Needs you first", not "Clients" — which is the opposite of the obvious
            reading, and deliberate. The leader must be the panel whose height is PREDICTABLE: a
            fixed handful of rows. "Clients" is the one that is two cards today and twenty next
            year, so if it led, a two-client workspace would collapse the row and we would be back
            to the void this page started with. As the follower (`lg:h-0 lg:min-h-full`) its
            intrinsic height contributes nothing, and the slack is absorbed by its scroller
            instead of by white space.

            ⚠️ **No `min-h-0` anywhere on this band.** `flex-1 min-h-0` lets a flex item shrink
            below its own content, and `widget-card` is `overflow: hidden` — so on a short
            viewport the panels did not become scrollable, they became 2px tall and everything
            inside them was simply gone (measured: both panels 2px at 1280×620, Clients 2px at
            390). Without it, a flex item's automatic minimum size is its content, so the band
            grows into spare room and never collapses; past that the page scrolls. */}
        <div className="flex flex-1 flex-col gap-4 lg:flex-row">
          <div className="flex flex-col lg:h-full lg:w-[360px] lg:shrink-0">
            <CarePanel
              number="02"
              title="Needs you first"
              right={oldest.length ? `${oldest.length} SHOWN` : undefined}
              className="motion-rise flex h-full flex-col"
              bodyClassName="min-h-0 flex-1 overflow-y-auto"
              flush
            >
              <NeedsYouFirst
                items={oldest}
                loading={oldestQ.isLoading}
                onOpen={(it) => {
                  const c = byId.get(it.clientId);
                  if (c) onSelectClient(c, it.id);
                }}
              />
            </CarePanel>
          </div>

          <CarePanel
            number="03"
            title="Clients"
            right={clients.length ? String(clients.length) : undefined}
            className="motion-rise flex min-w-0 flex-1 flex-col lg:h-0 lg:min-h-full"
            bodyClassName={asCards ? "flex min-h-0 flex-1 flex-col overflow-y-auto p-3" : "min-h-0 flex-1 overflow-y-auto"}
            flush={!asCards}
          >
          {loading && (
            <div className="flex flex-wrap gap-3 p-1">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-[180px] min-w-[min(100%,260px)] flex-1 rounded-[10px]" />
              ))}
            </div>
          )}

          {!loading && clients.length === 0 && (
            <CareEmpty
              headline="No clients in Care yet."
              body={
                canManageSupport
                  ? "Add a client, then connect their support channels — a mailbox, Discord, app reviews — and their conversations land here."
                  : "Connect a client's support channels — a mailbox, Discord, app reviews — and their conversations land here."
              }
            />
          )}

          {!loading && asCards && (
            <ul className="flex flex-1 flex-wrap content-stretch gap-3" data-care-client-grid>
              {ordered.map((c) => (
                <ClientCard
                  key={c.id}
                  client={c}
                  summary={summaries[c.id]}
                  loading={summariesQ.isLoading}
                  basis={basis}
                  onOpen={() => onSelectClient(c)}
                />
              ))}
            </ul>
          )}

          {!loading && !asCards &&
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
        </div>

        {/* A footnote, not a panel and deliberately unnumbered: these clients are not part of the
            queue this page is about, and numbering them would put a connector-settings pointer in
            the same sequence as the work. It exists so nobody wonders where a client went. */}
        {!loading && ingestOnly.length > 0 && (
          <div className="shrink-0 border-t border-[var(--border-3)] pt-3">
            <p className="widget-data-label mb-1.5">Ingest only ({ingestOnly.length})</p>
            <ul className="space-y-1">
              {ingestOnly.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelectClient(c)}
                    className="flex w-full items-baseline gap-2 rounded-[6px] px-2 py-1 text-left transition hover:bg-[var(--surface-1)]"
                  >
                    <span className="shrink-0 text-[13px] font-medium text-[var(--text-2)]">{c.name}</span>
                    <span className="min-w-0 text-[12px] text-[var(--text-4)]">{ingestOnlyReason(c)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} />}
    </div>
  );
}
