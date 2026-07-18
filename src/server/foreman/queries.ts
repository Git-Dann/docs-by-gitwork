/**
 * Foreman — read models + config for the Settings panel and the Desk "Delivery watch" panel.
 */

import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { resolveForemanConfig } from "./config";
import type { ForemanConfig, ForemanFinding, ForemanNarrative, ForemanStats } from "./types";

export interface ForemanRunSummary {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  stats: ForemanStats | null;
  findings: ForemanFinding[];
  narrative: ForemanNarrative | null;
  aiModel: string | null;
  error: string | null;
}

export interface ForemanStatus {
  config: ForemanConfig;
  latestRun: ForemanRunSummary | null;
  nextDueAt: string | null;
}

/** The frozen report the Desk panel renders — the latest successful live scan. */
export interface ForemanReport {
  runId: string;
  generatedAt: string;
  stats: ForemanStats | null;
  findings: ForemanFinding[];
  narrative: ForemanNarrative | null;
}

function toArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

const RUN_SELECT = {
  id: true,
  mode: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  stats: true,
  findings: true,
  narrative: true,
  aiModel: true,
  error: true,
} as const;

type RunRow = {
  id: string;
  mode: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  stats: unknown;
  findings: unknown;
  narrative: unknown;
  aiModel: string | null;
  error: string | null;
};

function serializeRun(r: RunRow): ForemanRunSummary {
  return {
    id: r.id,
    mode: r.mode,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    stats: (r.stats as ForemanStats) ?? null,
    findings: toArr<ForemanFinding>(r.findings),
    narrative: (r.narrative as ForemanNarrative) ?? null,
    aiModel: r.aiModel,
    error: r.error,
  };
}

/** Next 09:00 UTC after the last successful live run — informational, since the daily gate is
 *  "hasn't run today" rather than a fixed interval. Null until the first run lands. */
function nextNineAm(after: Date): string {
  const d = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate(), 9, 0, 0));
  if (d.getTime() <= after.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export async function getForemanStatus(): Promise<ForemanStatus> {
  const { workspace } = await ensureBaseRecords();
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspace.id },
    select: { id: true, foremanConfig: true },
  });
  const config = resolveForemanConfig(ws.foremanConfig);

  const [latest, lastReal] = await Promise.all([
    prisma.foremanRun.findFirst({ where: { workspaceId: ws.id }, orderBy: { startedAt: "desc" }, select: RUN_SELECT }),
    prisma.foremanRun.findFirst({
      where: { workspaceId: ws.id, mode: "scan", status: "succeeded" },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true },
    }),
  ]);

  return {
    config,
    latestRun: latest ? serializeRun(latest) : null,
    nextDueAt: lastReal?.finishedAt ? nextNineAm(lastReal.finishedAt) : null,
  };
}

export async function listForemanRuns(limit = 20): Promise<ForemanRunSummary[]> {
  const { workspace } = await ensureBaseRecords();
  const rows = await prisma.foremanRun.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { startedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: RUN_SELECT,
  });
  return rows.map(serializeRun);
}

/** The latest successful live scan, shaped for the Desk panel. Null before the first run. */
export async function getForemanReport(): Promise<ForemanReport | null> {
  const { workspace } = await ensureBaseRecords();
  const run = await prisma.foremanRun.findFirst({
    where: { workspaceId: workspace.id, mode: "scan", status: "succeeded" },
    orderBy: { startedAt: "desc" },
    select: RUN_SELECT,
  });
  if (!run) return null;
  const s = serializeRun(run);
  return {
    runId: s.id,
    generatedAt: s.finishedAt ?? s.startedAt,
    stats: s.stats,
    findings: s.findings,
    narrative: s.narrative,
  };
}

/** Merge a partial config over the stored one and persist. Returns the resolved config. */
export async function updateForemanConfig(patch: Partial<ForemanConfig>): Promise<ForemanConfig> {
  const { workspace } = await ensureBaseRecords();
  const current = resolveForemanConfig(
    (await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id }, select: { foremanConfig: true } }))
      .foremanConfig,
  );
  const merged = resolveForemanConfig({ ...current, ...patch });
  await prisma.workspace.update({ where: { id: workspace.id }, data: { foremanConfig: merged as unknown as object } });
  return merged;
}

/**
 * Whether a workspace is due a scheduled run today. Foreman is a once-a-day digest, so the gate is
 * "no successful live run has finished on today's (UTC) date yet" rather than a rolling interval —
 * that way the 09:00 enqueue fires exactly once per day and a re-run at 09:00:30 can't block it.
 */
export async function isForemanDue(workspaceId: string): Promise<{ enabled: boolean; due: boolean }> {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { foremanConfig: true } });
  const config = resolveForemanConfig(ws?.foremanConfig);
  if (!config.enabled) return { enabled: false, due: false };

  const now = new Date();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const lastToday = await prisma.foremanRun.findFirst({
    where: { workspaceId, mode: "scan", status: "succeeded", finishedAt: { gte: startToday } },
    select: { id: true },
  });
  return { enabled: true, due: !lastToday };
}
