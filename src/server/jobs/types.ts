/**
 * Background job types + handler contract.
 *
 * The durable job queue (`BackgroundJob` table) is the reusable spine for async/throughput work
 * now that production is a long-running process on the VPS (no serverless time cap). Jobs are
 * enqueued via `enqueueJob` (src/server/jobs/queue.ts) and drained by `GET /api/cron/jobs`, which
 * dispatches each due job to the handler registered for its `type` (src/server/jobs/handlers.ts).
 */

import type { Prisma, BackgroundJob } from "@prisma/client";

/** Registered job types. Add a member here + a handler in `handlers.ts` to introduce a new job. */
export type JobType = "CLIENT_ARCHIVE" | "RETENTION_SWEEP" | "CURATOR_RUN" | "FOREMAN_RUN";

/** Payload shape per job type. Keep these small + serialisable (they live in a JSON column). */
export interface JobPayloads {
  CLIENT_ARCHIVE: {
    clientId: string;
    /** What triggered the archive — for audit/debugging only. */
    reason: "archived" | "deleted" | "manual";
  };
  RETENTION_SWEEP: {
    /** Optional single-policy run; omitted = all registered policies. */
    policyKey?: string;
  };
  CURATOR_RUN: {
    /** Target workspace; omitted = the default base workspace. */
    workspaceId?: string;
    /** "prune" = deterministic only; "consolidate" = force LLM pass. Omitted = follow config. */
    mode?: "prune" | "consolidate";
    /** Compute everything but mutate nothing. */
    dryRun?: boolean;
  };
  FOREMAN_RUN: {
    /** Target workspace; omitted = the default base workspace. */
    workspaceId?: string;
    /** Force the AI narrative pass on. Omitted = follow config. */
    consolidate?: boolean;
    /** Compute everything but persist a dry_run marker + never notify. */
    dryRun?: boolean;
  };
}

/**
 * A job handler. Receives the typed payload and the raw job row (for `attempts`, etc.). Returns an
 * optional JSON result stored on `BackgroundJob.result`. Throwing marks the attempt failed and the
 * runner reschedules with backoff (or dead-letters after `maxAttempts`).
 */
export type JobHandler<T extends JobType> = (
  payload: JobPayloads[T],
  job: BackgroundJob,
) => Promise<Prisma.InputJsonValue | void>;

/** Backoff schedule (ms) before the Nth retry. Index = attempts already made. Caps at the last. */
export const BACKOFF_MS = [
  60_000, // 1 min
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  2 * 60 * 60_000, // 2 h
  6 * 60 * 60_000, // 6 h
];

export function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}
