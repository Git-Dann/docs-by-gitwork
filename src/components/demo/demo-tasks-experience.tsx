"use client";

/**
 * Standalone Foundry Tasks demo (`/demo/tasks`). Renders the real per-client
 * `ClientTasksWorkspace` (Board · List · Gantt) for the sample client, fed via
 * the DemoShell interceptor (tasks, feature blocks, milestones). Reached from the
 * "Tasks →" links on the portal/dashboard. No auth, no database.
 */

import { ClientTasksWorkspace } from "@/components/tasks/client-tasks-workspace";
import { DemoShell } from "@/components/demo/demo-shell";

export function DemoTasksExperience() {
  return (
    <DemoShell
      active="Portal"
      title="Northwind Studio — Tasks"
      subtitle="Board, list and timeline for the project."
    >
      <ClientTasksWorkspace slug="northwind" />
    </DemoShell>
  );
}
