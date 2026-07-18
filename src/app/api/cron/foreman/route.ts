import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { prisma } from "@/lib/prisma";
import { enqueueJob } from "@/server/jobs/queue";
import { isForemanDue } from "@/server/foreman/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/foreman  (host cron on the VPS — see CLAUDE.md §23, docs/vps-crons.md)
 *
 * Daily at 09:00. Enqueues a deduped FOREMAN_RUN for each workspace whose Foreman is enabled AND
 * hasn't already run today; the `/api/cron/jobs` worker (every minute) drains it moments later, so
 * the digest lands on admins' Desks just after 09:00. Enqueue-only + deduped, so an overlapping
 * tick never stacks runs. Mode follows each workspace's config (AI narrative on/off).
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    const workspaces = await prisma.workspace.findMany({ select: { id: true } });
    let queued = 0;
    for (const ws of workspaces) {
      const { enabled, due } = await isForemanDue(ws.id);
      if (!enabled || !due) continue;
      const { deduped } = await enqueueJob({
        type: "FOREMAN_RUN",
        payload: { workspaceId: ws.id },
        workspaceId: ws.id,
        dedupeKey: `foreman:${ws.id}`,
      });
      if (!deduped) queued += 1;
    }

    return apiOk({ queued, workspaces: workspaces.length });
  } catch (error) {
    return fromError(error);
  }
}
