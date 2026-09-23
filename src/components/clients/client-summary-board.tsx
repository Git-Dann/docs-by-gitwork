"use client";

/**
 * The client summary board — one card per client, for reading the whole portfolio in
 * one pass.
 *
 * Built for SCANNING, which drives three decisions:
 *
 *   - Worst first. A board that is mostly fine puts its exceptions at the top, so the
 *     answer to "who needs me" is the first thing read rather than something found.
 *   - Colour only where it means something. If every card carries a tint, none of them
 *     signals anything (§42.7's lesson about a status that appears on every row).
 *   - The hand-written note shows its age. It sits beside figures that updated this
 *     morning, and undated prose reads as current forever.
 */

import { useEffect, useState } from "react";
import { MONO } from "@/components/analytics/analytics-widgets";
import { useClientSummaryBoard, useUpdateClientSummary } from "@/hooks/use-client-summary";
import { NOTE_STALE_DAYS, type SummaryAttention, type SummaryCard } from "@/lib/client-summary";

const TONE: Record<SummaryAttention, { dot: string; label: string }> = {
  critical: { dot: "bg-[var(--danger-500)]", label: "Needs attention" },
  watch: { dot: "bg-[var(--warning-500)]", label: "Watch" },
  ok: { dot: "bg-[var(--success-500)]", label: "On track" },
  // ⚠️ Slate, never green. "Nobody has checked" is not "fine", and the whole reason
  // this bucket exists is that colouring it green would say the opposite.
  unmeasured: { dot: "bg-[var(--text-4)]", label: "No signal" },
};

function Figure({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <div>
      <p
        className={`text-[18px] leading-none tabular-nums ${muted ? "text-[var(--text-4)]" : "text-[var(--text-1)]"}`}
        style={{ fontFamily: MONO }}
      >
        {value}
      </p>
      <p
        className="mt-1 text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
        style={{ fontFamily: MONO }}
      >
        {label}
      </p>
    </div>
  );
}

function NoteEditor({ card }: { card: SummaryCard }) {
  const update = useUpdateClientSummary();
  const [value, setValue] = useState(card.note ?? "");
  const [editing, setEditing] = useState(false);
  // Re-sync when the board refetches under an editor that is closed.
  useEffect(() => {
    if (!editing) setValue(card.note ?? "");
  }, [card.note, editing]);

  if (editing) {
    return (
      <div>
        <textarea
          className="app-input min-h-[120px] text-base leading-relaxed sm:text-[14px]"
          value={value}
          autoFocus
          placeholder="What's actually going on with this client? Write it in your own words."
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setValue(card.note ?? "");
              setEditing(false);
            }
          }}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="app-button app-button-primary app-button-xs"
            disabled={update.isPending}
            onClick={async () => {
              await update.mutateAsync({ clientId: card.id, note: value });
              setEditing(false);
            }}
          >
            {update.isPending ? "Saving…" : "Save update"}
          </button>
          <button
            type="button"
            className="app-button app-button-secondary app-button-xs"
            onClick={() => {
              setValue(card.note ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  /**
   * ⚠️ The resting state IS the card's content, not a footnote under the derived
   * figures. The first cut put three derived sentences above a dashed "Add a note…"
   * box, and the question it produced was "where do I type?" — the page exists to
   * carry what a person writes, so that has to be the thing the eye lands on.
   */
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group block w-full text-left"
    >
      {card.note ? (
        <>
          <span className="block text-[14px] leading-relaxed text-[var(--text-1)] group-hover:text-[var(--brand-700)]">
            {card.note}
          </span>
          <span
            className={`mt-2 block text-[10px] tracking-[0.1em] uppercase ${
              card.noteStale ? "text-[var(--warning-500)]" : "text-[var(--text-4)]"
            }`}
            style={{ fontFamily: MONO }}
          >
            {/* ⚠️ Never just the note. Prose beside live figures reads as current, and
                a month-old "all on track" is the most misleading thing on this page. */}
            {card.noteAgeDays === null
              ? "Written — date unknown"
              : card.noteAgeDays === 0
                ? "Updated today"
                : `Updated ${card.noteAgeDays}d ago`}
            {card.noteStale ? ` · over ${NOTE_STALE_DAYS}d old — worth a fresh look` : ""}
            {" "}
            <span className="ml-2 text-[var(--text-4)] normal-case opacity-0 transition group-hover:opacity-100">
              Click to edit
            </span>
          </span>
        </>
      ) : (
        <span className="block rounded-md border border-dashed border-[var(--border-2)] px-3 py-5 text-center text-[13px] text-[var(--text-3)] transition group-hover:border-[var(--brand-500)] group-hover:text-[var(--brand-700)]">
          Write an update →
        </span>
      )}
    </button>
  );
}

function Card({ card, index }: { card: SummaryCard; index: number }) {
  const update = useUpdateClientSummary();
  const tone = TONE[card.attention];
  return (
    <section className="widget-card flex min-w-0 flex-col">
      <div className="widget-header">
        <span
          className="widget-header__label flex min-w-0 items-center gap-2"
          style={{ fontFamily: MONO }}
        >
          {/* House card-grid grammar: one `NN //` sequence per screen, continuing from
              the portfolio card above. The order moves with attention, so the numbers
              are positional anchors for scanning, not client identifiers. */}
          <span className="widget-header__label--number shrink-0">
            {String(index).padStart(2, "0")}
          </span>
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
          <span className="truncate" title={card.name}>
            {" // "}
            {card.name.toUpperCase()}
          </span>
        </span>
        <span className="widget-header__status shrink-0" style={{ fontFamily: MONO }}>
          {tone.label.toUpperCase()}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <NoteEditor card={card} />

        <div className="mt-auto pt-4">
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Figure value={card.deliveredThisWeek} label="Done / 7d" />
            <Figure value={card.inFlight} label="In flight" />
            <Figure value={card.planned} label="To do" muted />
            <Figure value={card.devCount} label="Devs" muted />
          </div>

          {/* One quiet strip, not a stack of sentences — the derived signals are
              context for the update above, not the point of the card. */}
          {card.reasons.length > 0 && (
            <p
              className="mt-3 text-[10px] leading-relaxed tracking-[0.1em] text-[var(--text-4)] uppercase"
              style={{ fontFamily: MONO }}
            >
              {card.reasons.join(" · ")}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border-1)] pt-2">
          <a
            href={`/app/portal/${card.slug}`}
            className="text-[12px] text-[var(--brand-700)] hover:underline"
          >
            Open client →
          </a>
          <button
            type="button"
            className="text-[11px] text-[var(--text-4)] hover:underline"
            onClick={() => void update.mutateAsync({ clientId: card.id, hidden: true })}
          >
            Hide
          </button>
        </div>
      </div>
    </section>
  );
}

export function ClientSummaryBoardView() {
  const { data, isLoading, isError, error } = useClientSummaryBoard();
  const update = useUpdateClientSummary();

  if (isLoading) {
    return <p className="p-6 text-[13px] text-[var(--text-4)]">Loading the board…</p>;
  }
  if (isError || !data) {
    return (
      <p className="p-6 text-[13px] text-[var(--danger-500)]">
        {error instanceof Error ? error.message : "Could not load the summary."}
      </p>
    );
  }

  const { cards, counts, hidden, hiddenCards } = data;

  return (
    <div className="space-y-4">
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // THE PORTFOLIO"}
          </span>
          <span className="widget-header__status" style={{ fontFamily: MONO }}>
            {cards.length} {cards.length === 1 ? "CLIENT" : "CLIENTS"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
          <Figure value={counts.critical} label="Need attention" />
          <Figure value={counts.watch} label="Watch" />
          <Figure value={counts.unmeasured} label="No signal" muted />
          <Figure value={counts.ok} label="On track" muted />
        </div>
        {/* ⚠️ A board quietly showing 9 of 13 looks complete and is not — so the hidden
            ones are named, and each can be put back from here. */}
        {hidden > 0 && (
          <div className="border-t border-[var(--border-1)] px-5 py-3">
            <p
              className="text-[10px] tracking-[0.1em] text-[var(--text-4)] uppercase"
              style={{ fontFamily: MONO }}
            >
              {hidden} hidden
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {hiddenCards.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="text-[12px] text-[var(--text-3)] hover:underline"
                  onClick={() => void update.mutateAsync({ clientId: c.id, hidden: false })}
                >
                  {c.name} <span className="text-[var(--text-4)]">· show</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {cards.length === 0 ? (
        <p className="p-6 text-[13px] text-[var(--text-4)]">
          No clients to show — every one is hidden, or there are none yet.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((c, i) => (
            <Card key={c.id} card={c} index={i + 2} />
          ))}
        </div>
      )}
      {update.isError && (
        <p className="text-[12px] text-[var(--danger-500)]">
          {update.error instanceof Error ? update.error.message : "That change did not save."}
        </p>
      )}
    </div>
  );
}
