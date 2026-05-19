import Anthropic from "@anthropic-ai/sdk";
import type { ResearchPlanOutput, FollowUpsOutput } from "./types";
import type { StudyPersonaDef } from "@/config/study-personas";

function makeClient(apiKey: string) {
  return new Anthropic({ apiKey });
}

async function callClaude(client: Anthropic, system: string, user: string): Promise<string> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = msg.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text in Claude response");
  return block.text;
}

function parseJson<T>(raw: string): T {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  const jsonStr = match ? match[1] : raw;
  return JSON.parse(jsonStr.trim()) as T;
}

export async function generateResearchPlan(
  study: { title: string; problemStatement: string; researchGoals: string[] },
  personas: StudyPersonaDef[],
  apiKey: string,
): Promise<ResearchPlanOutput> {
  const client = makeClient(apiKey);

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

  const raw = await callClaude(client, system, user);
  return parseJson<ResearchPlanOutput>(raw);
}

export async function generateFollowUps(
  question: string,
  personaName: string,
  response: string,
  depth: number,
  alreadyAsked: string[],
  apiKey: string,
): Promise<FollowUpsOutput> {
  if (depth >= 2) return { followUps: [] };

  const client = makeClient(apiKey);

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

  const raw = await callClaude(client, system, user);
  try {
    return parseJson<FollowUpsOutput>(raw);
  } catch {
    return { followUps: [] };
  }
}
