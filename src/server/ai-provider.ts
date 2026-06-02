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

/** Resolve the active provider, API key, model and (OpenAI-compatible) base URL. */
export function resolveAiConfig(ws: WorkspaceAiFields): ResolvedAiConfig {
  const provider = (ws.aiProvider || "ANTHROPIC") as AiProvider;

  if (provider === "OPENAI") {
    return {
      provider,
      apiKey: process.env.OPENAI_API_KEY ?? ws.openaiApiKey ?? null,
      model: ws.openaiModel ?? "gpt-4o",
      baseUrl: null,
    };
  }
  if (provider === "GEMINI") {
    return {
      provider,
      apiKey: process.env.GEMINI_API_KEY ?? ws.geminiApiKey ?? null,
      model: ws.geminiModel ?? "gemini-2.0-flash",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    };
  }
  if (provider === "LOCAL") {
    return {
      provider,
      apiKey: ws.openaiApiKey ?? "local",
      model: ws.localLlmModel ?? "llama3.1",
      baseUrl: ws.localLlmUrl ?? "http://localhost:11434/v1",
    };
  }
  return {
    provider: "ANTHROPIC",
    apiKey: process.env.ANTHROPIC_API_KEY ?? ws.anthropicApiKey ?? null,
    model: ws.anthropicModel ?? "claude-sonnet-4-6",
    baseUrl: null,
  };
}

export interface CompleteArgs {
  config: ResolvedAiConfig;
  system: string;
  user: string;
  maxTokens?: number;
}

/**
 * Run a single completion and return the assistant's text. Throws if no API key is configured
 * so callers can surface a clear "configure AI in Settings" error.
 */
export async function completeText({ config, system, user, maxTokens = 1024 }: CompleteArgs): Promise<string> {
  if (!config.apiKey) {
    throw new Error("No AI API key configured. Add one in Settings → Integrations.");
  }

  if (config.provider === "ANTHROPIC") {
    const client = new Anthropic({ apiKey: config.apiKey });
    const res = await client.messages.create({
      model: config.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = res.content[0];
    return block && block.type === "text" ? block.text.trim() : "";
  }

  const openai = new OpenAI({ apiKey: config.apiKey, ...(config.baseUrl ? { baseURL: config.baseUrl } : {}) });
  const res = await openai.chat.completions.create({
    model: config.model,
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
