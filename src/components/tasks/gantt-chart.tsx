"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";
import { GANTT_SCALE_LABELS, TASK_STATUS_LABELS, type GanttScale, type TaskStatus } from "@/types/tasks";

export type GanttBlock = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  color?: string | null;
  progress: number;
  tasks: { title: string; done: boolean }[];
  /** Per-status task counts for this block. When present, the bar fill is coloured
   *  by status composition (Done → UI Done → In Review → Doing) instead of a single
   *  progress fill. Omitted on the public client timeline (progress fill only). */
  statusCounts?: Record<TaskStatus, number>;
};

export type GanttMilestone = {
  id: string;
  name: string;
  date: string;
  color?: string | null;
};

const DAY = 86_400_000;
/** Left rail width — wide (desktop) fits the block name + "Due" columns; narrow
 *  (mobile) drops the Due column and shrinks so the chart itself stays on screen. */
const RAIL_W_WIDE = 360;
const RAIL_W_NARROW = 150;
/** Width of the "Due" date column inside the rail (fits "27 May 2026" on one line). */
const DUE_COL_W = 96;
/** Below this container width we switch to the compact mobile rail. */
const NARROW_BREAKPOINT = 560;
/** Row height (min). */
const ROW_MIN_H = 52;
/** Heights of the two header rows. */
const HEADER_ROW_1 = 22; // quarter bands
const HEADER_ROW_2 = 22; // month labels
const HEADER_H = HEADER_ROW_1 + HEADER_ROW_2; // 44px total

const PX_PER_DAY: Record<Exclude<GanttScale, "fit">, number> = {
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

// Status-composition fill: when a block carries per-status counts, the bar is a
// stack of these segments (left = most complete) instead of one progress fill.
// BACKLOG/TODO are the "not started" remainder — left as the light track, not a
// segment. Matches the task board's status colours (UI Done = teal).
const STATUS_FILL: Record<TaskStatus, string> = {
  BACKLOG: "bg-transparent",
  TODO: "bg-transparent",
  DOING: "bg-amber-500",
  IN_REVIEW: "bg-blue-500",
  UI_DONE: "bg-teal-500",
  DONE: "bg-emerald-500",
};
// Left → right within the filled portion (most complete first).
const STATUS_FILL_ORDER: TaskStatus[] = ["DONE", "IN_REVIEW", "DOING"];
// Legend order (full flow) + dot colours for the legend chips.
const STATUS_LEGEND: { status: TaskStatus; dot: string }[] = [
  { status: "DOING", dot: "bg-amber-500" },
  { status: "IN_REVIEW", dot: "bg-blue-500" },
  { status: "DONE", dot: "bg-emerald-500" },
];

/** Stacked status segments filling the bar (left = most complete). */
function StatusFill({ counts }: { counts: Record<TaskStatus, number> }) {
  const total = (Object.values(counts) as number[]).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return (
    <div className="flex h-full w-full">
      {STATUS_FILL_ORDER.map((s) => {
        const n = counts[s] ?? 0;
        if (n <= 0) return null;
        return <div key={s} className={STATUS_FILL[s]} style={{ width: `${(n / total) * 100}%` }} />;
      })}
    </div>
  );
}

/** "12 done · 2 in review · 3 doing …" — omits zero-count statuses. */
function statusBreakdown(counts: Record<TaskStatus, number>): string {
  const order: TaskStatus[] = ["DONE", "IN_REVIEW", "DOING", "TODO", "BACKLOG"];
  return order
    .filter((s) => (counts[s] ?? 0) > 0)
    .map((s) => `${counts[s]} ${TASK_STATUS_LABELS[s].toLowerCase()}`)
    .join(" · ");
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
  initialScale = "fit",
  onBlockClick,
  onMilestoneClick,
  emptyHint = "No categories yet — add one to start the timeline.",
  slippage = true,
}: {
  blocks: GanttBlock[];
  milestones?: GanttMilestone[];
  initialScale?: GanttScale;
  onBlockClick?: (blockId: string) => void;
  onMilestoneClick?: (milestoneId: string) => void;
  emptyHint?: string;
  /** Show the slip/slippage overlay + its toggle. Internal PM signal — the public
   *  client timeline passes false so clients don't see "behind schedule" bars. */
  slippage?: boolean;
}) {
  const [scale, setScale] = useState<GanttScale>(initialScale);
  // Section ids whose task list is expanded. Default: all collapsed (compact rows).
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Section ids whose task list shows every task instead of the first 6 —
  // the "+N more" row was previously static text with no way to reveal them.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Slip overlay on by default (internal). Toggled from the controls bar.
  const [showSlip, setShowSlip] = useState(true);
  const today = useMemo(() => new Date(), []);

  // Measure the scroll viewport so "Fit" can scale the timeline to the width
  // (and re-fit whenever the container resizes — responsive on any screen).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compact rail on narrow viewports (phones): drop the "Due" column and shrink
  // the name column so the chart itself is visible without scrolling past a
  // 360px rail first. Defaults to the wide rail until measured.
  const narrow = containerW > 0 && containerW < NARROW_BREAKPOINT;
  const RAIL_W = narrow ? RAIL_W_NARROW : RAIL_W_WIDE;
  const dueColW = narrow ? 0 : DUE_COL_W;
  const showDue = !narrow;

  // Date domain — independent of zoom, so "Fit" can size px/day to it.
  const domain = useMemo(() => {
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
    return { domainStart, domainEnd, totalDays };
  }, [blocks, milestones, today]);

  // px/day: fixed per zoom level, or computed to fit the whole timeline into the
  // available width in "Fit" mode (clamped so it never collapses or over-zooms).
  const pxPerDay = useMemo(() => {
    if (scale !== "fit") return PX_PER_DAY[scale];
    const avail = containerW - RAIL_W;
    if (avail <= 0) return PX_PER_DAY.half; // pre-measure fallback
    return Math.min(Math.max(avail / domain.totalDays, 1.2), 40);
  }, [scale, containerW, domain.totalDays, RAIL_W]);

  const model = useMemo(() => {
    const { domainStart, domainEnd, totalDays } = domain;

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
  }, [domain, pxPerDay]);

  const todayX = Math.min(
    Math.max(daysBetween(model.domainStart, today) * pxPerDay, 0),
    model.timelineWidth,
  );

  // Open the timeline at "today" (and re-centre when the zoom changes) so the
  // view never starts months in the past. Completed work is reachable by
  // scrolling left. In "Fit" the whole timeline shows, so this is a no-op there.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, todayX - 80);
  }, [scale, todayX]);

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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[rgba(0,0,0,0.08)] px-3 py-2">
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
          {slippage && blocks.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowSlip((v) => !v)}
              title="Show how far overdue, incomplete blocks have slipped past their end date"
              className={cn(
                "rounded-[6px] border px-2 py-0.5 text-[10px] font-medium transition",
                showSlip
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-[var(--border-2)] text-[var(--text-3)] hover:bg-[var(--surface-1)]",
              )}
            >
              {showSlip ? "Slippage on" : "Slippage off"}
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

      {/* Status legend — only when bars are coloured by status composition (internal view). */}
      {blocks.some((b) => b.statusCounts) ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-2 text-[11px] text-[var(--text-4)]">
          <span className="uppercase tracking-[1px]" style={{ fontFamily: "var(--font-mono)" }}>
            Status
          </span>
          {STATUS_LEGEND.map(({ status, dot }) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-[2px]", dot)} />
              {TASK_STATUS_LABELS[status]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px] border border-[var(--border-2)] bg-[var(--surface-1)]" />
            To do / Backlog
          </span>
        </div>
      ) : null}

      {blocks.length === 0 && milestones.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-[var(--text-4)]">{emptyHint}</p>
      ) : (
        <div ref={scrollRef} className="overflow-x-auto">
          <div className="relative" style={{ minWidth: "100%", width: RAIL_W + model.timelineWidth }}>

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
                  <div className="flex flex-1 items-center px-3">Categories</div>
                  {showDue && (
                    <div
                      className="flex shrink-0 items-center justify-end border-l border-[rgba(0,0,0,0.08)] px-2"
                      style={{ width: dueColW }}
                    >
                      Due
                    </div>
                  )}
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
                const isExpanded = expanded.has(b.id);
                const shown = isExpanded ? b.tasks : b.tasks.slice(0, 6);
                const dueFmt = fmtShort(b.endDate);
                const isOpen = open.has(b.id);
                // Slip = the gap between a block's planned end (bar right edge) and
                // today, when the block isn't finished. No baseline needed — it's
                // computed purely from the current end date vs now.
                const barRight = left + width;
                const slipW = Math.max(0, Math.min(todayX, model.timelineWidth) - barRight);
                const isSlipping = slippage && showSlip && b.progress < 100 && slipW > 2;
                const slipDays = Math.round(slipW / pxPerDay);
                const slipColor = slipDays >= 7 ? "#DC2626" : "#D97706"; // red past a week, else amber
                const slipTint = slipDays >= 7 ? "rgba(220,38,38,0.26)" : "rgba(217,119,16,0.26)";
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
                              {!showDue ? ` · ${dueFmt}` : ""}
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
                              <li>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpanded((prev) => new Set(prev).add(b.id))
                                  }
                                  className="text-[10px] font-medium text-[var(--brand-700)] hover:underline"
                                >
                                  +{b.tasks.length - shown.length} more
                                </button>
                              </li>
                            ) : isExpanded && b.tasks.length > 6 ? (
                              <li>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpanded((prev) => {
                                      const n = new Set(prev);
                                      n.delete(b.id);
                                      return n;
                                    })
                                  }
                                  className="text-[10px] font-medium text-[var(--text-4)] hover:underline"
                                >
                                  Show less
                                </button>
                              </li>
                            ) : null}
                          </ul>
                        ) : null}
                      </div>

                      {/* Due date column — hidden on the compact mobile rail
                          (the due date still shows in the bar tooltip). */}
                      {showDue && (
                        <div
                          className="flex shrink-0 items-start justify-end whitespace-nowrap border-l border-[rgba(0,0,0,0.06)] px-2 py-2 text-right text-[10px] leading-tight text-[var(--text-4)]"
                          style={{ width: dueColW, fontFamily: "var(--font-mono)" }}
                        >
                          {dueFmt}
                        </div>
                      )}
                    </div>

                    {/* Track */}
                    <div className="relative" style={{ width: model.timelineWidth }}>
                      {/* Slip overlay — hatched extension from planned end → today */}
                      {isSlipping ? (
                        <div
                          className="group/slip absolute top-2 h-7 rounded-r-[6px] border border-dashed"
                          style={{
                            left: barRight,
                            width: slipW,
                            borderColor: slipColor,
                            background: `repeating-linear-gradient(45deg, ${slipTint} 0 2px, transparent 2px 6px)`,
                          }}
                        >
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--text-1)] px-2.5 py-1.5 text-left text-[11px] text-[var(--surface-0)] shadow-lg group-hover/slip:block">
                            <span className="font-medium">{slipDays}d behind</span>
                            <span className="mt-0.5 block text-[var(--surface-0)]/75" style={{ fontFamily: "var(--font-mono)" }}>
                              due {dueFmt} · {b.progress}% done
                            </span>
                          </div>
                        </div>
                      ) : null}
                      <div className="group absolute top-2 h-7" style={{ left, width }}>
                        <div className={cn("h-full w-full overflow-hidden rounded-[6px]", t.bar)}>
                          {b.statusCounts ? (
                            <StatusFill counts={b.statusCounts} />
                          ) : (
                            <div className={cn("h-full", t.fill)} style={{ width: `${b.progress}%` }} />
                          )}
                          <span
                            className={cn(
                              "pointer-events-none absolute inset-0 flex items-center truncate px-2 text-[11px] font-medium",
                              t.text,
                            )}
                          >
                            {width > 60 ? b.name : ""}
                          </span>
                        </div>
                        {/* Instant styled tooltip (date range + status breakdown) */}
                        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--text-1)] px-2.5 py-1.5 text-left text-[11px] text-[var(--surface-0)] shadow-lg group-hover:block">
                          <span className="font-medium">{b.name}</span>
                          <span className="mt-0.5 block text-[var(--surface-0)]/75" style={{ fontFamily: "var(--font-mono)" }}>
                            {fmtShort(b.startDate)} – {fmtShort(b.endDate)} · {b.progress}%
                          </span>
                          {b.statusCounts && statusBreakdown(b.statusCounts) ? (
                            <span className="mt-0.5 block text-[var(--surface-0)]/75" style={{ fontFamily: "var(--font-mono)" }}>
                              {statusBreakdown(b.statusCounts)}
                            </span>
                          ) : null}
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
                return (
                  <MilestoneMarker
                    key={m.id}
                    milestone={m}
                    left={RAIL_W + mx}
                    onMilestoneClick={onMilestoneClick}
                  />
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

/**
 * Milestone diamond + hover/focus tooltip. The tooltip renders through a
 * portal to document.body (position: fixed, computed from the marker's own
 * getBoundingClientRect) instead of the previous CSS-only `group-hover`
 * popup — that was clipped whenever the marker sat near the top of the
 * Gantt's scroll rail (or the page's own scrolling content area), since a
 * `bottom-full` popup has nowhere to render once it needs space above its
 * nearest clipping ancestor. A portal escapes any such ancestor entirely.
 */
function MilestoneMarker({
  milestone: m,
  left,
  onMilestoneClick,
}: {
  milestone: GanttMilestone;
  left: number;
  onMilestoneClick?: (milestoneId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const c = markColor(m.color);
  const dateFmt = fmtShort(m.date);

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ x: r.left + r.width / 2, y: r.top });
  };
  const hide = () => setAnchor(null);

  return (
    <div className="absolute top-0 bottom-0 z-[45]" style={{ left }}>
      {/* Faint vertical guide down the timeline */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 -translate-x-1/2 border-l border-dashed"
        style={{ borderColor: c, opacity: 0.4 }}
      />
      <div
        ref={ref}
        className="absolute top-1 left-0 -translate-x-1/2"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <button
          type="button"
          onClick={onMilestoneClick ? () => onMilestoneClick(m.id) : undefined}
          aria-label={`${m.name} · ${dateFmt}`}
          className="block h-3.5 w-3.5 rotate-45 rounded-[2px] border border-[var(--surface-0)] shadow-sm transition hover:scale-125"
          style={{ background: c, cursor: onMilestoneClick ? "pointer" : "default" }}
        />
      </div>
      {anchor && typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: anchor.x,
              top: anchor.y - 8,
              transform: "translate(-50%, -100%)",
            }}
            className="pointer-events-none z-[100] whitespace-nowrap rounded-md bg-[var(--text-1)] px-2.5 py-1.5 text-left text-[11px] text-[var(--surface-0)] shadow-lg"
          >
            <span className="font-medium">{m.name}</span>
            <span className="mt-0.5 block text-[var(--surface-0)]/75" style={{ fontFamily: "var(--font-mono)" }}>
              {dateFmt}
            </span>
          </div>,
          document.body,
        )}
    </div>
  );
}
