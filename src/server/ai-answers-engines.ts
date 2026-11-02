import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AI_ANSWER_LIMITS, type AiEngineId, type AnswerSource } from "@/lib/ai-answers";
import type { TokenUsage } from "@/server/ai-pricing";

/**
 * Asking one buyer question of one AI engine, with that engine's own web search on and a UK
 * location, and returning what it said and which sources it cited.
 *
 * Only CITED sources are returned — pages the engine put its name to — never every page its
 * search happened to look at, or a page it read and didn't use would count as "cites us".
 * Each engine is read the way its API documents it; nothing is parsed out of prose except the
 * links an answer writes inline, which `judgeAnswer` reads from the text itself.
 */

export interface EngineAnswer {
  status: "ok" | "refused";
  text: string;
  sources: AnswerSource[];
  usage: TokenUsage;
}

export interface AskArgs {
  question: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

/** One answer can't take the run hostage. */
export const ASK_TIMEOUT_MS = 120_000;

const ZERO: TokenUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };

function dedupe(sources: AnswerSource[]): AnswerSource[] {
  const seen = new Set<string>();
  const out: AnswerSource[] = [];
  for (const s of sources) {
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
    if (out.length >= AI_ANSWER_LIMITS.maxCitations) break;
  }
  return out;
}

/** An HTTP failure with the provider's own words, so the page can say what went wrong. */
export class EngineHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<EngineHttpError> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; message?: string };
    detail = typeof body.error === "string" ? body.error : (body.error?.message ?? body.message ?? "");
  } catch {
    // not JSON
  }
  return new EngineHttpError(res.status, `HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
}

// ─── Claude ──────────────────────────────────────────────────────────────────

async function askClaude({ question, apiKey, model, signal }: AskArgs): Promise<EngineAnswer> {
  const client = new Anthropic({ apiKey, timeout: ASK_TIMEOUT_MS, maxRetries: 1 });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  let text = "";
  const sources: AnswerSource[] = [];
  const usage = { ...ZERO, cacheWriteTokens: 0 };
  // A server tool loop can pause; continuing it is the documented way to let it finish.
  for (let turn = 0; turn < 3; turn += 1) {
    const res = await client.messages.create(
      {
        model,
        max_tokens: 8000,
        messages,
        tools: [
          {
            type: "web_search_20260209",
            name: "web_search",
            max_uses: 5,
            user_location: { type: "approximate", country: "GB", timezone: "Europe/London" },
          },
        ],
      },
      { signal },
    );
    usage.inputTokens += res.usage.input_tokens ?? 0;
    usage.outputTokens += res.usage.output_tokens ?? 0;
    usage.cachedInputTokens += res.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += res.usage.cache_creation_input_tokens ?? 0;
    if (res.stop_reason === "refusal") return { status: "refused", text: "", sources: [], usage };
    for (const block of res.content) {
      if (block.type !== "text") continue;
      text += block.text;
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location") sources.push({ url: c.url, title: c.title ?? null });
      }
    }
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  return { status: "ok", text, sources: dedupe(sources), usage };
}

// ─── ChatGPT ─────────────────────────────────────────────────────────────────

async function askChatGpt({ question, apiKey, model, signal }: AskArgs): Promise<EngineAnswer> {
  const client = new OpenAI({ apiKey, timeout: ASK_TIMEOUT_MS, maxRetries: 1 });
  const res = await client.responses.create(
    {
      model,
      input: question,
      tools: [{ type: "web_search", user_location: { type: "approximate", country: "GB", timezone: "Europe/London" } }],
    },
    { signal },
  );
  let text = "";
  let refused = false;
  const sources: AnswerSource[] = [];
  for (const item of res.output) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type === "refusal") refused = true;
      if (part.type !== "output_text") continue;
      text += part.text;
      for (const a of part.annotations) {
        if (a.type === "url_citation") sources.push({ url: a.url, title: a.title || null });
      }
    }
  }
  const usage: TokenUsage = {
    inputTokens: res.usage?.input_tokens ?? 0,
    outputTokens: res.usage?.output_tokens ?? 0,
    cachedInputTokens: res.usage?.input_tokens_details?.cached_tokens ?? 0,
  };
  if (refused && !text) return { status: "refused", text: "", sources: [], usage };
  return { status: "ok", text, sources: dedupe(sources), usage };
}

// ─── Perplexity ──────────────────────────────────────────────────────────────

interface PerplexityResponse {
  choices?: Array<{ message?: { content?: string } }>;
  citations?: string[];
  search_results?: Array<{ url?: string; title?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Perplexity's citations, from its structured fields. Exported for the tests. */
export function perplexitySources(body: PerplexityResponse): AnswerSource[] {
  const fromResults = (body.search_results ?? [])
    .filter((r): r is { url: string; title?: string } => typeof r.url === "string")
    .map((r) => ({ url: r.url, title: r.title ?? null }));
  const fromCitations = (body.citations ?? []).filter((u) => typeof u === "string").map((url) => ({ url, title: null }));
  return dedupe([...fromCitations, ...fromResults]);
}

async function askPerplexity({ question, apiKey, model, signal }: AskArgs): Promise<EngineAnswer> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: question }],
      web_search_options: { user_location: { country: "GB" } },
    }),
    signal: signal ?? AbortSignal.timeout(ASK_TIMEOUT_MS),
  });
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as PerplexityResponse;
  return {
    status: "ok",
    text: body.choices?.[0]?.message?.content ?? "",
    sources: perplexitySources(body),
    usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0, cachedInputTokens: 0 },
  };
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Gemini's grounding sources. Their links go through a Google redirect, and the site's domain
 * is in the title — `sourceIsOurs` reads a title that is exactly a domain for that reason.
 */
export function geminiAnswer(body: GeminiResponse): Omit<EngineAnswer, "usage"> {
  const c = body.candidates?.[0];
  if (body.promptFeedback?.blockReason || c?.finishReason === "SAFETY" || c?.finishReason === "PROHIBITED_CONTENT") {
    return { status: "refused", text: "", sources: [] };
  }
  const text = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  const sources = (c?.groundingMetadata?.groundingChunks ?? [])
    .map((g) => g.web)
    .filter((w): w is { uri: string; title?: string } => typeof w?.uri === "string")
    .map((w) => ({ url: w.uri, title: w.title ?? null }));
  return { status: "ok", text, sources: dedupe(sources) };
}

async function askGemini({ question, apiKey, model, signal }: AskArgs): Promise<EngineAnswer> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    // The key goes in a header, never the URL, so it can't end up in a log line.
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: question }] }], tools: [{ google_search: {} }] }),
    signal: signal ?? AbortSignal.timeout(ASK_TIMEOUT_MS),
  });
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as GeminiResponse;
  return {
    ...geminiAnswer(body),
    usage: {
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0,
      cachedInputTokens: 0,
    },
  };
}

export const ASK: Record<AiEngineId, (args: AskArgs) => Promise<EngineAnswer>> = {
  claude: askClaude,
  chatgpt: askChatGpt,
  perplexity: askPerplexity,
  gemini: askGemini,
};

/** Which provider's key and usage label each engine uses. */
export const ENGINE_PROVIDER = {
  claude: "ANTHROPIC",
  chatgpt: "OPENAI",
  perplexity: "PERPLEXITY",
  gemini: "GEMINI",
} as const satisfies Record<AiEngineId, string>;
