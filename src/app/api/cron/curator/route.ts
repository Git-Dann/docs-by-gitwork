import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/server/jobs/queue";
import { isCuratorDue } from "@/server/curator/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/curator  (host cron on the VPS — see CLAUDE.md §23)
 *
 * Weekly. Enqueues a deduped CURATOR_RUN for each workspace whose curator is enabled AND due
 * (≥ intervalDays since its last successful non-dry run); the `/api/cron/jobs` worker drains it.
 * The weekly schedule + the interval-gate both point at once-a-week. Enqueue-only + deduped, so an
 * overlapping tick never stacks runs. Mode follows each workspace's config (consolidate on/off).
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    const workspaces = await prisma.workspace.findMany({ select: { id: true } });
    let queued = 0;
    for (const ws of workspaces) {
      const { enabled, due } = await isCuratorDue(ws.id);
      if (!enabled || !due) continue;
      const { deduped } = await enqueueJob({
        type: "CURATOR_RUN",
        payload: { workspaceId: ws.id },
        workspaceId: ws.id,
        dedupeKey: `curator:${ws.id}`,
      });
      if (!deduped) queued += 1;
    }

    return apiOk({ queued, workspaces: workspaces.length });
  } catch (error) {
    return fromError(error);
  }
}
