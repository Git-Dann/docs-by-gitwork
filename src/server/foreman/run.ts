/**
 * Foreman — run orchestrator.
 *
 * Sequence: gather delivery data → deterministic detection → trend-diff vs the previous run →
 * (opt-in) AI narrative → persist a ForemanRun + audit entry → dispatch a digest notification to
 * admins (only when there are real risks, and never on a dry run). Detection is free and always
 * runs; the AI pass only fires when consolidation is on AND there's something worth summarising.
 *
 * Called by the FOREMAN_RUN job handler and by the manual "Run now" / "Dry run" endpoints.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { recordAuditEntry } from "@/server/audit-log";
import { dispatchNotification } from "@/server/notifications";
import type { WorkspaceAiFields } from "@/server/ai-provider";
import { resolveForemanConfig } from "./config";
import { gatherWorkspace, detectFindings, countDevelopers } from "./scan";
import { runNarrative } from "./narrate";
import {
  sortFindings,
  type ForemanFinding,
  type ForemanNarrative,
  type ForemanRunResult,
  type ForemanStats,
  type Trend,
} from "./types";

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

export interface RunForemanOptions {
  workspaceId?: string;
  /** Force the AI narrative pass on for this run regardless of config. */
  consolidate?: boolean;
  /** Compute everything but persist a dry_run marker + never notify. */
  dryRun?: boolean;
}

/** The previous run's metric per finding key — drives the trend badges. */
async function previousMetrics(workspaceId: string): Promise<Map<string, number>> {
  const prev = await prisma.foremanRun.findFirst({
    where: { workspaceId, mode: "scan", status: "succeeded" },
    orderBy: { startedAt: "desc" },
    select: { findings: true },
  });
  const map = new Map<string, number>();
  const arr = Array.isArray(prev?.findings) ? (prev!.findings as unknown as ForemanFinding[]) : [];
  for (const f of arr) if (f && typeof f.key === "string") map.set(f.key, f.metric ?? 0);
  return map;
}

function trendFor(metric: number, prev: number | undefined): Trend {
  if (prev === undefined) return "new";
  if (metric > prev) return "worsening";
  if (metric < prev) return "improving";
  return "steady";
}

export async function runForeman(opts: RunForemanOptions = {}): Promise<ForemanRunResult> {
  const now = new Date();

  const ws = opts.workspaceId
    ? await prisma.workspace.findUniqueOrThrow({
        where: { id: opts.workspaceId },
        select: { id: true, foremanConfig: true, ...AI_FIELD_SELECT },
      })
    : await (async () => {
        const { workspace } = await ensureBaseRecords();
        return prisma.workspace.findUniqueOrThrow({
          where: { id: workspace.id },
          select: { id: true, foremanConfig: true, ...AI_FIELD_SELECT },
        });
      })();

  const config = resolveForemanConfig(ws.foremanConfig);
  const dryRun = !!opts.dryRun;
  const wantLLM = opts.consolidate === true || (config.consolidate && opts.consolidate !== false);
  const modeStr: ForemanRunResult["mode"] = dryRun ? "dry_run" : "scan";

  const run = await prisma.foremanRun.create({
    data: { workspaceId: ws.id, mode: modeStr, status: "running" },
    select: { id: true },
  });

  try {
    const data = await gatherWorkspace(ws.id);
    const prev = await previousMetrics(ws.id);

    const findings: ForemanFinding[] = sortFindings(
      detectFindings(data, config, now).map((f) => {
        const previousMetric = prev.get(f.key);
        return { ...f, trend: trendFor(f.metric, previousMetric), previousMetric: previousMetric ?? null };
      }),
    );

    const riskFindings = findings.filter((f) => f.severity !== "info");

    // AI narrative — only when consolidation is on AND there are real risks to summarise.
    let narrative: ForemanNarrative | null = null;
    let aiModel: string | null = null;
    let aiSkipped = true;
    if (wantLLM && riskFindings.length > 0) {
      const res = await runNarrative({ workspaceId: ws.id, aiFields: ws as WorkspaceAiFields, findings });
      narrative = res.narrative;
      aiModel = res.aiModel;
      aiSkipped = false;
    }

    const stats: ForemanStats = {
      clientsScanned: data.clients.length,
      developersScanned: countDevelopers(data),
      critical: findings.filter((f) => f.severity === "critical").length,
      warn: findings.filter((f) => f.severity === "warn").length,
      info: findings.filter((f) => f.severity === "info").length,
      projectFindings: findings.filter((f) => f.category === "project").length,
      developerFindings: findings.filter((f) => f.category === "developer").length,
      blindSpots: findings.filter((f) => f.category === "blindspot").length,
      newSinceLast: findings.filter((f) => f.trend === "new").length,
      worseningSinceLast: findings.filter((f) => f.trend === "worsening").length,
      improvingSinceLast: findings.filter((f) => f.trend === "improving").length,
      aiSkipped,
    };

    // Push to the Desk: a grouped digest for admins, ONLY when there are real risks and this is a
    // live run. All-clear days are silent (no false pings), and info-only blind spots don't notify.
    let notified = false;
    if (!dryRun && riskFindings.length > 0) {
      const projects = new Set(riskFindings.filter((f) => f.category === "project").map((f) => f.subjectLabel));
      const devs = new Set(riskFindings.filter((f) => f.category === "developer").map((f) => f.subjectLabel));
      const parts: string[] = [];
      if (projects.size > 0) parts.push(`${projects.size} ${projects.size === 1 ? "project" : "projects"}`);
      if (devs.size > 0) parts.push(`${devs.size} ${devs.size === 1 ? "developer" : "developers"}`);
      const subject = parts.join(" and ") || "delivery";
      const needs = projects.size + devs.size === 1 ? "needs" : "need";
      const isoDate = now.toISOString().slice(0, 10);
      dispatchNotification({
        event: "foreman.digest",
        workspaceId: ws.id,
        title: `Delivery watch — ${subject} ${needs} attention`,
        body: riskFindings[0]?.headline ?? null,
        actionUrl: "/app",
        target: { kind: "admins" },
        groupKey: `foreman.daily:${isoDate}`,
        count: 1,
        metadata: { runId: run.id, critical: stats.critical, warn: stats.warn },
      });
      notified = true;
    }

    await prisma.foremanRun.update({
      where: { id: run.id },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        stats: stats as unknown as Prisma.InputJsonValue,
        findings: findings as unknown as Prisma.InputJsonValue,
        narrative: (narrative ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        aiModel,
      },
    });

    await recordAuditEntry({
      workspaceId: ws.id,
      actorId: null,
      action: "foreman.run.completed",
      target: run.id,
      metadata: { mode: modeStr, dryRun, notified, ...stats },
    });

    return { runId: run.id, mode: modeStr, status: "succeeded", stats, findings, narrative, aiModel, notified };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.foremanRun
      .update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(), error: message } })
      .catch(() => {});
    throw error;
  }
}
