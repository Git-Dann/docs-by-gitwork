"use client";

import { GanttChart, type GanttBlock, type GanttMilestone } from "@/components/tasks/gantt-chart";
import type { WikiLinkedWork, WikiTimeline } from "@/server/wiki";

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
    <>
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

      {/* ── Linked clients, UNDER the client's own plan ─────────────────────
          Not merged into the Gantt above. A linked workstream is usually
          tracked but not scheduled — YG intelligence has four blocks, 66 tasks
          and not one date — and the Gantt drops anything it cannot give a span
          to, so merging rendered it as nothing at all and read as a broken
          link. A table needs no dates. */}
      {(timeline.linked ?? []).map((work, i) => (
        <LinkedWorkCard key={work.source.clientId} work={work} index={i + 2} />
      ))}
    </>
  );
}

function LinkedWorkCard({ work, index }: { work: WikiLinkedWork; index: number }) {
  const pct = work.total === 0 ? null : Math.round((work.done / work.total) * 100);
  return (
    <section className="widget-card">
      <div className="widget-header">
        <span className="widget-header__label" style={{ fontFamily: MONO }}>
          <span className="widget-header__label--number">
            {String(index).padStart(2, "0")}
          </span>
          {` // ${work.source.name.toUpperCase()}`}
        </span>
        <span className="widget-header__status" style={{ fontFamily: MONO }}>
          {/* ⚠️ Null, not 0%, when there is nothing to divide by — "0% complete"
              on an empty board reads as failure rather than as no work yet. */}
          {pct === null ? "NO TASKS YET" : `${pct}% COMPLETE`}
        </span>
      </div>
      <div className="p-5 sm:p-6">
        <p className="mb-4 text-[13px] leading-relaxed text-[var(--text-3)]">
          A separate workstream tracked on its own board, shown here alongside this
          project. {work.total} {work.total === 1 ? "task" : "tasks"} in total.
        </p>
        {work.blocks.length === 0 && work.looseTasks.total === 0 ? (
          <p className="rounded-[8px] border border-dashed border-[var(--border-2)] px-3 py-4 text-center text-[13px] text-[var(--text-3)]">
            Nothing on this board yet.
          </p>
        ) : (
          <div className="space-y-2">
            {work.blocks.map((b) => (
              <WorkRow key={b.id} name={b.name} total={b.total} done={b.done} color={b.color} />
            ))}
            {work.looseTasks.total > 0 ? (
              <WorkRow
                name="Other work"
                total={work.looseTasks.total}
                done={work.looseTasks.done}
                color={null}
              />
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

function WorkRow({
  name,
  total,
  done,
  color,
}: {
  name: string;
  total: number;
  done: number;
  color: string | null;
}) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[8px] border border-[var(--border-1)] px-4 py-3">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
          style={{ background: color ?? "var(--surface-2)" }}
        />
        <span className="min-w-0 truncate text-[14px] text-[var(--text-1)]" title={name}>
          {name}
        </span>
      </span>
      <span
        className="shrink-0 text-[12px] whitespace-nowrap text-[var(--text-3)] tabular-nums"
        style={{ fontFamily: MONO }}
      >
        {done} / {total}
      </span>
      <span className="h-1.5 w-full shrink-0 rounded-full bg-[var(--surface-2)] sm:w-40">
        <span
          className="block h-1.5 rounded-full bg-[var(--brand-700)]"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span
        className="w-10 shrink-0 text-right text-[12px] whitespace-nowrap text-[var(--text-1)] tabular-nums"
        style={{ fontFamily: MONO }}
      >
        {pct}%
      </span>
    </div>
  );
}