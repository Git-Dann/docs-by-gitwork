/**
 * Curator — read models + config for the Settings → Curator UI.
 */

import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { resolveCuratorConfig } from "./config";
import type { CuratorConfig, CuratorProposal, CuratorStats, CuratorTransition } from "./types";

export interface CuratorRunSummary {
  id: string;
  mode: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  stats: CuratorStats | null;
  transitions: CuratorTransition[];
  proposals: CuratorProposal[];
  aiModel: string | null;
  error: string | null;
}

export interface LruStarter {
  id: string;
  name: string;
  usageCount: number;
  lastUsedAt: string | null;
  curatorState: string;
}

export interface CuratorStatus {
  config: CuratorConfig;
  latestRun: CuratorRunSummary | null;
  nextDueAt: string | null;
  lruStarters: LruStarter[];
}

function toJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function serializeRun(r: {
  id: string;
  mode: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  stats: unknown;
  transitions: unknown;
  proposals: unknown;
  aiModel: string | null;
  error: string | null;
}): CuratorRunSummary {
  return {
    id: r.id,
    mode: r.mode,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
    stats: (r.stats as CuratorStats) ?? null,
    transitions: toJsonArray<CuratorTransition>(r.transitions),
    proposals: toJsonArray<CuratorProposal>(r.proposals),
    aiModel: r.aiModel,
    error: r.error,
  };
}

const RUN_SELECT = {
  id: true,
  mode: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  stats: true,
  transitions: true,
  proposals: true,
  aiModel: true,
  error: true,
} as const;

export async function getCuratorStatus(): Promise<CuratorStatus> {
  const { workspace } = await ensureBaseRecords();
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspace.id },
    select: { id: true, curatorConfig: true },
  });
  const config = resolveCuratorConfig(ws.curatorConfig);

  // Latest non-dry run drives "next due"; latest run of any kind is shown.
  const [latest, lastRealRun, lru] = await Promise.all([
    prisma.curatorRun.findFirst({
      where: { workspaceId: ws.id },
      orderBy: { startedAt: "desc" },
      select: RUN_SELECT,
    }),
    prisma.curatorRun.findFirst({
      where: { workspaceId: ws.id, mode: { not: "dry_run" }, status: "succeeded" },
      orderBy: { startedAt: "desc" },
      select: { finishedAt: true },
    }),
    prisma.starter.findMany({
      where: { workspaceId: ws.id, isDefault: false, isArchived: false },
      orderBy: [{ lastUsedAt: { sort: "asc", nulls: "first" } }],
      take: 5,
      select: { id: true, name: true, usageCount: true, lastUsedAt: true, curatorState: true },
    }),
  ]);

  const nextDueAt = lastRealRun?.finishedAt
    ? new Date(lastRealRun.finishedAt.getTime() + config.intervalDays * 86_400_000).toISOString()
    : null;

  return {
    config,
    latestRun: latest ? serializeRun(latest) : null,
    nextDueAt,
    lruStarters: lru.map((s) => ({
      id: s.id,
      name: s.name,
      usageCount: s.usageCount,
      lastUsedAt: s.lastUsedAt ? s.lastUsedAt.toISOString() : null,
      curatorState: s.curatorState,
    })),
  };
}

export async function listCuratorRuns(limit = 20): Promise<CuratorRunSummary[]> {
  const { workspace } = await ensureBaseRecords();
  const rows = await prisma.curatorRun.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { startedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 50),
    select: RUN_SELECT,
  });
  return rows.map(serializeRun);
}

/** Merge a partial config over the stored one and persist. Returns the resolved config. */
export async function updateCuratorConfig(patch: Partial<CuratorConfig>): Promise<CuratorConfig> {
  const { workspace } = await ensureBaseRecords();
  const current = resolveCuratorConfig(
    (await prisma.workspace.findUniqueOrThrow({ where: { id: workspace.id }, select: { curatorConfig: true } }))
      .curatorConfig,
  );
  const merged = resolveCuratorConfig({ ...current, ...patch });
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { curatorConfig: merged as unknown as object },
  });
  return merged;
}

export interface CheckStatDto {
  signal: string | null;
  fireCount: number;
  passRate: number; // 0..1 over evaluations
  lastFiredAt: string | null;
}

/** Map checkKey → usage stat, for the Settings → Checks signal column. */
export async function getCheckStatMap(): Promise<Record<string, CheckStatDto>> {
  const { workspace } = await ensureBaseRecords();
  const rows = await prisma.pulseCheckStat.findMany({
    where: { workspaceId: workspace.id },
    select: { checkKey: true, signal: true, fireCount: true, passCount: true, lastFiredAt: true },
  });
  const out: Record<string, CheckStatDto> = {};
  for (const r of rows) {
    out[r.checkKey] = {
      signal: r.signal,
      fireCount: r.fireCount,
      passRate: r.fireCount > 0 ? r.passCount / r.fireCount : 0,
      lastFiredAt: r.lastFiredAt ? r.lastFiredAt.toISOString() : null,
    };
  }
  return out;
}

/** Whether a workspace is due a scheduled run (used by the cron enqueue). */
export async function isCuratorDue(workspaceId: string): Promise<{ enabled: boolean; due: boolean }> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { curatorConfig: true },
  });
  const config = resolveCuratorConfig(ws?.curatorConfig);
  if (!config.enabled) return { enabled: false, due: false };

  const lastRun = await prisma.curatorRun.findFirst({
    where: { workspaceId, mode: { not: "dry_run" }, status: "succeeded" },
    orderBy: { startedAt: "desc" },
    select: { finishedAt: true },
  });
  if (!lastRun?.finishedAt) return { enabled: true, due: true };
  const dueAt = lastRun.finishedAt.getTime() + config.intervalDays * 86_400_000;
  return { enabled: true, due: Date.now() >= dueAt };
}
