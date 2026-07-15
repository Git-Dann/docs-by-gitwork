/**
 * Model → price map for estimating per-call AI cost (USD) from token usage.
 *
 * Prices are USD per 1,000,000 tokens. Cache-read ≈ 0.1× input; cache-write (5-minute ephemeral,
 * which this codebase uses via cache_control: ephemeral) = 1.25× input — see the Anthropic pricing
 * + prompt-caching docs. Verified against the claude-api skill's model catalog on 2026-07-15;
 * re-check when adding a model or when intro pricing changes.
 *
 * These figures are LIST prices — the summed per-call cost is an *estimate* for attribution
 * (which module/model/user spent what). The authoritative billed total comes from the provider
 * Cost APIs via `getAiCostSummary` (ai-cost.ts); the analytics UI shows both and never forces
 * them equal.
 *
 * Cache-token asymmetry (critical): Anthropic `input_tokens` EXCLUDES cache reads/writes (separate
 * counters); OpenAI `prompt_tokens` INCLUDES cached tokens. `estimateCostUsd` subtracts
 * `cachedInputTokens` from `inputTokens`, and the extractors in ai-usage.ts normalise so this is
 * correct for both providers.
 */

export interface TokenUsage {
  inputTokens: number; // Anthropic: fresh input (excl. cache). OpenAI: prompt_tokens (incl. cached).
  outputTokens: number;
  cachedInputTokens: number; // billed at the cache-READ rate
  cacheWriteTokens?: number; // billed at the cache-WRITE rate (Anthropic only)
}

interface ModelPrice {
  input: number; // USD per 1M input tokens
  output: number; // USD per 1M output tokens
  cachedInput: number; // USD per 1M cache-READ tokens (~0.1× input)
  cacheWrite?: number; // USD per 1M cache-WRITE tokens (~1.25× input, 5-min TTL)
}

// Keys matched case-insensitively by LONGEST prefix (so "claude-haiku-4-5" beats "claude-haiku").
const PRICES: Record<string, ModelPrice> = {
  // Anthropic — current families ($ per 1M)
  "claude-opus-4": { input: 5.0, output: 25.0, cachedInput: 0.5, cacheWrite: 6.25 },
  "claude-opus": { input: 15.0, output: 75.0, cachedInput: 1.5, cacheWrite: 18.75 }, // 4.1/4.0/3 fallback
  "claude-sonnet": { input: 3.0, output: 15.0, cachedInput: 0.3, cacheWrite: 3.75 }, // Sonnet 5/4.6/4.5
  "claude-haiku": { input: 1.0, output: 5.0, cachedInput: 0.1, cacheWrite: 1.25 }, // Haiku 4.5
  "claude-fable": { input: 10.0, output: 50.0, cachedInput: 1.0, cacheWrite: 12.5 },
  // OpenAI
  "gpt-4o-mini": { input: 0.15, output: 0.6, cachedInput: 0.075 },
  "gpt-4o": { input: 2.5, output: 10.0, cachedInput: 1.25 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cachedInput: 0.1 },
  "gpt-4.1": { input: 2.0, output: 8.0, cachedInput: 0.5 },
  "text-embedding-3-small": { input: 0.02, output: 0, cachedInput: 0.02 },
  "text-embedding-3-large": { input: 0.13, output: 0, cachedInput: 0.13 },
  // Google
  "gemini-2.0-flash": { input: 0.1, output: 0.4, cachedInput: 0.025 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3, cachedInput: 0.01875 },
  "gemini-1.5-pro": { input: 1.25, output: 5.0, cachedInput: 0.3125 },
  // Local / self-hosted — free
  llama: { input: 0, output: 0, cachedInput: 0 },
};

// Unknown models bill at a Sonnet-equivalent rate so cost isn't wildly off.
const FALLBACK: ModelPrice = { input: 3.0, output: 15.0, cachedInput: 0.3, cacheWrite: 3.75 };

const warnedModels = new Set<string>();

function resolvePrice(model: string): ModelPrice {
  const m = model.toLowerCase();
  let best: { key: string; price: ModelPrice } | null = null;
  for (const [key, price] of Object.entries(PRICES)) {
    if (m.startsWith(key) && (best == null || key.length > best.key.length)) {
      best = { key, price };
    }
  }
  if (best) return best.price;
  if (!warnedModels.has(m)) {
    warnedModels.add(m);
    console.warn(`[ai-pricing] no price for model "${model}" — using Sonnet-equivalent fallback`);
  }
  return FALLBACK;
}

/** Estimate the USD cost of one call from its normalised token usage. Rounded to 6dp. */
export function estimateCostUsd(model: string, u: TokenUsage): number {
  const p = resolvePrice(model);
  // Anthropic input_tokens already excludes cached; OpenAI includes it — subtracting handles both.
  const freshInput = Math.max(0, u.inputTokens - u.cachedInputTokens);
  const cost =
    (freshInput * p.input +
      u.cachedInputTokens * p.cachedInput +
      (u.cacheWriteTokens ?? 0) * (p.cacheWrite ?? p.input) +
      u.outputTokens * p.output) /
    1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}
