import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loggerFor } from "@/lib/logger";

const log = loggerFor("for-each-workspace");

export type WorkspaceRun<T> =
  | { workspaceId: string; ok: true; result: T }
  | { workspaceId: string; ok: false; error: string };

/**
 * Run a scheduled job once per workspace that matches `where`, one at a time.
 *
 * Every cron that used to work on "the Gitwork workspace" goes through this, so a second
 * business gets its own run with its own settings, and one business's failure (a bad key, a
 * dead connector) can't stop the others: each run is caught and reported, never rethrown.
 *
 * Sequential on purpose. These jobs call Google, Slack and AI providers with each workspace's
 * own credentials, and running every business at once would multiply the load on the box and
 * on the rate limits the jobs already work within.
 */
export async function forEachWorkspace<S extends Prisma.WorkspaceSelect, T>(
  args: { where?: Prisma.WorkspaceWhereInput; select: S },
  run: (workspace: Prisma.WorkspaceGetPayload<{ select: S }> & { id: string }) => Promise<T>,
): Promise<WorkspaceRun<T>[]> {
  // `id` is always selected: every run is reported against it.
  const select: Prisma.WorkspaceSelect = { ...args.select, id: true };
  const workspaces = (await prisma.workspace.findMany({
    where: args.where,
    select,
    orderBy: { createdAt: "asc" },
  })) as unknown as (Prisma.WorkspaceGetPayload<{ select: S }> & { id: string })[];

  const out: WorkspaceRun<T>[] = [];
  for (const workspace of workspaces) {
    try {
      out.push({ workspaceId: workspace.id, ok: true, result: await run(workspace) });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.error("workspace run failed", { workspaceId: workspace.id, error });
      out.push({ workspaceId: workspace.id, ok: false, error });
    }
  }
  return out;
}
