/**
 * Curator — reverse a run's deterministic transitions (the DB-native rollback).
 *
 * Undoes the automatic Starter lifecycle changes a run applied: an archive → back to its prior
 * state (and un-hidden); a stale → back to ACTIVE. Only touches starters still in the state the run
 * left them in, so a subsequent manual change is never clobbered. LLM proposals are not reversed
 * here — applied check-config changes revert via the Checks panel, archived starters via unarchive.
 */

import { prisma } from "@/lib/prisma";
import { recordAuditEntry } from "@/server/audit-log";
import type { CuratorTransition, StarterLifecycleState } from "./types";

export interface RestoreOutcome {
  ok: boolean;
  reversed: number;
  reason?: string;
}

export async function restoreCuratorRun(runId: string): Promise<RestoreOutcome> {
  const run = await prisma.curatorRun.findUnique({
    where: { id: runId },
    select: { workspaceId: true, transitions: true, mode: true },
  });
  if (!run) return { ok: false, reversed: 0, reason: "Run not found" };
  if (run.mode === "dry_run") return { ok: false, reversed: 0, reason: "Dry runs make no changes to reverse" };

  const transitions = Array.isArray(run.transitions)
    ? (run.transitions as unknown as CuratorTransition[])
    : [];

  let reversed = 0;
  for (const t of transitions) {
    // Only revert if the starter is still in the state this run left it in.
    const res = await prisma.starter.updateMany({
      where: { id: t.target, curatorState: t.to as StarterLifecycleState },
      data: {
        curatorState: t.from as StarterLifecycleState,
        // Un-hide anything this run archived.
        ...(t.kind === "starter_archive" ? { isArchived: false } : {}),
      },
    });
    reversed += res.count;
  }

  await recordAuditEntry({
    workspaceId: run.workspaceId,
    actorId: null,
    action: "curator.run.restored",
    target: runId,
    metadata: { reversed },
  });

  return { ok: true, reversed };
}
