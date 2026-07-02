"use client";

/**
 * Standalone Foundry dev-experience demo (`/demo/dev`) — the developer's HQ:
 * dashboard (DevOverview), project Gantt, task board, and the "On Your Desk"
 * drawer. Uses the real production components, fed by the demo fetch interceptor
 * in `DemoShell`. No auth, no database. See `src/lib/demo/dev-demo-data.ts`.
 */

import { DevOverview } from "@/components/dashboard/dev-overview";
import { TaskBoard } from "@/components/tasks/task-board";
import { GanttChart } from "@/components/tasks/gantt-chart";
import { DemoShell, DemoSectionHeading } from "@/components/demo/demo-shell";
import { demoBoardTasks, demoGanttBlocks, demoGanttMilestones } from "@/lib/demo/dev-demo-data";

export function DemoDevExperience() {
  return (
    <DemoShell
      active="Foundry HQ"
      title="Foundry HQ"
      subtitle="Your day, your tasks and your projects — all in one place."
      deskOpen
    >
      <div className="space-y-8">
        {/* Developer dashboard */}
        <DevOverview />

        {/* Project timeline (Gantt) */}
        <section>
          <DemoSectionHeading number="04" label="PROJECT TIMELINE" />
          <GanttChart blocks={demoGanttBlocks} milestones={demoGanttMilestones} />
        </section>

        {/* Task board */}
        <section className="pb-6">
          <DemoSectionHeading number="05" label="TASK BOARD" />
          <TaskBoard tasks={demoBoardTasks} onCardClick={() => {}} />
        </section>
      </div>
    </DemoShell>
  );
}
