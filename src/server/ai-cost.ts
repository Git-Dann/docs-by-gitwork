import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ════════════════════════════════════════════════════════════════════════════
// AI spend — reads REAL billed cost from the provider Cost APIs for the Super-Admin
// "AI spend" card. Uses read-only org Admin keys (env vars take precedence over the
// workspace-stored keys). Never throws to the caller — every failure becomes a
// per-provider status so the card can render gracefully. The whole summary is cached
// in AiResponseCache (~1h) so we don't hit the cost API on every render.
// ════════════════════════════════════════════════════════════════════════════

export type CostProvider = "ANTHROPIC" | "OPENAI";
export type CostStatus = "ok" | "not_configured" | "error";

export interface ProviderCost {
  provider: CostProvider;
  status: CostStatus;
  today: number; // USD
  monthToDate: number; // USD
  currency: string;
  modelLabel: string | null;
  error?: string;
}

export interface AiCostSummary {
  providers: ProviderCost[];
  /** True if at least one provider has an admin key configured. */
  configured: boolean;
  fetchedAt: string;
}

const CACHE_KEY = "ai-cost";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 12_000;

interface AdminKeys {
  anthropic: string | null;
  openai: string | null;
}

function resolveAdminKeys(ws: {
  anthropicAdminApiKey?: string | null;
  openaiAdminApiKey?: string | null;
}): AdminKeys {
  return {
    anthropic: process.env.ANTHROPIC_ADMIN_KEY?.trim() || ws.anthropicAdminApiKey?.trim() || null,
    openai: process.env.OPENAI_ADMIN_KEY?.trim() || ws.openaiAdminApiKey?.trim() || null,
  };
}

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
function startOfDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Coerce anything number-ish (string or number) to a finite number, else 0. */
function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

// ── Anthropic ────────────────────────────────────────────────────────────────
// GET /v1/organizations/cost_report — daily USD buckets. Response shape (defensively
// parsed): { data: [{ starting_at, results: [{ amount, currency }] }] }.
async function anthropicCost(key: string, now: Date, modelLabel: string | null): Promise<ProviderCost> {
  const base: ProviderCost = {
    provider: "ANTHROPIC",
    status: "ok",
    today: 0,
    monthToDate: 0,
    currency: "USD",
    modelLabel,
  };
  try {
    const params = new URLSearchParams({
      starting_at: startOfMonthUtc(now).toISOString(),
      bucket_width: "1d",
    });
    const json = (await fetchJson(
      `https://api.anthropic.com/v1/organizations/cost_report?${params.toString()}`,
      { "x-api-key": key, "anthropic-version": "2023-06-01" },
    )) as { data?: Array<{ starting_at?: string; results?: Array<Record<string, unknown>> }> };

    const dayStart = startOfDayUtc(now).getTime();
    for (const bucket of json.data ?? []) {
      const bucketStart = bucket.starting_at ? Date.parse(bucket.starting_at) : NaN;
      for (const r of bucket.results ?? []) {
        const amount = num(r.amount);
        if (typeof r.currency === "string") base.currency = r.currency;
        base.monthToDate += amount;
        if (Number.isFinite(bucketStart) && bucketStart >= dayStart) base.today += amount;
      }
    }
    return base;
  } catch (err) {
    return { ...base, status: "error", error: err instanceof Error ? err.message : "fetch failed" };
  }
}

// ── OpenAI ───────────────────────────────────────────────────────────────────
// GET /v1/organizations/costs — daily buckets. { data: [{ start_time, results: [{ amount: { value, currency } }] }] }.
async function openaiCost(key: string, now: Date, modelLabel: string | null): Promise<ProviderCost> {
  const base: ProviderCost = {
    provider: "OPENAI",
    status: "ok",
    today: 0,
    monthToDate: 0,
    currency: "USD",
    modelLabel,
  };
  try {
    const params = new URLSearchParams({
      start_time: String(Math.floor(startOfMonthUtc(now).getTime() / 1000)),
      bucket_width: "1d",
      limit: "62",
    });
    const json = (await fetchJson(
      `https://api.openai.com/v1/organizations/costs?${params.toString()}`,
      { Authorization: `Bearer ${key}` },
    )) as {
      data?: Array<{ start_time?: number; results?: Array<{ amount?: { value?: unknown; currency?: unknown } }> }>;
    };

    const dayStartSec = Math.floor(startOfDayUtc(now).getTime() / 1000);
    for (const bucket of json.data ?? []) {
      for (const r of bucket.results ?? []) {
        const amount = num(r.amount?.value);
        if (typeof r.amount?.currency === "string") base.currency = r.amount.currency;
        base.monthToDate += amount;
        if (typeof bucket.start_time === "number" && bucket.start_time >= dayStartSec) base.today += amount;
      }
    }
    return base;
  } catch (err) {
    return { ...base, status: "error", error: err instanceof Error ? err.message : "fetch failed" };
  }
}

interface CostWorkspace {
  id: string;
  anthropicAdminApiKey?: string | null;
  openaiAdminApiKey?: string | null;
  anthropicModel?: string | null;
  openaiModel?: string | null;
}

async function buildSummary(ws: CostWorkspace): Promise<AiCostSummary> {
  const keys = resolveAdminKeys(ws);
  const now = new Date();
  const providers: ProviderCost[] = [];

  providers.push(
    keys.anthropic
      ? await anthropicCost(keys.anthropic, now, ws.anthropicModel ?? "Claude")
      : {
          provider: "ANTHROPIC",
          status: "not_configured",
          today: 0,
          monthToDate: 0,
          currency: "USD",
          modelLabel: ws.anthropicModel ?? "Claude",
        },
  );

  // Only surface OpenAI when an OpenAI admin key exists (most workspaces are Anthropic-only).
  if (keys.openai) {
    providers.push(await openaiCost(keys.openai, now, ws.openaiModel ?? "OpenAI"));
  }

  return {
    providers,
    configured: Boolean(keys.anthropic || keys.openai),
    fetchedAt: now.toISOString(),
  };
}

/**
 * Cached AI cost summary for the workspace. Returns the cached snapshot when it's < 1h old,
 * otherwise fetches fresh from the provider Cost APIs and re-caches. Stale cache is returned
 * if a refresh fails, so the card always has something to show.
 */
export async function getAiCostSummary(ws: CostWorkspace): Promise<AiCostSummary> {
  const cached = await prisma.aiResponseCache.findUnique({
    where: { workspaceId_cacheKey: { workspaceId: ws.id, cacheKey: CACHE_KEY } },
  });

  if (cached?.response) {
    const snapshot = cached.response as unknown as AiCostSummary;
    const age = Date.now() - new Date(snapshot.fetchedAt).getTime();
    if (Number.isFinite(age) && age < CACHE_TTL_MS) return snapshot;
  }

  let summary: AiCostSummary;
  try {
    summary = await buildSummary(ws);
  } catch {
    // Total failure — fall back to stale cache or an empty not-configured summary.
    if (cached?.response) return cached.response as unknown as AiCostSummary;
    return { providers: [], configured: false, fetchedAt: new Date().toISOString() };
  }

  await prisma.aiResponseCache.upsert({
    where: { workspaceId_cacheKey: { workspaceId: ws.id, cacheKey: CACHE_KEY } },
    update: { response: summary as unknown as Prisma.InputJsonValue, inputsHash: summary.fetchedAt },
    create: {
      workspaceId: ws.id,
      cacheKey: CACHE_KEY,
      inputsHash: summary.fetchedAt,
      response: summary as unknown as Prisma.InputJsonValue,
    },
  });

  return summary;
}
