import Anthropic from "@anthropic-ai/sdk";
import type { ResearchPlanOutput, FollowUpsOutput } from "./types";
import type { StudyPersonaDef } from "@/config/study-personas";
import type { AiConfig } from "@/server/pulse-ai";
import { recordAiUsage, usageFromAnthropic, usageFromOpenAI } from "@/server/ai-usage";

async function callAI(config: AiConfig, system: string, user: string, workspaceId?: string, operation?: string): Promise<string> {
  if (config.provider === "ANTHROPIC") {
    const client = new Anthropic({ apiKey: config.apiKey ?? undefined });
    const t0 = Date.now();
    const msg = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
    if (workspaceId) recordAiUsage({ module: "STUDY", workspaceId, operation, provider: "ANTHROPIC", model: config.model, usage: usageFromAnthropic(msg.usage), latencyMs: Date.now() - t0 });
    if (msg.stop_reason === "refusal") throw new Error("AI request declined (stop_reason: refusal).");
    const block = msg.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("No text in Anthropic response");
    return block.text;
  }

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({
    apiKey: config.apiKey ?? "local",
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  });
  const t0 = Date.now();
  const completion = await client.chat.completions.create({
    model: config.model,
    max_tokens: 4096,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  if (workspaceId) recordAiUsage({ module: "STUDY", workspaceId, operation, provider: "OPENAI", model: config.model, usage: usageFromOpenAI(completion.usage), latencyMs: Date.now() - t0 });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

function parseJson<T>(raw: string): T {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  const jsonStr = match ? match[1] : raw;
  return JSON.parse(jsonStr.trim()) as T;
}

export async function generateResearchPlan(
  study: { title: string; problemStatement: string; researchGoals: string[] },
  personas: StudyPersonaDef[],
  config: AiConfig,
  workspaceId?: string,
): Promise<ResearchPlanOutput> {
  const system = `You are an experienced product user researcher drafting a research plan.
Your job is to turn the inputs below into a concrete, runnable plan: a small set of well-formed open questions.
Guidelines:
- Generate 5–8 questions. Quality over quantity.
- Open-ended, neutral, and non-leading. No yes/no questions.
- Order them so early questions warm up and later ones go deeper.
- For each question, suggest which persona IDs it is most useful to ask (use only the IDs provided).
- Briefly explain why each question is in the plan (one sentence rationale).
Output JSON only, with this exact shape:
{ "questions": [{ "text": string, "personaIds": string[], "turnType": "single", "rationale": string }] }`;

  const personaList = personas.map((p) => `- ${p.id}: ${p.name} (${p.description})`).join("\n");
  const goalList = study.researchGoals.map((g, i) => `${i + 1}. ${g}`).join("\n");

  const user = `Study title: ${study.title}
Problem statement: ${study.problemStatement}
Research goals:
${goalList}

Available personas:
${personaList}

Generate the research plan now.`;

  const raw = await callAI(config, system, user, workspaceId, "researcher:plan");
  return parseJson<ResearchPlanOutput>(raw);
}

export async function generateFollowUps(
  question: string,
  personaName: string,
  response: string,
  depth: number,
  alreadyAsked: string[],
  config: AiConfig,
  workspaceId?: string,
): Promise<FollowUpsOutput> {
  if (depth >= 2) return { followUps: [] };

  const system = `You are an experienced user researcher deciding whether to probe further.
Probe only when the answer was vague, contradictory, surprising, or skipped a relevant detail.
If the answer was clear and complete, return zero follow-ups.
Hard cap: depth ${depth} — return at most 1 follow-up at this depth.
NEVER repeat or rephrase a question already asked.
Output JSON only: { "followUps": [{ "question": string, "rationale": string }] }`;

  const alreadyList = alreadyAsked.length > 0
    ? `\nAlready asked:\n${alreadyAsked.map((q) => `- ${q}`).join("\n")}`
    : "";

  const user = `Participant: ${personaName}
Question asked: ${question}
Their answer: ${response}${alreadyList}

Decide on 0 or 1 follow-up question.`;

  const raw = await callAI(config, system, user, workspaceId, "researcher:followups");
  try {
    return parseJson<FollowUpsOutput>(raw);
  } catch {
    return { followUps: [] };
  }
}
