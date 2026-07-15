/**
 * Curator — run orchestrator.
 *
 * Sequence: deterministic Starter lifecycle pass → Pulse-check aggregation → (opt-in) LLM
 * consolidation → persist a CuratorRun + audit entry. Deterministic passes always run (free); the
 * LLM pass only runs when consolidation is on AND there's something reviewable — otherwise it's
 * skipped and the run costs £0.
 *
 * Called by the CURATOR_RUN job handler and by the manual "Run now" / "Dry run" endpoints.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { recordAuditEntry } from "@/server/audit-log";
import type { WorkspaceAiFields } from "@/server/ai-provider";
import { resolveCuratorConfig } from "./config";
import { runStartersPass } from "./starters-pass";
import { runChecksPass } from "./checks-pass";
import { runConsolidation } from "./consolidate";
import type { CuratorProposal, CuratorRunResult, CuratorStats, CuratorTransition } from "./types";

const AI_FIELD_SELECT = {
  aiProvider: true,
  anthropicApiKey: true,
  anthropicModel: true,
  openaiApiKey: true,
  openaiModel: true,
  geminiApiKey: true,
  geminiModel: true,
  localLlmUrl: true,
  localLlmModel: true,
} as const;

export interface RunCuratorOptions {
  workspaceId?: string;
  /** "prune" = deterministic only; "consolidate" = force the LLM pass on. Omitted = follow config. */
  mode?: "prune" | "consolidate";
  /** Compute everything but mutate nothing. */
  dryRun?: boolean;
}

export async function runCurator(opts: RunCuratorOptions = {}): Promise<CuratorRunResult> {
  const now = new Date();

  // Resolve workspace (explicit id, else the default base workspace).
  const ws = opts.workspaceId
    ? await prisma.workspace.findUniqueOrThrow({
        where: { id: opts.workspaceId },
        select: { id: true, curatorConfig: true, ...AI_FIELD_SELECT },
      })
    : await (async () => {
        const { workspace } = await ensureBaseRecords();
        return prisma.workspace.findUniqueOrThrow({
          where: { id: workspace.id },
          select: { id: true, curatorConfig: true, ...AI_FIELD_SELECT },
        });
      })();

  const config = resolveCuratorConfig(ws.curatorConfig);
  const dryRun = !!opts.dryRun;
  const wantLLM = opts.mode === "consolidate" || (config.consolidate && opts.mode !== "prune");
  const modeStr: CuratorRunResult["mode"] = dryRun ? "dry_run" : wantLLM ? "consolidate" : "prune";

  const run = await prisma.curatorRun.create({
    data: { workspaceId: ws.id, mode: modeStr, status: "running" },
    select: { id: true },
  });

  try {
    const starters = await runStartersPass(ws.id, config, now, dryRun);
    const checks = await runChecksPass(ws.id, now, dryRun);

    // Only spend tokens when consolidation is on and there's plausibly something to review.
    const hasReviewable = checks.candidates.length > 0 || starters.candidates.length >= 2;
    let proposals: CuratorProposal[] = [];
    let aiModel: string | null = null;
    let aiSkipped = true;

    if (wantLLM && hasReviewable) {
      const consolidation = await runConsolidation({
        workspaceId: ws.id,
        aiFields: ws as WorkspaceAiFields,
        starters: starters.candidates,
        checks: checks.candidates,
      });
      proposals = consolidation.proposals;
      aiModel = consolidation.aiModel;
      aiSkipped = false;
    }

    const transitions: CuratorTransition[] = starters.transitions;
    const stats: CuratorStats = {
      startersScanned: starters.scanned,
      startersStaled: transitions.filter((t) => t.kind === "starter_stale").length,
      startersArchived: transitions.filter((t) => t.kind === "starter_archive").length,
      starterCandidates: starters.candidates.length,
      checksAggregated: checks.aggregated,
      deadChecks: checks.deadChecks,
      alwaysPassChecks: checks.alwaysPassChecks,
      noisyChecks: checks.noisyChecks,
      proposalsCreated: proposals.length,
      aiSkipped,
    };

    await prisma.curatorRun.update({
      where: { id: run.id },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        stats: stats as unknown as Prisma.InputJsonValue,
        transitions: transitions as unknown as Prisma.InputJsonValue,
        proposals: proposals as unknown as Prisma.InputJsonValue,
        aiModel,
      },
    });

    await recordAuditEntry({
      workspaceId: ws.id,
      actorId: null,
      action: "curator.run.completed",
      target: run.id,
      metadata: { mode: modeStr, dryRun, ...stats },
    });

    return { runId: run.id, mode: modeStr, status: "succeeded", stats, transitions, proposals, aiModel };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.curatorRun
      .update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(), error: message } })
      .catch(() => {});
    throw error;
  }
}
