"use client";

/**
 * The Board's Schedule: the plan as a list of weeks rather than a month grid (CLAUDE.md §128).
 * Each week says, once, which releases are running (with % done), what is due, what actually
 * happened (stages each card went through, and when it was finished) and the client's key dates.
 * Overdue cards are pinned above the weeks; cards with no date sit in a tray below, where whoever
 * may edit a card can give it one. Rules: src/lib/wiki-board-schedule.ts.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDaysIcon, ChevronDownIcon, PlusIcon, StarIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { BAR_TONE, DEV_TONE } from "@/components/clients/wiki/wiki-board-timeline";
import {
  addKeyDateApi,
  deleteKeyDateApi,
  updateBoardCardApi,
  updateKeyDateApi,
  type BoardTarget,
  type KeyDateForm,
} from "@/hooks/use-wiki-board";
import { KEY_DATE_LIMITS } from "@/lib/wiki-board-key-dates";
import { dayOf } from "@/lib/wiki-board-timeline";
import {
  SCHEDULE_WEEKS,
  buildSchedule,
  dayLabel,
  isoDay,
  scheduleRows,
  todayDay,
  weekLabel,
  type ScheduleMode,
  type ScheduleWeek,
} from "@/lib/wiki-board-schedule";
import type { WikiBoardCard, WikiBoardKeyDate, WikiBoardRelease } from "@/types/wiki-board";

const MONO = { fontFamily: "var(--font-mono)" } as const;
/** Undated cards listed before "Show all". */
const UNDATED_SHOWN = 30;

export function WikiBoardSchedule({
  cards,
  releases,
  keyDates: initialKeyDates,
  target,
  readOnly,
  canEditCard,
  canEditKeyDates,
  canDeleteKeyDates,
  onOpen,
  onPlace,
  refresh,
}: {
  /** The cards in view, already filtered the way the Board is. */
  cards: WikiBoardCard[];
  releases: WikiBoardRelease[];
  keyDates: WikiBoardKeyDate[];
  target: BoardTarget;
  /** A card the viewer can see but not open (the team's dev tasks, for the client). */
  readOnly: (card: WikiBoardCard) => boolean;
  /** Whoever is looking may give this card a date. */
  canEditCard: (card: WikiBoardCard) => boolean;
  canEditKeyDates: boolean;
  canDeleteKeyDates: boolean;
  onOpen: (id: string) => void;
  /** Put a card the server returned in place on the Board. */
  onPlace: (card: WikiBoardCard) => void;
  refresh: () => void;
}) {
  const toast = useToast();
  const today = useMemo(() => todayDay(), []);
  const thisYear = new Date(today * 86_400_000).getUTCFullYear();
  const [mode, setMode] = useState<ScheduleMode>("upcoming");
  const [weeks, setWeeks] = useState(SCHEDULE_WEEKS);
  const [keyDates, setKeyDates] = useState(initialKeyDates);
  useEffect(() => setKeyDates(initialKeyDates), [initialKeyDates]);
  const [editing, setEditing] = useState<WikiBoardKeyDate | "new" | null>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  const schedule = useMemo(
    () => buildSchedule({ cards, releases, keyDates, today, mode, weeks }),
    [cards, releases, keyDates, today, mode, weeks],
  );
  const rows = useMemo(() => scheduleRows(schedule.weeks), [schedule.weeks]);

  const switchMode = (m: ScheduleMode) => {
    setMode(m);
    setWeeks(SCHEDULE_WEEKS);
  };
  const goToday = () => {
    switchMode("upcoming");
    requestAnimationFrame(() => currentRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  async function saveKeyDate(form: KeyDateForm, existing: WikiBoardKeyDate | null) {
    const saved = existing ? await updateKeyDateApi(target, existing.id, form) : await addKeyDateApi(target, form);
    setKeyDates((list) => [...list.filter((k) => k.id !== saved.id), saved].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)));
    refresh();
  }

  async function removeKeyDate(k: WikiBoardKeyDate) {
    await deleteKeyDateApi(target, k.id);
    setKeyDates((list) => list.filter((x) => x.id !== k.id));
    refresh();
  }

  async function setDue(card: WikiBoardCard, day: string) {
    try {
      onPlace(await updateBoardCardApi(target, card.id, { dueDate: day }));
      refresh();
    } catch (err) {
      toast.error("Couldn't set the date", err instanceof Error ? err.message : "Please try again.");
      throw err;
    }
  }

  return (
    <div className="space-y-3" data-board-schedule>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Schedule"
          className="h-9"
          value={mode}
          onChange={switchMode}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
          ]}
        />
        <button type="button" className="app-button app-button-secondary app-button-sm h-9" onClick={goToday}>
          Today
        </button>
        <span className="text-[12px] text-[var(--text-3)]">{dayLabel(today)}</span>
        {canEditKeyDates ? (
          <button
            type="button"
            className="app-button app-button-secondary app-button-sm ml-auto h-9"
            onClick={() => setEditing("new")}
            data-schedule-add-key-date
          >
            <PlusIcon className="h-4 w-4" />
            Key date
          </button>
        ) : null}
      </div>

      {mode === "upcoming" && schedule.overdue.length ? (
        <div className="rounded-[8px] border border-red-200 bg-red-50/60 p-3" data-schedule-overdue>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-red-700" style={MONO}>
            Overdue · {schedule.overdue.length}
          </p>
          <ul className="mt-2 space-y-1">
            {schedule.overdue.map(({ card, day }) => (
              <li key={card.id} className="flex min-w-0 items-center gap-2 text-[13px]">
                <span className="w-[92px] shrink-0 text-[12px] text-red-700" style={MONO}>
                  {dayLabel(day)}
                </span>
                <CardChip card={card} readOnly={readOnly(card)} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[8px] border border-[var(--border-2)]">
        {rows.map((row) =>
          row.kind === "quiet" ? (
            <QuietRow key={`q-${row.weeks[0].monday}`} weeks={row.weeks} thisYear={thisYear} />
          ) : (
            <WeekRow
              key={row.week.monday}
              week={row.week}
              thisYear={thisYear}
              today={today}
              innerRef={row.week.isCurrent ? currentRef : undefined}
              readOnly={readOnly}
              onOpen={onOpen}
              onEditKeyDate={canEditKeyDates ? setEditing : undefined}
            />
          ),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {schedule.hasMore ? (
          <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setWeeks((w) => w + SCHEDULE_WEEKS)}>
            Show {SCHEDULE_WEEKS} more weeks
          </button>
        ) : (
          <p className="text-[12px] text-[var(--text-4)]">
            {mode === "upcoming" ? "Nothing dated after these weeks." : "Nothing dated before these weeks."}
          </p>
        )}
      </div>

      {schedule.undated.length ? (
        <UndatedTray cards={schedule.undated} readOnly={readOnly} canEditCard={canEditCard} onOpen={onOpen} onSetDue={setDue} />
      ) : null}

      {editing ? (
        <KeyDateDialog
          keyDate={editing === "new" ? null : editing}
          defaultDay={isoDay(today)}
          canDelete={canDeleteKeyDates}
          onClose={() => setEditing(null)}
          onSave={saveKeyDate}
          onDelete={removeKeyDate}
        />
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-4)]" style={MONO}>
      {children}
    </p>
  );
}

function QuietRow({ weeks, thisYear }: { weeks: ScheduleWeek[]; thisYear: number }) {
  const first = weeks.reduce((a, w) => Math.min(a, w.monday), Infinity);
  const last = weeks.reduce((a, w) => Math.max(a, w.monday), -Infinity);
  const label = weeks.length === 1 ? weekLabel(first, thisYear) : `${weekLabel(first, thisYear).split(" – ")[0]} – ${weekLabel(last, thisYear).split(" – ")[1]}`;
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border-2)] bg-[var(--surface-1)]/50 px-3 py-2 text-[12px] text-[var(--text-4)] last:border-b-0">
      <span style={MONO}>{label}</span>
      <span>{weeks.length === 1 ? "Nothing planned this week." : `${weeks.length} quiet weeks.`}</span>
    </div>
  );
}

function WeekRow({
  week,
  thisYear,
  today,
  innerRef,
  readOnly,
  onOpen,
  onEditKeyDate,
}: {
  week: ScheduleWeek;
  thisYear: number;
  today: number;
  innerRef?: React.Ref<HTMLDivElement>;
  readOnly: (card: WikiBoardCard) => boolean;
  onOpen: (id: string) => void;
  onEditKeyDate?: (k: WikiBoardKeyDate) => void;
}) {
  return (
    <div
      ref={innerRef}
      className={cn(
        "grid grid-cols-1 gap-2 border-b border-[var(--border-2)] p-3 last:border-b-0 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-4",
        week.isCurrent && "bg-[var(--brand-50)]/40",
      )}
      data-schedule-week={week.isCurrent ? "current" : ""}
    >
      <div className="flex items-center gap-2 sm:block">
        <p className="text-[13px] font-semibold text-[var(--text-1)]">{weekLabel(week.monday, thisYear)}</p>
        {week.isCurrent ? (
          <span
            className="inline-flex rounded-[4px] bg-[var(--brand-600)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-white sm:mt-1"
            style={MONO}
          >
            This week · {dayLabel(today).split(" ")[0]}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 space-y-3">
        {week.empty ? <p className="text-[13px] text-[var(--text-4)]">Nothing planned yet.</p> : null}

        {week.releases.length ? (
          <div className="space-y-1.5">
            <SectionLabel>Releases</SectionLabel>
            {week.releases.map((r) => (
              <div
                key={r.release.id}
                className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-r-[6px] rounded-l-none border border-l-[3px] border-[var(--border-2)] border-l-[var(--brand-500)] bg-[var(--surface-0)] px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-1)]" title={r.release.label}>
                  {r.release.label}
                </span>
                <span className="text-[11px] uppercase tracking-[0.04em] text-[var(--text-3)]" style={MONO}>
                  {r.startsThisWeek && r.endsThisWeek
                    ? "Starts and ships"
                    : r.startsThisWeek
                      ? `Starts ${r.release.startDate ? dayLabel(dayOf(r.release.startDate)) : ""}`
                      : r.endsThisWeek
                        ? `Ships ${r.release.endDate ? dayLabel(dayOf(r.release.endDate)) : ""}`
                        : "Under way"}
                </span>
                {r.percent !== null ? (
                  <span className="ml-auto flex items-center gap-2">
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden>
                      <span className="block h-full bg-[var(--brand-500)]" style={{ width: `${r.percent}%` }} />
                    </span>
                    <span className="text-[11px] tabular-nums text-[var(--text-2)]" style={MONO}>
                      {r.percent}% done
                    </span>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {week.keyDates.length ? (
          <div className="space-y-1">
            <SectionLabel>Key dates</SectionLabel>
            {week.keyDates.map(({ keyDate, day }) => (
              <div key={keyDate.id} className="flex min-w-0 items-start gap-2 text-[13px]">
                <span className="w-[92px] shrink-0 pt-0.5 text-[12px] text-[var(--text-3)]" style={MONO}>
                  {dayLabel(day)}
                </span>
                <StarIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                {onEditKeyDate ? (
                  <button
                    type="button"
                    className="min-w-0 text-left font-medium text-[var(--text-1)] hover:underline"
                    onClick={() => onEditKeyDate(keyDate)}
                    title={keyDate.note ?? undefined}
                  >
                    {keyDate.title}
                  </button>
                ) : (
                  <span className="min-w-0 font-medium text-[var(--text-1)]" title={keyDate.note ?? undefined}>
                    {keyDate.title}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {week.due.length ? (
          <div className="space-y-1">
            <SectionLabel>Due</SectionLabel>
            {week.due.map(({ card, day }) => (
              <div key={card.id} className="flex min-w-0 items-center gap-2">
                <span className="w-[92px] shrink-0 text-[12px] text-[var(--text-3)]" style={MONO}>
                  {dayLabel(day)}
                </span>
                <CardChip card={card} readOnly={readOnly(card)} onOpen={onOpen} />
              </div>
            ))}
          </div>
        ) : null}

        {week.happened.length ? (
          <div className="space-y-1">
            <SectionLabel>What happened</SectionLabel>
            {week.happened.map((e) => (
              <div key={`${e.card.id}-${e.label}-${e.day}`} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="w-[92px] shrink-0 text-[12px] text-[var(--text-3)]" style={MONO}>
                  {dayLabel(e.day)}
                </span>
                <span className="shrink-0 text-[11px] uppercase tracking-[0.04em] text-[var(--text-2)]" style={MONO}>
                  {e.label === "Done" ? "Finished" : `→ ${e.label}`}
                </span>
                <CardChip card={e.card} readOnly={readOnly(e.card)} onOpen={onOpen} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CardChip({ card, readOnly, onOpen }: { card: WikiBoardCard; readOnly: boolean; onOpen: (id: string) => void }) {
  const tone = card.isCard && card.itemType ? (BAR_TONE[card.itemType] ?? BAR_TONE.feature) : DEV_TONE;
  const cls = cn(
    "block min-w-0 max-w-full truncate rounded-[4px] border px-1.5 py-0.5 text-left text-[12px] font-medium",
    tone,
    card.status === "DONE" && "opacity-60 line-through",
  );
  if (readOnly) {
    return (
      <span className={cls} title={card.title}>
        {card.title}
      </span>
    );
  }
  return (
    <button type="button" className={cn(cls, "hover:brightness-95")} title={card.title} onClick={() => onOpen(card.id)}>
      {card.title}
    </button>
  );
}

function UndatedTray({
  cards,
  readOnly,
  canEditCard,
  onOpen,
  onSetDue,
}: {
  cards: WikiBoardCard[];
  readOnly: (card: WikiBoardCard) => boolean;
  canEditCard: (card: WikiBoardCard) => boolean;
  onOpen: (id: string) => void;
  onSetDue: (card: WikiBoardCard, day: string) => Promise<void>;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? cards : cards.slice(0, UNDATED_SHOWN);
  return (
    <details className="group rounded-[8px] border border-[var(--border-2)]" data-schedule-undated>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-[var(--text-1)]">
        <CalendarDaysIcon className="h-4 w-4 text-[var(--text-3)]" aria-hidden />
        No date yet
        <span className="rounded-[4px] bg-[var(--surface-1)] px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--text-2)]" style={MONO}>
          {cards.length}
        </span>
        <span className="hidden text-[12px] font-normal text-[var(--text-4)] sm:inline">Give a card a date to put it on the Schedule.</span>
        <ChevronDownIcon className="ml-auto h-4 w-4 text-[var(--text-3)] transition group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="divide-y divide-[var(--border-2)] border-t border-[var(--border-2)]">
        {shown.map((c) => (
          <UndatedRow key={c.id} card={c} readOnly={readOnly(c)} canEdit={canEditCard(c)} onOpen={onOpen} onSetDue={onSetDue} />
        ))}
      </ul>
      {cards.length > shown.length ? (
        <div className="border-t border-[var(--border-2)] px-3 py-2">
          <button type="button" className="text-[12px] font-medium text-[var(--brand-600)] hover:underline" onClick={() => setAll(true)}>
            Show all {cards.length}
          </button>
        </div>
      ) : null}
    </details>
  );
}

function UndatedRow({
  card,
  readOnly,
  canEdit,
  onOpen,
  onSetDue,
}: {
  card: WikiBoardCard;
  readOnly: boolean;
  canEdit: boolean;
  onOpen: (id: string) => void;
  onSetDue: (card: WikiBoardCard, day: string) => Promise<void>;
}) {
  const [picking, setPicking] = useState(false);
  const [day, setDay] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!day) return;
    setSaving(true);
    try {
      await onSetDue(card, day);
      setPicking(false);
    } catch {
      // The toast has said why; the picker stays open with the date kept.
    } finally {
      setSaving(false);
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2" data-schedule-undated-row>
      <div className="min-w-0 flex-1">
        <CardChip card={card} readOnly={readOnly} onOpen={onOpen} />
      </div>
      {canEdit ? (
        picking ? (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              className="app-input h-8 w-[150px] text-[16px] sm:text-[13px]"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              aria-label={`Due date for ${card.title}`}
              autoFocus
            />
            <button type="button" className="app-button app-button-primary app-button-sm h-8" disabled={!day || saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="app-button app-button-secondary app-button-sm h-8" onClick={() => setPicking(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="app-button app-button-secondary app-button-sm h-8 shrink-0" onClick={() => setPicking(true)} data-schedule-set-date>
            Set date
          </button>
        )
      ) : null}
    </li>
  );
}

function KeyDateDialog({
  keyDate,
  defaultDay,
  canDelete,
  onClose,
  onSave,
  onDelete,
}: {
  keyDate: WikiBoardKeyDate | null;
  defaultDay: string;
  canDelete: boolean;
  onClose: () => void;
  onSave: (form: KeyDateForm, existing: WikiBoardKeyDate | null) => Promise<void>;
  onDelete: (k: WikiBoardKeyDate) => Promise<void>;
}) {
  const [title, setTitle] = useState(keyDate?.title ?? "");
  const [date, setDate] = useState(keyDate?.date ?? defaultDay);
  const [note, setNote] = useState(keyDate?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={keyDate ? "Edit key date" : "Add a key date"} panelClassName="w-full max-w-md">
      <form
        className="space-y-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !date) return;
          void run(() => onSave({ title: title.trim(), date, note: note.trim() || null }, keyDate));
        }}
        data-schedule-key-date-form
      >
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-[var(--text-2)]">Title</span>
          <input
            className="app-input w-full text-[16px] sm:text-[14px]"
            value={title}
            maxLength={KEY_DATE_LIMITS.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Content drop, launch, event…"
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-[var(--text-2)]">Date</span>
          <input type="date" className="app-input w-full text-[16px] sm:text-[14px]" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-[var(--text-2)]">Note (optional)</span>
          <textarea
            className="app-input min-h-[72px] w-full px-3 py-2 text-[16px] sm:text-[14px]"
            value={note}
            maxLength={KEY_DATE_LIMITS.note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {keyDate?.imported ? <p className="text-[12px] text-[var(--text-4)]">Imported from your planning tool.</p> : null}
        {error ? <p className="text-[12px] text-red-700">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {keyDate && canDelete ? (
            confirming ? (
              <>
                <span className="text-[12px] text-[var(--text-2)]">Delete this date?</span>
                <button type="button" className="app-button app-button-danger app-button-sm" disabled={busy} onClick={() => void run(() => onDelete(keyDate))}>
                  Delete
                </button>
                <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setConfirming(false)}>
                  Keep
                </button>
              </>
            ) : (
              <button type="button" className="app-button app-button-secondary app-button-sm" onClick={() => setConfirming(true)}>
                Delete
              </button>
            )
          ) : null}
          <div className="ml-auto flex gap-2">
            <button type="button" className="app-button app-button-secondary app-button-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="app-button app-button-primary app-button-sm" disabled={busy || !title.trim() || !date}>
              {busy ? "Saving…" : keyDate ? "Save" : "Add"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
