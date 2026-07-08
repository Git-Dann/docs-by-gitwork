/**
 * Shared AI-provider resolution + completion.
 *
 * The same provider-resolution block (ANTHROPIC / OPENAI / GEMINI / LOCAL → apiKey + model +
 * baseUrl) was copy-pasted across several routes (meeting-summary, slack-activity). New code
 * (Scribe) uses this helper instead. Existing routes can be migrated to it incrementally.
 *
 * Env vars take precedence over workspace-stored keys, matching the existing convention.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface WorkspaceAiFields {
  aiProvider: string;
  anthropicApiKey: string | null;
  anthropicModel: string | null;
  openaiApiKey: string | null;
  openaiModel: string | null;
  geminiApiKey: string | null;
  geminiModel: string | null;
  localLlmUrl: string | null;
  localLlmModel: string | null;
}

export type AiProvider = "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";

export interface ResolvedAiConfig {
  provider: AiProvider;
  apiKey: string | null;
  model: string;
  baseUrl: string | null;
}

/**
 * Current-generation default model per provider — the single source of truth for
 * fallback models when a workspace hasn't pinned its own. Every resolver (here,
 * study.ts, pulse agents, route handlers) must read from this, never inline a literal.
 * Within-tier generation is cost-neutral (Sonnet 5 = Sonnet 4.6 pricing, etc.).
 */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  ANTHROPIC: "claude-sonnet-5",
  OPENAI: "gpt-4o",
  GEMINI: "gemini-2.0-flash",
  LOCAL: "llama3.1",
};

/** Resolve the active provider, API key, model and (OpenAI-compatible) base URL. */
export function resolveAiConfig(ws: WorkspaceAiFields): ResolvedAiConfig {
  const provider = (ws.aiProvider || "ANTHROPIC") as AiProvider;

  if (provider === "OPENAI") {
    return {
      provider,
      apiKey: process.env.OPENAI_API_KEY ?? ws.openaiApiKey ?? null,
      model: ws.openaiModel ?? DEFAULT_MODELS.OPENAI,
      baseUrl: null,
    };
  }
  if (provider === "GEMINI") {
    return {
      provider,
      apiKey: process.env.GEMINI_API_KEY ?? ws.geminiApiKey ?? null,
      model: ws.geminiModel ?? DEFAULT_MODELS.GEMINI,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    };
  }
  if (provider === "LOCAL") {
    return {
      provider,
      apiKey: ws.openaiApiKey ?? "local",
      model: ws.localLlmModel ?? DEFAULT_MODELS.LOCAL,
      baseUrl: ws.localLlmUrl ?? "http://localhost:11434/v1",
    };
  }
  return {
    provider: "ANTHROPIC",
    apiKey: process.env.ANTHROPIC_API_KEY ?? ws.anthropicApiKey ?? null,
    model: ws.anthropicModel ?? DEFAULT_MODELS.ANTHROPIC,
    baseUrl: null,
  };
}

/**
 * Cheaper models used when tier="light". Routes to Haiku/mini for classification,
 * short summaries, and tagging tasks that don't need full Sonnet quality.
 * ~3.75× cheaper than Sonnet on both input and output.
 */
const LIGHT_MODELS: Partial<Record<AiProvider, string>> = {
  ANTHROPIC: "claude-haiku-4-5",
  OPENAI: "gpt-4o-mini",
  // GEMINI: gemini-2.0-flash is already the cheapest tier — no change needed
  // LOCAL: no cost either way — keep workspace model
};

/**
 * The cheaper model for a provider, or `standardModel` when the provider has no light tier
 * (Gemini/Local). For routes that build their own provider client instead of using
 * `completeText` but still want light-tier pricing on short/simple output.
 */
export function lightModelFor(provider: AiProvider, standardModel: string): string {
  return LIGHT_MODELS[provider] ?? standardModel;
}

export interface CompleteArgs {
  config: ResolvedAiConfig;
  system: string;
  user: string;
  maxTokens?: number;
  /**
   * "light" routes to a cheaper model (Haiku / gpt-4o-mini) for tasks where
   * classification quality or short-form output doesn't need full Sonnet.
   * Defaults to "standard" (workspace-configured model).
   */
  tier?: "light" | "standard";
}

/**
 * Run a single completion and return the assistant's text. Throws if no API key is configured
 * so callers can surface a clear "configure AI in Settings" error.
 *
 * Anthropic calls always mark the system prompt with cache_control so repeated calls with the
 * same system (triage bursts, agentic loops, cached-response misses) benefit from prompt caching
 * at $0.30/MTok reads vs $3.00/MTok regular input.
 */
export async function completeText({ config, system, user, maxTokens = 1024, tier = "standard" }: CompleteArgs): Promise<string> {
  if (!config.apiKey) {
    throw new Error("No AI API key configured. Add one in Settings → Integrations.");
  }

  const model = (tier === "light" && LIGHT_MODELS[config.provider]) ? LIGHT_MODELS[config.provider]! : config.model;

  if (config.provider === "ANTHROPIC") {
    const client = new Anthropic({ apiKey: config.apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: [{ type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } }],
      messages: [{ role: "user", content: user }],
    });
    // Current models return HTTP 200 with stop_reason "refusal" (empty/partial content) when a
    // safety classifier declines — surface it rather than returning silent empty text.
    if (res.stop_reason === "refusal") {
      throw new Error("AI request was declined by a safety classifier (stop_reason: refusal).");
    }
    const block = res.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text.trim() : "";
  }

  const openai = new OpenAI({ apiKey: config.apiKey, ...(config.baseUrl ? { baseURL: config.baseUrl } : {}) });
  const res = await openai.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? "";
}

/** Best-effort extraction of a JSON object from a model response (handles ```json fences). */
export function parseJsonObject<T>(raw: string): T | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
