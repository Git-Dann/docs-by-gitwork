"use client";

import { GanttChart, type GanttBlock, type GanttMilestone } from "@/components/tasks/gantt-chart";
import type { WikiTimeline } from "@/server/wiki";

const MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

/**
 * The wiki Timeline page — a client-facing Gantt of the project's feature blocks
 * and milestones. Shared by the public portal (`wiki-public-view`) and the internal
 * preview (`wiki-workspace`). Data comes straight from the client's task-board
 * feature blocks (see `loadWikiTimeline` in server/wiki.ts), so it stays in sync
 * with the standalone /timeline/[token] share.
 */
export function WikiTimelineSection({ timeline }: { timeline: WikiTimeline }) {
  const blocks: GanttBlock[] = timeline.blocks.map((b) => ({
    id: b.id,
    name: b.name,
    startDate: b.startDate,
    endDate: b.endDate,
    color: b.color,
    progress: b.progress,
    tasks: b.tasks,
    statusCounts: b.statusCounts,
  }));
  const milestones: GanttMilestone[] = timeline.milestones.map((m) => ({
    id: m.id,
    name: m.name,
    date: m.date,
    color: m.color,
  }));

  const overall =
    blocks.length === 0
      ? 0
      : Math.round(blocks.reduce((sum, b) => sum + b.progress, 0) / blocks.length);

  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">01</span>
          {" // TIMELINE"}
        </span>
        {blocks.length > 0 && (
          <span className="text-[11px] text-[var(--text-4)]" style={{ fontFamily: MONO }}>
            {overall}% COMPLETE
          </span>
        )}
      </div>
      <div className="p-6">
        {/* Section intro — eyebrow + one-line orientation for the client. */}
        <div className="mb-5">
          <p
            className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--text-4)]"
            style={{ fontFamily: MONO }}
          >
            Project Timeline
          </p>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[var(--text-3)]">
            A live view of your project phases and milestones. Each bar is a phase
            of work; progress updates automatically as tasks are completed.
          </p>
        </div>
        {/* Client-facing wiki timeline — no internal slip overlay. */}
        <GanttChart
          blocks={blocks}
          milestones={milestones}
          slippage={false}
          emptyHint="The timeline will appear here once project phases are scheduled."
        />
      </div>
    </section>
  );
}
