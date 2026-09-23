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
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Modal } from "@/components/ui/modal";
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

/** Stamp line under a note — its age, and whether that age has gone stale. */
function NoteAge({ card }: { card: SummaryCard }) {
  if (!card.note) return null;
  return (
    <span
      className={`block text-[10px] tracking-[0.1em] uppercase ${
        card.noteStale ? "text-[var(--warning-500)]" : "text-[var(--text-4)]"
      }`}
      style={{ fontFamily: MONO }}
    >
      {/* ⚠️ Never just the note. Prose beside live figures reads as current, and a
          month-old "all on track" is the most misleading thing on this page. */}
      {card.noteAgeDays === null
        ? "Written — date unknown"
        : card.noteAgeDays === 0
          ? "Updated today"
          : `Updated ${card.noteAgeDays}d ago`}
      {card.noteStale ? ` · over ${NOTE_STALE_DAYS}d old — worth a fresh look` : ""}
    </span>
  );
}

/** The update, edited in place inside the detail view. */
function NoteEditor({ card, onDone }: { card: SummaryCard; onDone?: () => void }) {
  const update = useUpdateClientSummary();
  const [value, setValue] = useState(card.note ?? "");
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setValue(card.note ?? "");
  }, [card.note, editing]);

  if (editing) {
    return (
      <div>
        <textarea
          className="app-input min-h-[160px] text-base leading-relaxed sm:text-[14px]"
          value={value}
          autoFocus
          placeholder="What's actually going on with this client? Write it in your own words."
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
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
              onDone?.();
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

  return (
    <div>
      {card.note ? (
        <>
          <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-[var(--text-1)]">
            {card.note}
          </p>
          <div className="mt-2">
            <NoteAge card={card} />
          </div>
        </>
      ) : (
        <p className="text-[13px] text-[var(--text-4)]">No update written yet.</p>
      )}
      <button
        type="button"
        className="app-button app-button-secondary app-button-xs mt-3"
        onClick={() => setEditing(true)}
      >
        {card.note ? "Edit update" : "Write an update"}
      </button>
    </div>
  );
}

/**
 * Everything the card no longer shows, behind one click.
 *
 * ⚠️ The figures and the derived flags were taken OFF the card, not deleted. As an
 * overview they crowded out the only thing on it a person writes; as detail they are
 * exactly what you want once a card has caught your eye.
 */
function CardDetail({ card, onClose }: { card: SummaryCard; onClose: () => void }) {
  const update = useUpdateClientSummary();
  const tone = TONE[card.attention];
  return (
    <Modal
      open
      onClose={onClose}
      panelClassName="app-dialog-fixed w-full max-w-lg"
      labelledById={`summary-detail-${card.id}`}
    >
      <div className="widget-header shrink-0">
        <span
          id={`summary-detail-${card.id}`}
          className="widget-header__label flex min-w-0 items-center gap-2"
          style={{ fontFamily: MONO }}
        >
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
          <span className="truncate">{card.name.toUpperCase()}</span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="widget-header__status" style={{ fontFamily: MONO }}>
            {tone.label.toUpperCase()}
          </span>
          {/* Escape and the backdrop both close it, but neither is visible — a dialog
              with no close control reads as stuck on a touch device. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="app-button app-button-utility app-button-icon-sm"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <NoteEditor card={card} />

        <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-t border-[var(--border-1)] pt-4">
          <Figure value={card.deliveredThisWeek} label="Done / 7d" />
          <Figure value={card.inFlight} label="In flight" />
          <Figure value={card.planned} label="To do" muted />
          <Figure value={card.devCount} label="Devs" muted />
        </div>

        {card.reasons.length > 0 && (
          <p
            className="mt-3 text-[10px] leading-relaxed tracking-[0.1em] text-[var(--text-4)] uppercase"
            style={{ fontFamily: MONO }}
          >
            {card.reasons.join(" · ")}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--border-1)] px-5 py-3">
        <a
          href={`/app/portal/${card.slug}`}
          className="text-[13px] text-[var(--brand-700)] hover:underline"
        >
          Open client →
        </a>
        <button
          type="button"
          className="text-[12px] text-[var(--text-4)] hover:underline"
          onClick={async () => {
            await update.mutateAsync({ clientId: card.id, hidden: true });
            onClose();
          }}
        >
          Hide from board
        </button>
      </div>
    </Modal>
  );
}

function Card({ card, index }: { card: SummaryCard; index: number }) {
  const [open, setOpen] = useState(false);
  const tone = TONE[card.attention];
  return (
    <>
      {/* The whole card is the control — a preview you click to read. Nothing else in
          it is interactive, so there are no nested buttons and no dead zones. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="widget-card group flex min-w-0 flex-col text-left transition hover:border-[var(--brand-500)]"
      >
        <div className="widget-header w-full">
          <span
            className="widget-header__label flex min-w-0 items-center gap-2"
            style={{ fontFamily: MONO }}
          >
            {/* House card-grid grammar: one `NN //` sequence per screen, continuing
                from the portfolio card above. The order moves with attention, so the
                numbers are positional anchors for scanning, not client identifiers. */}
            <span className="widget-header__label--number shrink-0">
              {String(index).padStart(2, "0")}
            </span>
            {/* The dot IS the status. Printing "NEEDS ATTENTION" beside a red dot says
                the same thing twice and spends the only slot on the card that could
                carry a fact — so the derived signals live on its tooltip instead, and
                the slot carries the team size. */}
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`}
              title={
                card.reasons.length > 0
                  ? `${tone.label} — ${card.reasons.join(" · ")}`
                  : tone.label
              }
            />
            <span className="sr-only">{tone.label}. </span>
            <span className="truncate">
              {" // "}
              {card.name.toUpperCase()}
            </span>
          </span>
          <span className="widget-header__status shrink-0" style={{ fontFamily: MONO }}>
            {card.devCount} {card.devCount === 1 ? "DEV" : "DEVS"}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col p-4">
          {card.note ? (
            <>
              {/* ⚠️ Clamped to two lines, and the full text is NOT in a `title` — it
                  would be a tooltip nobody can reach on a phone. The detail view is
                  one click away and is the recoverable path. */}
              <p className="line-clamp-2 text-[14px] leading-relaxed text-[var(--text-1)]">
                {card.note}
              </p>
              <div className="mt-2">
                <NoteAge card={card} />
              </div>
            </>
          ) : (
            <p className="text-[13px] text-[var(--text-4)] group-hover:text-[var(--brand-700)]">
              Write an update →
            </p>
          )}
        </div>
      </button>
      {open && <CardDetail card={card} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ClientSummaryBoardView() {
  const { data, isLoading, isError, error } = useClientSummaryBoard();
  const update = useUpdateClientSummary();
  const [showHidden, setShowHidden] = useState(false);

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

  const { cards, hidden, hiddenCards } = data;

  return (
    <div className="space-y-4">
      <section className="widget-card">
        <div className="widget-header">
          <span className="widget-header__label" style={{ fontFamily: MONO }}>
            <span className="widget-header__label--number">01</span>
            {" // THE PORTFOLIO"}
          </span>
          {/* ⚠️ A board quietly showing 12 of 13 looks complete and is not, so the
              hidden ones are never merely counted — this opens the list and each one
              can be put back from here. */}
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              className="app-button app-button-secondary app-button-xs shrink-0"
              aria-expanded={showHidden}
            >
              {showHidden ? "Hide" : "Show"} {hidden} hidden
            </button>
          ) : (
            <span className="widget-header__status shrink-0" style={{ fontFamily: MONO }}>
              NONE HIDDEN
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
          <Figure value={cards.length} label={cards.length === 1 ? "Client" : "Clients"} />
          {/* Distinct people, not a sum of the per-client figures — a developer works
              across several clients, so a sum would count placements. */}
          <Figure value={data.devTotal} label={data.devTotal === 1 ? "Dev" : "Devs"} />
        </div>
        {showHidden && hidden > 0 && (
          <div className="border-t border-[var(--border-1)] px-5 py-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
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
