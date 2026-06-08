import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/** Minimal workspace AI config the agents need — a structural subset of both
 *  the sync `SyncContext` and the old `AgentContext`, so either can be passed. */
export interface AiWorkspaceConfig {
  aiProvider: string;
  anthropicApiKey?: string | null;
  anthropicModel?: string | null;
  openaiApiKey?: string | null;
  openaiModel?: string | null;
  geminiApiKey?: string | null;
  geminiModel?: string | null;
  localLlmUrl?: string | null;
  localLlmModel?: string | null;
}

export interface AiContext {
  workspace: AiWorkspaceConfig;
}

export async function callAI(
  ctx: AiContext,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 2048,
): Promise<string> {
  const { workspace } = ctx;
  const provider = workspace.aiProvider as "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";

  let apiKey: string | null;
  let model: string;
  let baseUrl: string | null = null;

  if (provider === "OPENAI") {
    apiKey = process.env.OPENAI_API_KEY ?? workspace.openaiApiKey ?? null;
    model = workspace.openaiModel ?? "gpt-4o";
  } else if (provider === "GEMINI") {
    apiKey = process.env.GEMINI_API_KEY ?? workspace.geminiApiKey ?? null;
    model = workspace.geminiModel ?? "gemini-2.0-flash";
    baseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
  } else if (provider === "LOCAL") {
    apiKey = workspace.openaiApiKey ?? "local";
    model = workspace.localLlmModel ?? "llama3.1";
    baseUrl = workspace.localLlmUrl ?? "http://localhost:11434/v1";
  } else {
    apiKey = process.env.ANTHROPIC_API_KEY ?? workspace.anthropicApiKey ?? null;
    model = workspace.anthropicModel ?? "claude-sonnet-4-6";
  }

  if (!apiKey) throw new Error("No AI API key configured. Add one in Settings → Integrations.");

  if (provider === "ANTHROPIC") {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = response.content[0];
    return block.type === "text" ? block.text : "";
  } else {
    const openai = new OpenAI({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });
    const response = await openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return response.choices[0]?.message?.content ?? "";
  }
}

export function extractJson<T>(text: string, fallback: T): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return fallback;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return fallback;
  }
}
