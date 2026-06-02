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
const RAIL_W = 240;
const ROW_MIN_H = 52;

const PX_PER_DAY: Record<GanttScale, number> = {
  month: 26,
  quarter: 9,
  half: 4.5,
  year: 2.3,
};

// Bar accent palette keyed by FeatureBlock.color (null → blue/brand).
const BAR_TONE: Record<string, { bar: string; fill: string; text: string }> = {
  blue: { bar: "bg-blue-100", fill: "bg-blue-500", text: "text-blue-900" },
  violet: { bar: "bg-violet-100", fill: "bg-violet-500", text: "text-violet-900" },
  emerald: { bar: "bg-emerald-100", fill: "bg-emerald-500", text: "text-emerald-900" },
  amber: { bar: "bg-amber-100", fill: "bg-amber-500", text: "text-amber-900" },
  rose: { bar: "bg-rose-100", fill: "bg-rose-500", text: "text-rose-900" },
  slate: { bar: "bg-slate-200", fill: "bg-slate-500", text: "text-slate-900" },
};
function tone(color?: string | null) {
  return BAR_TONE[color ?? "blue"] ?? BAR_TONE.blue;
}

// Solid hex per palette key for milestone markers (lines + diamonds).
const MARK_COLOR: Record<string, string> = {
  blue: "#2563eb",
  violet: "#7c3aed",
  emerald: "#059669",
  amber: "#d97706",
  rose: "#e11d48",
  slate: "#475569",
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

    const months: { x: number; w: number; label: string; major: boolean }[] = [];
    let cursor = domainStart;
    while (cursor < domainEnd) {
      const next = addMonthsUTC(cursor, 1);
      const x = daysBetween(domainStart, cursor) * pxPerDay;
      const w = daysBetween(cursor, next) * pxPerDay;
      const isJan = cursor.getUTCMonth() === 0;
      const label =
        scale === "year" || scale === "half"
          ? cursor.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })
          : cursor.toLocaleString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
      months.push({ x, w, label, major: isJan });
      cursor = next;
    }

    return { domainStart, totalDays, months, timelineWidth: totalDays * pxPerDay };
  }, [blocks, milestones, pxPerDay, scale, today]);

  const todayX = Math.min(
    Math.max(daysBetween(model.domainStart, today) * pxPerDay, 0),
    model.timelineWidth,
  );

  return (
    <div className="rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-4)]">
          <span className="inline-block h-2.5 w-0.5 bg-red-500" />
          Today
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
            {/* Header: month strip */}
            <div className="flex border-b border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)]">
              <div
                className="sticky left-0 z-30 shrink-0 border-r border-[rgba(0,0,0,0.08)] bg-[var(--surface-1)] px-3 py-2 text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]"
                style={{ width: RAIL_W, fontFamily: "var(--font-mono)" }}
              >
                Feature blocks
              </div>
              <div className="relative" style={{ width: model.timelineWidth, height: 32 }}>
                {model.months.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "absolute top-0 flex h-8 items-center border-l px-1.5 text-[10px]",
                      m.major ? "border-[rgba(0,0,0,0.14)] text-[var(--text-2)]" : "border-[rgba(0,0,0,0.06)] text-[var(--text-4)]",
                    )}
                    style={{ left: m.x, width: m.w, fontFamily: "var(--font-mono)" }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Rows + today line */}
            <div className="relative">
              {blocks.map((b) => {
                const start = new Date(b.startDate);
                const end = new Date(b.endDate);
                const left = Math.max(daysBetween(model.domainStart, start) * pxPerDay, 0);
                const width = Math.max((daysBetween(start, end) + 1) * pxPerDay, 6);
                const t = tone(b.color);
                const shown = b.tasks.slice(0, 6);
                return (
                  <div
                    key={b.id}
                    className="flex border-b border-[rgba(0,0,0,0.05)] last:border-b-0"
                    style={{ minHeight: ROW_MIN_H }}
                  >
                    {/* Rail */}
                    <div
                      className="sticky left-0 z-30 shrink-0 border-r border-[rgba(0,0,0,0.08)] bg-white px-3 py-2"
                      style={{ width: RAIL_W }}
                    >
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
                      <p className="mt-0.5 text-[10px] text-[var(--text-4)]" style={{ fontFamily: "var(--font-mono)" }}>
                        {b.progress}% · {b.tasks.length} task{b.tasks.length === 1 ? "" : "s"}
                      </p>
                      {shown.length > 0 ? (
                        <ul className="mt-1 space-y-0.5">
                          {shown.map((task, i) => (
                            <li key={i} className="flex items-center gap-1.5 text-[11px] text-[var(--text-3)]">
                              <span
                                className={cn(
                                  "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                                  task.done ? "bg-emerald-500" : "bg-[var(--muted,#CBD5E1)]",
                                )}
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

                    {/* Track */}
                    <div className="relative" style={{ width: model.timelineWidth }}>
                      <div
                        className={cn("absolute top-2 h-7 overflow-hidden rounded-[6px]", t.bar)}
                        style={{ left, width }}
                        title={`${b.name} · ${b.progress}%`}
                      >
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
                    </div>
                  </div>
                );
              })}

              {/* Milestone markers — dashed verticals with a diamond + label. */}
              {milestones.map((m) => {
                const mx = daysBetween(model.domainStart, new Date(m.date)) * pxPerDay;
                if (mx < 0 || mx > model.timelineWidth) return null;
                const c = markColor(m.color);
                return (
                  <div
                    key={m.id}
                    className="absolute top-0 bottom-0 z-10"
                    style={{ left: RAIL_W + mx }}
                  >
                    <div className="h-full border-l border-dashed" style={{ borderColor: c }} />
                    <button
                      type="button"
                      onClick={onMilestoneClick ? () => onMilestoneClick(m.id) : undefined}
                      className="absolute left-1 top-1 inline-flex max-w-[160px] items-center gap-1 truncate rounded-[3px] px-1 py-0.5 text-[9px] font-medium text-white"
                      style={{ background: c, cursor: onMilestoneClick ? "pointer" : "default" }}
                      title={`${m.name} · ${new Date(m.date).toLocaleDateString("en-GB", { timeZone: "UTC" })}`}
                    >
                      ◆ <span className="truncate">{m.name}</span>
                    </button>
                  </div>
                );
              })}

              {/* Today line — spans all rows, sits in the track region. */}
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-red-500"
                style={{ left: RAIL_W + todayX }}
              >
                <span className="absolute -top-0.5 -left-1 h-2 w-2 rounded-full bg-red-500" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
