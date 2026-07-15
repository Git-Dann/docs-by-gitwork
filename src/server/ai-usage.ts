/**
 * Per-call AI usage logging + read/aggregation.
 *
 * `recordAiUsage` is a FIRE-AND-FORGET writer — it returns synchronously and never blocks or
 * throws into the AI call path (a logging failure must never break an AI response). Instrumented
 * call sites read `.usage` off the SDK response they already have, normalise it with one of the
 * `usageFrom*` extractors, and call `recordAiUsage({...ctx, usage})`.
 *
 * `getAiUsageAnalytics` powers the Super-Admin Analytics → AI usage scope: totals, a day/hour
 * time-series, and breakdowns by module / model / user, plus reconciliation against the
 * authoritative provider-billed total from ai-cost.ts.
 *
 * No prompt or response text is ever stored — only token counts, model, module, ids, cost,
 * latency, and success.
 */

import type { AiModule, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd, type TokenUsage } from "@/server/ai-pricing";

export type { AiModule } from "@prisma/client";

export interface AiUsageContext {
  module: AiModule;
  workspaceId: string;
  userId?: string | null;
  operation?: string | null;
}

export interface RecordAiUsageInput extends AiUsageContext {
  provider: string;
  model: string; // the model actually billed (post light-tier swap)
  usage: TokenUsage;
  latencyMs?: number | null;
  success?: boolean;
  errorKind?: string | null;
  cached?: boolean; // true when served from AiResponseCache (0 tokens, 0 cost)
}

/**
 * Record one AI call. Fire-and-forget: returns void immediately, the DB write is a floating
 * promise with a .catch. NEVER await this in the AI path, and it never throws.
 */
export function recordAiUsage(input: RecordAiUsageInput): void {
  void writeUsage(input).catch((err) =>
    console.error("[ai-usage] write failed", { module: input.module, model: input.model, err }),
  );
}

// Per-workspace logging on/off, cached ~60s. Checked inside the async writer only (never on the
// AI hot path — recordAiUsage is fire-and-forget), so the occasional flag read costs nothing
// user-visible. Default ON: a workspace with no flag row logs until a Super Admin turns it off.
const flagCache = new Map<string, { enabled: boolean; at: number }>();
const FLAG_TTL_MS = 60_000;

async function isLoggingEnabled(workspaceId: string): Promise<boolean> {
  const cached = flagCache.get(workspaceId);
  const now = Date.now();
  if (cached && now - cached.at < FLAG_TTL_MS) return cached.enabled;
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { aiUsageLoggingEnabled: true },
  });
  const enabled = ws?.aiUsageLoggingEnabled ?? true;
  flagCache.set(workspaceId, { enabled, at: now });
  return enabled;
}

async function writeUsage(input: RecordAiUsageInput): Promise<void> {
  if (!(await isLoggingEnabled(input.workspaceId))) return;
  const u = input.usage;
  const totalTokens = u.inputTokens + u.outputTokens + u.cachedInputTokens + (u.cacheWriteTokens ?? 0);
  const costUsd = input.cached ? 0 : estimateCostUsd(input.model, u);
  await prisma.aiUsageLog.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      module: input.module,
      provider: input.provider,
      model: input.model,
      inputTokens: Math.max(0, Math.round(u.inputTokens)),
      outputTokens: Math.max(0, Math.round(u.outputTokens)),
      cachedInputTokens: Math.max(0, Math.round(u.cachedInputTokens)),
      cacheWriteTokens: Math.max(0, Math.round(u.cacheWriteTokens ?? 0)),
      totalTokens: Math.max(0, Math.round(totalTokens)),
      costUsd,
      latencyMs: input.latencyMs != null ? Math.max(0, Math.round(input.latencyMs)) : null,
      success: input.success ?? true,
      errorKind: input.errorKind ?? null,
      operation: input.operation ?? null,
      cached: input.cached ?? false,
    },
  });
}

// ── Usage extractors: normalise SDK usage objects into TokenUsage ──────────────

type AnthropicUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};
type OpenAIUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
};

/** Anthropic Message.usage → TokenUsage. input_tokens already EXCLUDES cache reads/writes. */
export function usageFromAnthropic(usage: AnthropicUsage | null | undefined): TokenUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cachedInputTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
  };
}

/** OpenAI completion.usage → TokenUsage. prompt_tokens INCLUDES cached (estimateCostUsd subtracts). */
export function usageFromOpenAI(usage: OpenAIUsage | null | undefined): TokenUsage {
  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: 0,
  };
}

// ── Read / aggregation ─────────────────────────────────────────────────────────

export interface AiUsageAnalyticsOptions {
  from?: Date;
  to?: Date;
  module?: AiModule;
  bucket?: "day" | "week";
}

export interface AiUsageAnalytics {
  range: { from: string; to: string; bucket: "day" | "week" };
  totals: {
    calls: number;
    tokens: number;
    costUsd: number;
    errorRate: number | null;
    avgLatencyMs: number | null;
  };
  timeSeries: Array<{ bucket: string; calls: number; tokens: number; costUsd: number }>;
  byModule: Array<{ module: AiModule; calls: number; tokens: number; costUsd: number }>;
  byModel: Array<{ model: string; calls: number; tokens: number; costUsd: number }>;
  byUser: Array<{ userId: string | null; name: string | null; calls: number; tokens: number; costUsd: number }>;
  reconciliation: { summedCostUsd: number; providerBilledUsd: number | null; note: string };
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function startOfIsoWeek(d: Date): Date {
  const day = d.getUTCDay();
  const sinceMonday = (day + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday));
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function getAiUsageAnalytics(
  workspaceId: string,
  opts: AiUsageAnalyticsOptions = {},
): Promise<AiUsageAnalytics> {
  const MS_PER_DAY = 86_400_000;
  const to = opts.to ?? new Date();
  const from = opts.from ?? new Date(to.getTime() - 90 * MS_PER_DAY);
  const rangeDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / MS_PER_DAY));
  const bucket: "day" | "week" = opts.bucket ?? (rangeDays > 120 ? "week" : "day");

  const where: Prisma.AiUsageLogWhereInput = {
    workspaceId,
    createdAt: { gte: from, lte: to },
    ...(opts.module ? { module: opts.module } : {}),
  };

  // AiUsageLog has no JOINs, so the 42702 ambiguous-createdAt trap doesn't apply. Pull the raw
  // rows for the range (bounded) and bucket + break down in JS — simpler than date_trunc and the
  // per-workspace volume over a bounded window is modest.
  const [agg, errorCount, rows] = await Promise.all([
    prisma.aiUsageLog.aggregate({
      where,
      _count: { _all: true },
      _sum: { totalTokens: true, costUsd: true },
      _avg: { latencyMs: true },
    }),
    prisma.aiUsageLog.count({ where: { ...where, success: false } }),
    prisma.aiUsageLog.findMany({
      where,
      select: {
        createdAt: true,
        module: true,
        model: true,
        userId: true,
        totalTokens: true,
        costUsd: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50_000,
    }),
  ]);

  const calls = agg._count._all;

  // Time-series (gapless).
  const buckets = new Map<string, { calls: number; tokens: number; costUsd: number }>();
  let cursor = bucket === "week" ? startOfIsoWeek(from) : startOfUtcDay(from);
  const end = startOfUtcDay(to);
  for (let i = 0; cursor <= end && i < 2000; i += 1) {
    buckets.set(ymd(cursor), { calls: 0, tokens: 0, costUsd: 0 });
    cursor = new Date(cursor.getTime() + (bucket === "week" ? 7 : 1) * MS_PER_DAY);
  }
  const keyFor = (d: Date) => ymd(bucket === "week" ? startOfIsoWeek(d) : startOfUtcDay(d));

  const byModule = new Map<AiModule, { calls: number; tokens: number; costUsd: number }>();
  const byModel = new Map<string, { calls: number; tokens: number; costUsd: number }>();
  const byUser = new Map<string, { calls: number; tokens: number; costUsd: number }>();

  for (const r of rows) {
    const b = buckets.get(keyFor(r.createdAt));
    if (b) {
      b.calls += 1;
      b.tokens += r.totalTokens;
      b.costUsd += r.costUsd;
    }
    const mod = byModule.get(r.module) ?? { calls: 0, tokens: 0, costUsd: 0 };
    mod.calls += 1;
    mod.tokens += r.totalTokens;
    mod.costUsd += r.costUsd;
    byModule.set(r.module, mod);

    const mdl = byModel.get(r.model) ?? { calls: 0, tokens: 0, costUsd: 0 };
    mdl.calls += 1;
    mdl.tokens += r.totalTokens;
    mdl.costUsd += r.costUsd;
    byModel.set(r.model, mdl);

    const uKey = r.userId ?? "__none__";
    const usr = byUser.get(uKey) ?? { calls: 0, tokens: 0, costUsd: 0 };
    usr.calls += 1;
    usr.tokens += r.totalTokens;
    usr.costUsd += r.costUsd;
    byUser.set(uKey, usr);
  }

  // Resolve user names (ids → findMany → Map), skipping the sentinel.
  const userIds = [...byUser.keys()].filter((k) => k !== "__none__");
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name?.trim() || u.email]));

  const summedCostUsd = round4(agg._sum.costUsd ?? 0);

  return {
    range: { from: from.toISOString(), to: to.toISOString(), bucket },
    totals: {
      calls,
      tokens: agg._sum.totalTokens ?? 0,
      costUsd: summedCostUsd,
      errorRate: calls ? round4(errorCount / calls) : null,
      avgLatencyMs: agg._avg.latencyMs != null ? Math.round(agg._avg.latencyMs) : null,
    },
    timeSeries: [...buckets.entries()]
      .map(([b, v]) => ({ bucket: b, calls: v.calls, tokens: v.tokens, costUsd: round4(v.costUsd) }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket)),
    byModule: [...byModule.entries()]
      .map(([module, v]) => ({ module, calls: v.calls, tokens: v.tokens, costUsd: round4(v.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byModel: [...byModel.entries()]
      .map(([model, v]) => ({ model, calls: v.calls, tokens: v.tokens, costUsd: round4(v.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byUser: [...byUser.entries()]
      .map(([k, v]) => ({
        userId: k === "__none__" ? null : k,
        name: k === "__none__" ? "System / background" : (nameById.get(k) ?? "Unknown"),
        calls: v.calls,
        tokens: v.tokens,
        costUsd: round4(v.costUsd),
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
    reconciliation: {
      summedCostUsd,
      providerBilledUsd: null,
      note: "Per-call figures are estimated from list pricing (for attribution). The provider-billed total from the AI spend card is authoritative.",
    },
  };
}
