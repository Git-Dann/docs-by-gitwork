// Portal Gantt → Team Calendar overlay (admin-only).
// Pulls top-level timeline info — dated feature blocks (Gantt bars) + milestones —
// across every client in the workspace, scoped to the visible month grid window.
// Admins / super-admins see all clients, so this is workspace-wide (the route
// gates with assertAtLeastAdmin); no per-client scope filter is applied.

import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { monthGridRange } from "@/server/backstage-gcal";
import type {
  CalendarTimeline,
  CalendarTimelineBlock,
  CalendarTimelineMilestone,
} from "@/types/backstage";

export async function getCalendarTimeline(
  user: EffectiveUser,
  year: number,
  month: number,
): Promise<CalendarTimeline> {
  await ensureBaseRecords();
  const { from, to } = monthGridRange(year, month);

  // Only dated blocks that intersect the grid window. The lt/gte comparators
  // naturally exclude rows with a null start/end date (board-only blocks).
  const blockRows = await prisma.featureBlock.findMany({
    where: {
      workspaceId: user.workspaceId,
      startDate: { lt: to },
      endDate: { gte: from },
    },
    select: {
      id: true,
      clientId: true,
      name: true,
      color: true,
      startDate: true,
      endDate: true,
      client: { select: { name: true, slug: true } },
      tasks: { select: { status: true } },
    },
    orderBy: [{ startDate: "asc" }, { name: "asc" }],
  });

  const blocks: CalendarTimelineBlock[] = blockRows.map((b) => {
    const taskCount = b.tasks.length;
    const doneCount = b.tasks.filter((t) => t.status === "DONE").length;
    return {
      id: b.id,
      clientId: b.clientId,
      clientName: b.client.name,
      clientSlug: b.client.slug,
      name: b.name,
      color: b.color,
      startDate: b.startDate!.toISOString(),
      endDate: b.endDate!.toISOString(),
      progress: taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100),
    };
  });

  const milestoneRows = await prisma.milestone.findMany({
    where: {
      workspaceId: user.workspaceId,
      date: { gte: from, lt: to },
    },
    select: {
      id: true,
      clientId: true,
      name: true,
      color: true,
      date: true,
      client: { select: { name: true, slug: true } },
    },
    orderBy: { date: "asc" },
  });

  const milestones: CalendarTimelineMilestone[] = milestoneRows.map((m) => ({
    id: m.id,
    clientId: m.clientId,
    clientName: m.client.name,
    clientSlug: m.client.slug,
    name: m.name,
    color: m.color,
    date: m.date.toISOString(),
  }));

  return { blocks, milestones };
}
