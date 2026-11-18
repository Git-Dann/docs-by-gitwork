/**
 * The Portal's Slack digest (GET /api/clients/[slug]/slack-activity): when to reuse the cached
 * summary, when to write a new one, and what to say when there isn't one.
 *
 * Wedge, Nov 2026: one failed AI call (the provider key was out of credit) was cached as
 * `{ summary: null }` against the channel's message ids, so the card said "Digest will appear
 * after the first messages are posted" over a channel full of messages, until someone posted
 * again. The rules here:
 *
 * 1. Only a real summary is ever cached. A failure is reported, not stored, so the next view
 *    tries again.
 * 2. A cached empty summary (written before this fix) counts as a miss.
 * 3. Every "no digest" says why, in words the reader can act on. Never the provider's raw text.
 */

import { describeAiError } from "@/lib/ai-error-words";

export type SlackDigestReason =
  /** A digest, fresh or cached. */
  | "ok"
  /** No digest yet, and this viewer can't spend tokens writing one. */
  | "stale"
  /** No AI provider key is set up for the workspace. */
  | "no_ai_key"
  /** The provider was asked and failed. `aiError` says how. */
  | "ai_failed";

export type SlackDigestOutcome = {
  summary: string | null;
  generatedAt: string | null;
  cached: boolean;
  reason: SlackDigestReason;
  /** Plain words for an `ai_failed`, from describeAiError. Null otherwise. */
  aiError: string | null;
};

/** What a summariser call produced. */
export type SummariseResult = { kind: "ok"; text: string } | { kind: "no_ai_key" } | { kind: "failed"; error: string };

export type DigestCacheHit = { response: { summary: string | null }; cachedAt: string } | null;

function hasText(s: string | null | undefined): s is string {
  return typeof s === "string" && s.trim().length > 0;
}

/** describeAiError speaks about "the AI write-up"; here it's the Slack digest. */
export function describeDigestError(raw: string | null | undefined): string {
  return describeAiError(raw).replace(/the AI write-up/g, "the Slack digest");
}

/**
 * Decide the digest. `readCache` and `writeCache` touch the AI cache; `summarise` calls the
 * provider. Injected so the rules can be tested without a database or a model.
 */
export async function resolveSlackDigest(input: {
  canCompute: boolean;
  /** "Try again": skip the cache and ask again (only when the viewer may compute). */
  force: boolean;
  readCache: () => Promise<DigestCacheHit>;
  writeCache: (summary: string) => Promise<void>;
  summarise: () => Promise<SummariseResult>;
}): Promise<SlackDigestOutcome> {
  const force = input.force && input.canCompute;
  if (!force) {
    const hit = await input.readCache();
    // Rule 2: an empty cached summary is a failure from before this fix. Ignore it.
    if (hit && hasText(hit.response.summary)) {
      return { summary: hit.response.summary, generatedAt: hit.cachedAt, cached: true, reason: "ok", aiError: null };
    }
  }

  if (!input.canCompute) {
    return { summary: null, generatedAt: null, cached: false, reason: "stale", aiError: null };
  }

  let result: SummariseResult;
  try {
    result = await input.summarise();
  } catch (err) {
    result = { kind: "failed", error: err instanceof Error ? err.message : String(err) };
  }

  if (result.kind === "no_ai_key") {
    return { summary: null, generatedAt: null, cached: false, reason: "no_ai_key", aiError: null };
  }
  if (result.kind === "failed" || !hasText(result.text)) {
    // Rule 1: never cached, so the next view retries.
    const raw = result.kind === "failed" ? result.error : "empty response";
    return { summary: null, generatedAt: null, cached: false, reason: "ai_failed", aiError: describeDigestError(raw) };
  }

  await input.writeCache(result.text);
  return { summary: result.text, generatedAt: new Date().toISOString(), cached: false, reason: "ok", aiError: null };
}
