/**
 * Job handler registry. Maps each `JobType` to its handler. The runner dispatches through this.
 * To add a job: add the type to `JobType` (types.ts) and register its handler here.
 */

import type { Prisma } from "@prisma/client";
import type { JobHandler, JobType } from "@/server/jobs/types";
import { runClientArchive } from "@/server/client-archive";
import { runRetentionSweep } from "@/server/retention/sweep";
import { runCurator } from "@/server/curator/run";

const registry: { [K in JobType]: JobHandler<K> } = {
  CLIENT_ARCHIVE: async (payload) => {
    const result = await runClientArchive(payload.clientId);
    return result as unknown as Prisma.InputJsonValue;
  },
  RETENTION_SWEEP: async (payload) => {
    const result = await runRetentionSweep({ policyKey: payload.policyKey });
    return result as unknown as Prisma.InputJsonValue;
  },
  CURATOR_RUN: async (payload) => {
    const result = await runCurator({
      workspaceId: payload.workspaceId,
      mode: payload.mode,
      dryRun: payload.dryRun,
    });
    return result as unknown as Prisma.InputJsonValue;
  },
};

export function getJobHandler(type: string): JobHandler<JobType> | null {
  return (registry as Record<string, JobHandler<JobType>>)[type] ?? null;
}
