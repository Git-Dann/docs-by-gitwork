"use client";

/**
 * The Board's Calendar: the same cards and releases as the Board and the Timeline, by date.
 * A month (or a week), Monday first. Cards sit on their due date; a card with no due date isn't
 * here. Each release is a thin span across its days, with its start and end marked. Clicking a
 * card opens the same detail as the Board. On a phone the month becomes a list of the days that
 * have something on them. Date maths: src/lib/wiki-board-calendar.ts.
 */

import { useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { BAR_TONE, DEV_TONE } from "@/components/clients/wiki/wiki-board-timeline";
import {
  WEEKDAYS,
  addMonths,
  agendaDays,
  calendarDays,
  dateNumber,
  dayLabel,
  monthGrid,
  monthOf,
  monthTitle,
  releaseSpansForWeek,
  weekOf,
  weekTitle,
  type CalendarDay,
  type CalendarScale,
} from "@/lib/wiki-board-calendar";
import { dayOf } from "@/lib/wiki-board-timeline";
import type { WikiBoardCard, WikiBoardRelease } from "@/types/wiki-board";

const MONO = { fontFamily: "var(--font-mono)" } as const;
/** Cards shown in a month cell before "+N more". */
const PER_CELL = 3;

function shortRelease(r: WikiBoardRelease): string {
  return r.label.split(" · ")[0] || r.label;
}

export function WikiBoardCalendar({
  cards,
  releases,
  readOnly,
  onOpen,
}: {
  /** The cards in view, already filtered the way the Board is. */
  cards: WikiBoardCard[];
  releases: WikiBoardRelease[];
  /** A card the viewer can see but not open (the team's dev tasks, for the client). */
  readOnly: (card: WikiBoardCard) => boolean;
  onOpen: (id: string) => void;
}) {
  const today = useMemo(() => dayOf(new Date()), []);
  const [scale, setScale] = useState<CalendarScale>("month");
  const [cursor, setCursor] = useState(() => monthOf(today));
  const [weekStart, setWeekStart] = useState(() => weekOf(today)[0]);
  const [openDay, setOpenDay] = useState<CalendarDay | null>(null);

  const weeks = useMemo(
    () => (scale === "month" ? monthGrid(cursor.year, cursor.month) : [weekOf(weekStart)]),
    [scale, cursor, weekStart],
  );
  const from = weeks[0][0];
  const to = weeks[weeks.length - 1][6];
  const days = useMemo(() => calendarDays(cards, releases, from, to), [cards, releases, from, to]);
  const undated = cards.filter((c) => !c.dueDate).length;

  const title = scale === "month" ? monthTitle(cursor.year, cursor.month) : weekTitle(weekStart);
  const step = (by: number) => {
    if (scale === "month") setCursor((c) => addMonths(c.year, c.month, by));
    else setWeekStart((w) => w + by * 7);
  };
  const goToday = () => {
    setCursor(monthOf(today));
    setWeekStart(weekOf(today)[0]);
  };
  const inMonth = (day: number) => scale === "week" || monthOf(day).month === cursor.month;
  const agenda = agendaDays(days, from, to).filter((d) => inMonth(d.day));

  return (
    <div className="space-y-3" data-board-calendar>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-1 text-[18px] font-semibold text-[var(--text-1)]">{title}</h3>
        <div className="flex items-center gap-1">
          <button type="button" className="app-button app-button-secondary app-button-sm h-9 w-9 px-0" onClick={() => step(-1)} aria-label={scale === "month" ? "Previous month" : "Previous week"}>
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button type="button" className="app-button app-button-secondary app-button-sm h-9 w-9 px-0" onClick={() => step(1)} aria-label={scale === "month" ? "Next month" : "Next week"}>
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <button type="button" className="app-button app-button-secondary app-button-sm h-9" onClick={goToday}>
            Today
          </button>
        </div>
        <div className="ml-auto">
          <Segmented
            label="Calendar scale"
            className="h-9"
            value={scale}
            onChange={setScale}
            options={[
              { value: "month", label: "Month" },
              { value: "week", label: "Week" },
            ]}
          />
        </div>
      </div>

      {/* Tablet and up: the grid. */}
      <div className="hidden overflow-hidden rounded-[8px] border border-[var(--border-2)] sm:block">
        <div className="grid grid-cols-7 border-b border-[var(--border-2)] bg-[var(--surface-1)]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-1.5 text-[11px] uppercase tracking-[0.06em] text-[var(--text-4)]" style={MONO}>
              {w}
            </div>
          ))}
        </div>
        {weeks.map((week) => {
          const spans = releaseSpansForWeek(releases, week);
          const tracks = spans.reduce((n, s) => Math.max(n, s.track + 1), 0);
          return (
            <div key={week[0]} className="relative border-b border-[var(--border-2)] last:border-b-0">
              {/* Release spans run across the top of the week, one thin line per release. */}
              {tracks ? (
                <div className="pointer-events-none absolute inset-x-0 top-8 z-10" aria-hidden>
                  {spans.map((s) => (
                    <div
                      key={s.release.id}
                      className={cn(
                        "absolute h-[3px] bg-[var(--brand-500)]/70",
                        s.startsHere && "rounded-l-full",
                        s.endsHere && "rounded-r-full",
                      )}
                      style={{
                        left: `calc(${(s.fromCol / 7) * 100}% + ${s.startsHere ? 8 : 0}px)`,
                        width: `calc(${((s.toCol - s.fromCol + 1) / 7) * 100}% - ${(s.startsHere ? 8 : 0) + (s.endsHere ? 8 : 0)}px)`,
                        top: s.track * 6,
                      }}
                      title={s.release.label}
                    />
                  ))}
                </div>
              ) : null}
              <div className="grid grid-cols-7">
                {week.map((day) => {
                  const entry = days.get(day)!;
                  const shown = scale === "month" ? entry.cards.slice(0, PER_CELL) : entry.cards;
                  const more = entry.cards.length - shown.length;
                  return (
                    <div
                      key={day}
                      className={cn(
                        "min-w-0 border-r border-[var(--border-2)] p-1.5 last:border-r-0",
                        scale === "month" ? "min-h-[118px]" : "min-h-[320px]",
                        !inMonth(day) && "bg-[var(--surface-1)]/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={cn(
                            "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] tabular-nums",
                            day === today
                              ? "bg-[var(--brand-600)] font-semibold text-[var(--surface-0)]"
                              : inMonth(day)
                                ? "text-[var(--text-2)]"
                                : "text-[var(--text-4)]",
                          )}
                          aria-label={day === today ? `${dayLabel(day)}, today` : dayLabel(day)}
                        >
                          {dateNumber(day)}
                        </span>
                      </div>
                      <div className="mt-1 space-y-1" style={{ paddingTop: tracks ? tracks * 6 + 2 : 0 }}>
                        {entry.markers.map((m) => (
                          <p key={`${m.release.id}-${m.kind}`} className="truncate text-[10px] uppercase tracking-[0.04em] text-[var(--brand-700)]" style={MONO} title={m.release.label}>
                            {shortRelease(m.release)} {m.kind === "start" ? "starts" : "ends"}
                          </p>
                        ))}
                        {shown.map((c) => (
                          <CalendarCard key={c.id} card={c} readOnly={readOnly(c)} onOpen={onOpen} />
                        ))}
                        {more > 0 ? (
                          <button
                            type="button"
                            className="w-full rounded-[4px] px-1 text-left text-[11px] font-medium text-[var(--brand-600)] hover:bg-[var(--surface-1)]"
                            onClick={() => setOpenDay(entry)}
                          >
                            +{more} more
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Phone: the days that have something on them, as a list. */}
      <div className="space-y-2 sm:hidden">
        {agenda.length ? (
          agenda.map((d) => (
            <div key={d.day} className="rounded-[8px] border border-[var(--border-2)] p-2">
              <p className={cn("text-[12px] font-semibold", d.day === today ? "text-[var(--brand-700)]" : "text-[var(--text-2)]")}>
                {dayLabel(d.day)}
                {d.day === today ? " · Today" : ""}
              </p>
              <div className="mt-1.5 space-y-1">
                {d.markers.map((m) => (
                  <p key={`${m.release.id}-${m.kind}`} className="truncate text-[10px] uppercase tracking-[0.04em] text-[var(--brand-700)]" style={MONO} title={m.release.label}>
                    {shortRelease(m.release)} {m.kind === "start" ? "starts" : "ends"}
                  </p>
                ))}
                {d.cards.map((c) => (
                  <CalendarCard key={c.id} card={c} readOnly={readOnly(c)} onOpen={onOpen} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-[8px] border border-dashed border-[var(--border-2)] p-4 text-center text-[13px] text-[var(--text-3)]">
            Nothing due in {title}.
          </p>
        )}
      </div>

      {undated ? (
        <p className="text-[12px] text-[var(--text-4)]">
          {undated} {undated === 1 ? "card has" : "cards have"} no due date, so {undated === 1 ? "it isn't" : "they aren't"} on the calendar.
        </p>
      ) : null}

      {openDay ? (
        <Modal open onClose={() => setOpenDay(null)} title={dayLabel(openDay.day)} panelClassName="app-dialog-fixed w-full max-w-md">
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-4">
            {openDay.cards.map((c) => (
              <CalendarCard
                key={c.id}
                card={c}
                readOnly={readOnly(c)}
                onOpen={(id) => {
                  setOpenDay(null);
                  onOpen(id);
                }}
              />
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function CalendarCard({ card, readOnly, onOpen }: { card: WikiBoardCard; readOnly: boolean; onOpen: (id: string) => void }) {
  const tone = card.isCard && card.itemType ? (BAR_TONE[card.itemType] ?? BAR_TONE.feature) : DEV_TONE;
  const cls = cn(
    "block w-full truncate rounded-[4px] border px-1.5 py-0.5 text-left text-[11px] font-medium",
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
