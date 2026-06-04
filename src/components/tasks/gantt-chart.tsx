"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/format";
import { GANTT_SCALE_LABELS, type GanttScale } from "@/types/tasks";

export type GanttBlock = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  color?: string | null;
  progress: number;
  tasks: { title: string; done: boolean }[];
};

export type GanttMilestone = {
  id: string;
  name: string;
  date: string;
  color?: string | null;
};

const DAY = 86_400_000;
/** Total left rail width — block name column + "Due" column. */
const RAIL_W = 360;
/** Width of the "Due" date column inside the rail (fits "27 May 2026" on one line). */
const DUE_COL_W = 96;
/** Row height (min). */
const ROW_MIN_H = 52;
/** Heights of the two header rows. */
const HEADER_ROW_1 = 22; // quarter bands
const HEADER_ROW_2 = 22; // month labels
const HEADER_H = HEADER_ROW_1 + HEADER_ROW_2; // 44px total

const PX_PER_DAY: Record<GanttScale, number> = {
  month: 26,
  quarter: 9,
  half: 4.5,
  year: 2.3,
};

// Bar accent palette keyed by FeatureBlock.color (null → blue/brand).
const BAR_TONE: Record<string, { bar: string; fill: string; text: string }> = {
  blue:    { bar: "bg-blue-100",    fill: "bg-blue-500",    text: "text-blue-900" },
  violet:  { bar: "bg-violet-100",  fill: "bg-violet-500",  text: "text-violet-900" },
  emerald: { bar: "bg-emerald-100", fill: "bg-emerald-500", text: "text-emerald-900" },
  amber:   { bar: "bg-amber-100",   fill: "bg-amber-500",   text: "text-amber-900" },
  rose:    { bar: "bg-rose-100",    fill: "bg-rose-500",    text: "text-rose-900" },
  slate:   { bar: "bg-slate-200",   fill: "bg-slate-500",   text: "text-slate-900" },
};
function tone(color?: string | null) {
  return BAR_TONE[color ?? "blue"] ?? BAR_TONE.blue;
}

// Solid hex per palette key for milestone markers.
const MARK_COLOR: Record<string, string> = {
  blue:    "#2563eb",
  violet:  "#7c3aed",
  emerald: "#059669",
  amber:   "#d97706",
  rose:    "#e11d48",
  slate:   "#475569",
};
function markColor(color?: string | null) {
  return MARK_COLOR[color ?? "violet"] ?? MARK_COLOR.violet;
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonthsUTC(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

/** Format a date string as short en-GB (e.g. "12 Jun 2026"). */
function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function GanttChart({
  blocks,
  milestones = [],
  initialScale = "quarter",
  onBlockClick,
  onMilestoneClick,
  emptyHint = "No feature blocks yet — add one to start the timeline.",
}: {
  blocks: GanttBlock[];
  milestones?: GanttMilestone[];
  initialScale?: GanttScale;
  onBlockClick?: (blockId: string) => void;
  onMilestoneClick?: (milestoneId: string) => void;
  emptyHint?: string;
}) {
  const [scale, setScale] = useState<GanttScale>(initialScale);
  // Section ids whose task list is expanded. Default: all collapsed (compact rows).
  const [open, setOpen] = useState<Set<string>>(new Set());
  const today = useMemo(() => new Date(), []);
  const pxPerDay = PX_PER_DAY[scale];

  const model = useMemo(() => {
    const stamps: number[] = [today.getTime()];
    for (const b of blocks) {
      stamps.push(new Date(b.startDate).getTime(), new Date(b.endDate).getTime());
    }
    for (const m of milestones) stamps.push(new Date(m.date).getTime());
    const min = new Date(Math.min(...stamps));
    const max = new Date(Math.max(...stamps));
    // Snap to whole months, pad a month either side for breathing room.
    const domainStart = addMonthsUTC(startOfMonthUTC(min), -1);
    const domainEnd = addMonthsUTC(startOfMonthUTC(max), 2);
    const totalDays = Math.max(daysBetween(domainStart, domainEnd), 1);

    // ── Row 2: month cells ────────────────────────────────────────────────────
    const months: { x: number; w: number; label: string; major: boolean }[] = [];
    let cursor = domainStart;
    while (cursor < domainEnd) {
      const next = addMonthsUTC(cursor, 1);
      const x = daysBetween(domainStart, cursor) * pxPerDay;
      const w = daysBetween(cursor, next) * pxPerDay;
      const isJan = cursor.getUTCMonth() === 0;
      const label = cursor.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
      months.push({ x, w, label, major: isJan });
      cursor = next;
    }

    // ── Row 1: quarter bands ──────────────────────────────────────────────────
    const quarters: { x: number; w: number; label: string }[] = [];
    const qStart = (d: Date): Date => {
      const mo = d.getUTCMonth();
      return new Date(Date.UTC(d.getUTCFullYear(), mo - (mo % 3), 1));
    };
    let qCursor = qStart(domainStart);
    while (qCursor < domainEnd) {
      const qNext = addMonthsUTC(qCursor, 3);
      const x = Math.max(daysBetween(domainStart, qCursor), 0) * pxPerDay;
      const xEnd = Math.min(daysBetween(domainStart, qNext), totalDays) * pxPerDay;
      const w = xEnd - x;
      if (w > 0) {
        const qNum = Math.floor(qCursor.getUTCMonth() / 3) + 1;
        const label = `Q${qNum} ${qCursor.getUTCFullYear()}`;
        quarters.push({ x, w, label });
      }
      qCursor = qNext;
    }

    return { domainStart, totalDays, months, quarters, timelineWidth: totalDays * pxPerDay };
  }, [blocks, milestones, pxPerDay, today]);

  const todayX = Math.min(
    Math.max(daysBetween(model.domainStart, today) * pxPerDay, 0),
    model.timelineWidth,
  );

  // Project week — kickoff (earliest section/milestone) is week 1. NOT the ISO
  // week of the year; simply how many weeks into the project timeline we are.
  const projectWeek = useMemo(() => {
    const stamps = [
      ...blocks.map((b) => new Date(b.startDate).getTime()),
      ...milestones.map((m) => new Date(m.date).getTime()),
    ].filter((n) => Number.isFinite(n));
    if (stamps.length === 0) return null;
    const wk = Math.floor((today.getTime() - Math.min(...stamps)) / (7 * DAY)) + 1;
    return wk >= 1 ? wk : null;
  }, [blocks, milestones, today]);

  // Rail order: chronological — earliest section first (by start, then end).
  const ordered = useMemo(
    () =>
      [...blocks].sort(
        (a, z) =>
          new Date(a.startDate).getTime() - new Date(z.startDate).getTime() ||
          new Date(a.endDate).getTime() - new Date(z.endDate).getTime(),
      ),
    [blocks],
  );
  const allOpen = blocks.length > 0 && open.size >= blocks.length;

  return (
    <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-4)]">
            <span className="inline-block h-2.5 w-0.5 bg-red-500" />
            Today
          </span>
          {projectWeek != null ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-[var(--brand-200)] bg-[var(--surface-brand)] px-2.5 py-1 text-[11px] font-semibold text-[var(--brand-800)]"
              style={{ fontFamily: "var(--font-mono)" }}
              title="Week of the project timeline (kickoff = week 1)"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand-600)]" />
              WEEK {projectWeek}
            </span>
          ) : null}
          {blocks.length > 0 ? (
            <button
              type="button"
              onClick={() => setOpen(allOpen ? new Set() : new Set(blocks.map((b) => b.id)))}
              className="rounded-[6px] border border-[var(--border-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-3)] transition hover:bg-[var(--surface-1)]"
            >
              {allOpen ? "Collapse all" : "Expand all"}
            </button>
          ) : null}
        </div>
        <div className="inline-flex overflow-hidden rounded-[6px] border border-[var(--border-2)]">
          {(Object.keys(GANTT_SCALE_LABELS) as GanttScale[]).map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setScale(s)}
              className={cn(
                "px-2.5 py-1 text-xs font-medium transition",
                i > 0 && "border-l border-[var(--border-2)]",
                scale === s
                  ? "bg-[var(--surface-brand)] text-[var(--brand-800)]"
                  : "bg-white text-[var(--text-3)] hover:bg-[var(--surface-1)]",
              )}
            >
              {GANTT_SCALE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {blocks.length === 0 && milestones.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-[var(--text-4)]">{emptyHint}</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="relative" style={{ width: RAIL_W + model.timelineWidth }}>

            {/* ── Two-row header ─────────────────────────────────────────────── */}
            <div
              className="sticky top-0 z-40 flex flex-col border-b border-[rgba(0,0,0,0.10)] bg-[var(--surface-1)]"
              style={{ height: HEADER_H }}
            >
              {/* Row 1 — quarter bands */}
              <div className="flex" style={{ height: HEADER_ROW_1 }}>
                {/* Sticky left corner — spans both header rows */}
                <div
                  className="sticky left-0 z-[60] flex shrink-0 border-r border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)] text-[10px] font-medium uppercase tracking-[1px] text-[var(--text-4)]"
                  style={{ width: RAIL_W, height: HEADER_H, top: 0, fontFamily: "var(--font-mono)" }}
                >
                  <div className="flex flex-1 items-center px-3">Feature blocks</div>
                  <div
                    className="flex shrink-0 items-center justify-end border-l border-[rgba(0,0,0,0.08)] px-2"
                    style={{ width: DUE_COL_W }}
                  >
                    Due
                  </div>
                </div>

                {/* Quarter bands */}
                <div className="relative flex-1 overflow-hidden" style={{ height: HEADER_ROW_1 }}>
                  {model.quarters.map((q, i) => (
                    <div
                      key={i}
                      className="absolute top-0 flex items-center truncate border-l border-[rgba(0,0,0,0.16)] px-2 text-[10px] font-semibold text-[var(--text-2)]"
                      style={{
                        left: q.x,
                        width: q.w,
                        height: HEADER_ROW_1,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {q.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* Row 2 — month labels */}
              <div className="flex" style={{ height: HEADER_ROW_2 }}>
                {/* Spacer under the sticky corner (corner spans both rows visually, this fills row 2) */}
                <div
                  className="sticky left-0 z-50 shrink-0 border-r border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)]"
                  style={{ width: RAIL_W, height: HEADER_ROW_2 }}
                />
                {/* Month cells */}
                <div className="relative flex-1 overflow-hidden" style={{ height: HEADER_ROW_2 }}>
                  {model.months.map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        "absolute top-0 flex items-center border-l px-1.5 text-[10px]",
                        m.major
                          ? "border-[rgba(0,0,0,0.14)] text-[var(--text-2)]"
                          : "border-[rgba(0,0,0,0.06)] text-[var(--text-4)]",
                      )}
                      style={{
                        left: m.x,
                        width: m.w,
                        height: HEADER_ROW_2,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Block rows + today line ─────────────────────────────────────── */}
            <div className="relative">
              {ordered.map((b) => {
                const start = new Date(b.startDate);
                const end = new Date(b.endDate);
                const left = Math.max(daysBetween(model.domainStart, start) * pxPerDay, 0);
                const width = Math.max((daysBetween(start, end) + 1) * pxPerDay, 6);
                const t = tone(b.color);
                const shown = b.tasks.slice(0, 6);
                const dueFmt = fmtShort(b.endDate);
                const isOpen = open.has(b.id);
                return (
                  <div
                    key={b.id}
                    className="flex border-b border-[rgba(0,0,0,0.05)] last:border-b-0"
                    style={{ minHeight: ROW_MIN_H }}
                  >
                    {/* Rail — sticky left */}
                    <div
                      className="sticky left-0 z-30 flex shrink-0 border-r border-[rgba(0,0,0,0.08)] bg-white"
                      style={{ width: RAIL_W }}
                    >
                      {/* Name + collapsible task list sub-column */}
                      <div className="min-w-0 flex-1 px-3 py-2">
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setOpen((prev) => {
                                const n = new Set(prev);
                                if (n.has(b.id)) n.delete(b.id);
                                else n.add(b.id);
                                return n;
                              })
                            }
                            aria-expanded={isOpen}
                            aria-label={isOpen ? "Collapse section" : "Expand section"}
                            className="mt-[3px] shrink-0 text-[var(--text-4)] transition hover:text-[var(--text-2)]"
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 10 10"
                              className={cn("transition-transform", isOpen && "rotate-90")}
                            >
                              <path
                                d="M3 2l4 3-4 3"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={onBlockClick ? () => onBlockClick(b.id) : undefined}
                              className={cn(
                                "block w-full truncate text-left text-sm font-medium text-[var(--text-1)]",
                                onBlockClick && "hover:text-[var(--brand-700)]",
                              )}
                            >
                              {b.name}
                            </button>
                            <p
                              className="mt-0.5 text-[10px] text-[var(--text-4)]"
                              style={{ fontFamily: "var(--font-mono)" }}
                            >
                              {b.progress}% · {b.tasks.length} task{b.tasks.length === 1 ? "" : "s"}
                            </p>
                          </div>
                        </div>
                        {isOpen && shown.length > 0 ? (
                          <ul className="mt-1.5 space-y-0.5 pl-[18px]">
                            {shown.map((task, i) => (
                              <li key={i} className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                                <span
                                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ background: task.done ? "#16A34A" : "#CBD5E1" }}
                                />
                                <span className={cn("truncate", task.done && "line-through opacity-60")}>
                                  {task.title}
                                </span>
                              </li>
                            ))}
                            {b.tasks.length > shown.length ? (
                              <li className="text-[10px] text-[var(--text-4)]">
                                +{b.tasks.length - shown.length} more
                              </li>
                            ) : null}
                          </ul>
                        ) : null}
                      </div>

                      {/* Due date column */}
                      <div
                        className="flex shrink-0 items-start justify-end whitespace-nowrap border-l border-[rgba(0,0,0,0.06)] px-2 py-2 text-right text-[10px] leading-tight text-[var(--text-4)]"
                        style={{ width: DUE_COL_W, fontFamily: "var(--font-mono)" }}
                      >
                        {dueFmt}
                      </div>
                    </div>

                    {/* Track */}
                    <div className="relative" style={{ width: model.timelineWidth }}>
                      <div className="group absolute top-2 h-7" style={{ left, width }}>
                        <div className={cn("h-full w-full overflow-hidden rounded-[6px]", t.bar)}>
                          <div className={cn("h-full", t.fill)} style={{ width: `${b.progress}%` }} />
                          <span
                            className={cn(
                              "pointer-events-none absolute inset-0 flex items-center truncate px-2 text-[11px] font-medium",
                              t.text,
                            )}
                          >
                            {width > 60 ? b.name : ""}
                          </span>
                        </div>
                        {/* Instant styled tooltip (date range) */}
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--text-1)] px-2.5 py-1.5 text-left text-[11px] text-white shadow-lg group-hover:block">
                          <span className="font-medium">{b.name}</span>
                          <span className="mt-0.5 block text-white/75" style={{ fontFamily: "var(--font-mono)" }}>
                            {fmtShort(b.startDate)} – {fmtShort(b.endDate)} · {b.progress}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* ── Milestones — diamonds overlaid on the timeline (no table rows) ── */}
              {milestones.map((m) => {
                const mx = daysBetween(model.domainStart, new Date(m.date)) * pxPerDay;
                if (mx < 0 || mx > model.timelineWidth) return null;
                const c = markColor(m.color);
                const dateFmt = fmtShort(m.date);
                return (
                  <div key={m.id} className="absolute top-0 bottom-0 z-20" style={{ left: RAIL_W + mx }}>
                    {/* Faint vertical guide down the timeline */}
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 -translate-x-1/2 border-l border-dashed"
                      style={{ borderColor: c, opacity: 0.4 }}
                    />
                    {/* Diamond marker + upright instant tooltip */}
                    <div className="group absolute top-1 left-0 -translate-x-1/2">
                      <button
                        type="button"
                        onClick={onMilestoneClick ? () => onMilestoneClick(m.id) : undefined}
                        aria-label={`${m.name} · ${dateFmt}`}
                        className="block h-3.5 w-3.5 rotate-45 rounded-[2px] border border-white shadow-sm transition hover:scale-125"
                        style={{ background: c, cursor: onMilestoneClick ? "pointer" : "default" }}
                      />
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--text-1)] px-2.5 py-1.5 text-left text-[11px] text-white shadow-lg group-hover:block">
                        <span className="font-medium">{m.name}</span>
                        <span className="mt-0.5 block text-white/75" style={{ fontFamily: "var(--font-mono)" }}>
                          {dateFmt}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* ── Today line — spans all rows ─────────────────────────────── */}
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-red-500"
                style={{ left: RAIL_W + todayX }}
              >
                {/* "Today" chip at the very top */}
                <span
                  className="absolute -top-6 -translate-x-1/2 whitespace-nowrap rounded-[3px] border border-red-200 bg-white px-1 py-px text-[9px] font-medium text-red-600"
                  style={{ left: 0 }}
                >
                  Today
                </span>
                {/* Dot on the line */}
                <span className="absolute -top-0.5 -left-1 h-2 w-2 rounded-full bg-red-500" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
