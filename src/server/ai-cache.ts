/**
 * Workspace-shared AI response cache.
 *
 * Use whenever a Foundry endpoint calls an AI provider for output that's identical
 * regardless of which Gitwork teammate is asking — i.e. workspace-scoped data, not
 * personal data. First caller pays the AI tokens; every other teammate gets the cached
 * version instantly.
 *
 * `cacheKey` should be a stable namespace + resource id, e.g.:
 *   "slack-activity:C0123ABCDEF"
 *   "proof-analyse:<sha256-of-brief>"
 *   "pulse-summary:<scanId>"
 *
 * `inputsHash` is a short fingerprint of the inputs that materially change the AI
 * output. Cache entries with a different hash are treated as stale and overwritten.
 */

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface CachedAiResponse<T> {
  response: T;
  cached: true;
  cachedAt: string;
  modelUsed: string | null;
}

export interface FreshAiResponse<T> {
  response: T;
  cached: false;
  cachedAt: null;
  modelUsed: string | null;
}

export type AiCacheResult<T> = CachedAiResponse<T> | FreshAiResponse<T>;

/**
 * Stable short hash of arbitrary inputs. Lifts the boilerplate from each call site —
 * pass any JSON-stringifiable value and get a hex string back. Internally sorts object
 * keys so `{a:1,b:2}` and `{b:2,a:1}` produce the same hash.
 */
export function hashInputs(input: unknown): string {
  const json = stableStringify(input);
  return createHash("sha256").update(json).digest("hex").slice(0, 32);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export interface CacheLookupParams {
  workspaceId: string;
  cacheKey: string;
  inputsHash: string;
}

export async function getCachedAiResponse<T>(
  params: CacheLookupParams,
): Promise<CachedAiResponse<T> | null> {
  const hit = await prisma.aiResponseCache.findUnique({
    where: { workspaceId_cacheKey: { workspaceId: params.workspaceId, cacheKey: params.cacheKey } },
    select: { response: true, inputsHash: true, modelUsed: true, updatedAt: true },
  });
  if (!hit || hit.inputsHash !== params.inputsHash) return null;
  return {
    response: hit.response as T,
    cached: true,
    cachedAt: hit.updatedAt.toISOString(),
    modelUsed: hit.modelUsed,
  };
}

export interface CacheWriteParams<T> extends CacheLookupParams {
  response: T;
  modelUsed?: string | null;
}

export async function setCachedAiResponse<T>(params: CacheWriteParams<T>): Promise<void> {
  // Non-throwing on purpose — a cache miss on write should never break the user request.
  try {
    await prisma.aiResponseCache.upsert({
      where: { workspaceId_cacheKey: { workspaceId: params.workspaceId, cacheKey: params.cacheKey } },
      create: {
        workspaceId: params.workspaceId,
        cacheKey: params.cacheKey,
        inputsHash: params.inputsHash,
        response: params.response as unknown as Prisma.InputJsonValue,
        modelUsed: params.modelUsed ?? null,
      },
      update: {
        inputsHash: params.inputsHash,
        response: params.response as unknown as Prisma.InputJsonValue,
        modelUsed: params.modelUsed ?? null,
      },
    });
  } catch (err) {
    console.error("[ai-cache] write failed", { cacheKey: params.cacheKey, err });
  }
}

/**
 * Convenience wrapper: cache-or-compute. Pass a function that generates the AI response
 * if the cache misses; this handles the lookup, the call-through, and the cache write.
 *
 * Returns `cached: true` on cache hits, `cached: false` on freshly-generated responses.
 *
 * When `canCompute` is false (a viewer who lacks the `ai.generate` gate), a cache miss
 * returns `null` instead of paying for a fresh call — the caller serves an empty/pending
 * response. Cache HITS are always returned regardless, so viewers still see AI output an
 * admin already generated.
 */
export async function cachedOrCompute<T>(
  params: CacheLookupParams & {
    /** Set true to bypass the cache and force a regenerate. */
    force?: boolean;
    /** Default true. When false, a cache miss returns null rather than computing. */
    canCompute?: boolean;
    compute: () => Promise<{ response: T; modelUsed?: string | null }>;
  },
): Promise<AiCacheResult<T> | null> {
  if (!params.force) {
    const cached = await getCachedAiResponse<T>(params);
    if (cached) return cached;
  }

  // Viewer without the AI-generation gate and no cache hit → don't spend tokens.
  if (params.canCompute === false) return null;

  const fresh = await params.compute();
  await setCachedAiResponse({
    workspaceId: params.workspaceId,
    cacheKey: params.cacheKey,
    inputsHash: params.inputsHash,
    response: fresh.response,
    modelUsed: fresh.modelUsed,
  });

  return {
    response: fresh.response,
    cached: false,
    cachedAt: null,
    modelUsed: fresh.modelUsed ?? null,
  };
}
