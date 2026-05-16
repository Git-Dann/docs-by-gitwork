import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

export const dynamic = "force-dynamic";

export interface ModelOption {
  id: string;
  name: string;
}

async function fetchAnthropicModels(apiKey: string): Promise<ModelOption[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
  const data = (await res.json()) as { data: { id: string; display_name?: string }[] };
  return (data.data ?? [])
    .filter((m) => m.id.startsWith("claude"))
    .map((m) => ({ id: m.id, name: m.display_name ?? m.id }));
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelOption[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}`);
  const data = (await res.json()) as { data: { id: string }[] };
  const CHAT_PREFIXES = ["gpt-4", "gpt-3.5", "o1", "o3", "o4"];
  return (data.data ?? [])
    .filter((m) => CHAT_PREFIXES.some((prefix) => m.id.startsWith(prefix)))
    .sort((a, b) => b.id.localeCompare(a.id))
    .map((m) => ({ id: m.id, name: m.id }));
}

async function fetchGeminiModels(apiKey: string): Promise<ModelOption[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) throw new Error(`Gemini API error ${res.status}`);
  const data = (await res.json()) as {
    models: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
  };
  return (data.models ?? [])
    .filter(
      (m) =>
        (m.supportedGenerationMethods ?? []).includes("generateContent") &&
        m.name.includes("gemini"),
    )
    .map((m) => ({
      id: m.name.replace(/^models\//, ""),
      name: m.displayName ?? m.name.replace(/^models\//, ""),
    }))
    .sort((a, b) => b.id.localeCompare(a.id));
}

async function fetchLocalModels(baseUrl: string, apiKey: string | null): Promise<ModelOption[]> {
  const normalised = baseUrl.replace(/\/+$/, "");
  // Try OpenAI-compatible /v1/models first, then Ollama /api/tags
  const endpoints = [`${normalised}/models`, `${normalised.replace(/\/v1$/, "")}/api/tags`];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        data?: { id: string }[];
        models?: { name: string }[];
      };
      if (data.data) {
        return (data.data ?? []).map((m) => ({ id: m.id, name: m.id }));
      }
      if (data.models) {
        return (data.models ?? []).map((m) => ({ id: m.name, name: m.name }));
      }
    } catch {
      // try next endpoint
    }
  }
  throw new Error("Could not reach local LLM server");
}

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider") as
    | "ANTHROPIC"
    | "OPENAI"
    | "GEMINI"
    | "LOCAL"
    | null;

  if (!provider || !["ANTHROPIC", "OPENAI", "GEMINI", "LOCAL"].includes(provider)) {
    return apiError("provider query param required (ANTHROPIC|OPENAI|GEMINI|LOCAL)", 400);
  }

  try {
    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: { anthropicApiKey: true, openaiApiKey: true, geminiApiKey: true, localLlmUrl: true, localLlmModel: true },
    });

    let models: ModelOption[];

    if (provider === "ANTHROPIC") {
      const key = process.env.ANTHROPIC_API_KEY ?? workspace?.anthropicApiKey ?? null;
      if (!key) return apiError("No Claude API key configured", 400);
      models = await fetchAnthropicModels(key);
    } else if (provider === "OPENAI") {
      const key = process.env.OPENAI_API_KEY ?? workspace?.openaiApiKey ?? null;
      if (!key) return apiError("No OpenAI API key configured", 400);
      models = await fetchOpenAIModels(key);
    } else if (provider === "GEMINI") {
      const key = process.env.GEMINI_API_KEY ?? workspace?.geminiApiKey ?? null;
      if (!key) return apiError("No Gemini API key configured", 400);
      models = await fetchGeminiModels(key);
    } else {
      const baseUrl = workspace?.localLlmUrl ?? "http://localhost:11434/v1";
      if (!baseUrl) return apiError("No local LLM URL configured", 400);
      models = await fetchLocalModels(baseUrl, null);
    }

    return apiOk({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch models";
    return apiError(message, 502);
  }
}
