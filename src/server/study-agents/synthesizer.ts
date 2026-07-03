import Anthropic from "@anthropic-ai/sdk";
import type { TurnSynthesis, SessionSynthesis, StudyReportPayload, StudyTurn } from "./types";
import type { StudyPersonaDef } from "@/config/study-personas";
import type { AiConfig } from "@/server/pulse-ai";

async function callAI(config: AiConfig, system: string, user: string, maxTokens = 2048): Promise<string> {
  if (config.provider === "ANTHROPIC") {
    const client = new Anthropic({ apiKey: config.apiKey ?? undefined });
    const msg = await client.messages.create({
      model: config.model,
      max_tokens: maxTokens,
      // Synthesis instructions are a stable prefix reused across every turn/session in a run.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    });
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
  const completion = await client.chat.completions.create({
    model: config.model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

function parseJson<T>(raw: string): T {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonStr = match ? match[1] : raw;
  return JSON.parse(jsonStr.trim()) as T;
}

export async function synthesizeTurn(
  questionText: string,
  responses: Array<{ personaId: string; personaName: string; spoken: string; sentiment: string; painPoints: string[]; delights: string[]; confusionPoints: string[] }>,
  config: AiConfig,
): Promise<TurnSynthesis> {
  const system = `You are a user-research synthesiser writing a tight summary of a single interview question.
Produce structured JSON only:
{
  "summary": "1–2 sentence summary of what was learned",
  "keyInsights": ["up to 5 key insights, each attributed to a persona"],
  "sentimentDistribution": { "positive": 0, "neutral": 0, "negative": 0, "frustrated": 0, "confused": 0, "delighted": 0 },
  "commonPainPoints": ["pain points mentioned by multiple personas"],
  "commonDelights": ["delights mentioned by multiple personas"]
}`;

  const responsesBlock = responses
    .map((r) => `**${r.personaName}** (${r.sentiment})\n"${r.spoken}"\nPain points: ${r.painPoints.join(", ") || "none"}\nDelights: ${r.delights.join(", ") || "none"}`)
    .join("\n\n");

  const user = `Question: ${questionText}\n\nResponses:\n${responsesBlock}`;

  const raw = await callAI(config, system, user);
  try {
    return parseJson<TurnSynthesis>(raw);
  } catch {
    return { summary: "Synthesis unavailable", keyInsights: [], sentimentDistribution: {}, commonPainPoints: [], commonDelights: [] };
  }
}

export async function synthesizeSession(
  persona: StudyPersonaDef,
  turns: StudyTurn[],
  config: AiConfig,
): Promise<SessionSynthesis> {
  const system = `You are a user-research synthesiser writing a session summary for one participant.
Output JSON only:
{
  "personaId": string,
  "personaName": string,
  "overallSentiment": "positive" | "neutral" | "negative" | "mixed",
  "keyThemes": ["up to 5 recurring themes"],
  "topPainPoints": ["top 3 pain points from this session"],
  "topDelights": ["top 3 delights from this session"],
  "notableQuotes": ["2–4 direct quotes from the participant"],
  "summary": "2–3 sentence narrative of how this participant experienced the topic"
}`;

  const turnsBlock = turns
    .map((t) => {
      const mainExchanges = t.exchanges.map((e) => `  Q: ${e.question}\n  A: "${e.response.spoken}"`).join("\n");
      return `Question: ${t.questionText}\n${mainExchanges}`;
    })
    .join("\n\n");

  const user = `Participant: ${persona.name} — ${persona.description}\n\nSession transcript:\n${turnsBlock}`;

  const raw = await callAI(config, system, user);
  try {
    return parseJson<SessionSynthesis>(raw);
  } catch {
    return { personaId: persona.id, personaName: persona.name, overallSentiment: "neutral", keyThemes: [], topPainPoints: [], topDelights: [], notableQuotes: [], summary: "Synthesis unavailable." };
  }
}

export async function generateReport(
  study: { title: string; problemStatement: string; researchGoals: string[] },
  sessionSummaries: SessionSynthesis[],
  config: AiConfig,
): Promise<StudyReportPayload> {
  const system = `You are a senior user researcher writing the final research report.
Output JSON only with this exact shape:
{
  "executiveSummary": "3–5 sentence headline answer to the research goals",
  "keyFindings": ["5–7 specific findings"],
  "themes": [{ "theme": string, "description": string, "personaIds": string[] }],
  "perPersonaFindings": [{ "personaId": string, "personaName": string, "summary": string, "topInsights": string[] }],
  "recommendations": [{ "title": string, "rationale": string, "priority": "HIGH" | "MEDIUM" | "LOW" }],
  "openQuestions": ["what this study did not answer"]
}
Note: these are simulated AI personas, not real users. Be honest about that limitation.`;

  const summariesBlock = sessionSummaries
    .map((s) => `**${s.personaName}** (${s.overallSentiment})\n${s.summary}\nKey themes: ${s.keyThemes.join(", ")}\nTop pain points: ${s.topPainPoints.join(", ")}`)
    .join("\n\n");

  const goalList = study.researchGoals.map((g, i) => `${i + 1}. ${g}`).join("\n");

  const user = `Study: ${study.title}
Problem: ${study.problemStatement}
Goals:\n${goalList}

Session summaries:\n${summariesBlock}

Generate the final report.`;

  const raw = await callAI(config, system, user, 4096);
  try {
    return parseJson<StudyReportPayload>(raw);
  } catch {
    return {
      executiveSummary: "Report generation failed.",
      keyFindings: [],
      themes: [],
      perPersonaFindings: [],
      recommendations: [],
      openQuestions: [],
    };
  }
}
