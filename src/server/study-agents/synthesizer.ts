import Anthropic from "@anthropic-ai/sdk";
import type { TurnSynthesis, SessionSynthesis, StudyReportPayload, StudyTurn } from "./types";
import type { StudyPersonaDef } from "@/config/study-personas";

function makeClient(apiKey: string) {
  return new Anthropic({ apiKey });
}

function parseJson<T>(raw: string): T {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonStr = match ? match[1] : raw;
  return JSON.parse(jsonStr.trim()) as T;
}

async function callClaude(client: Anthropic, system: string, user: string): Promise<string> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = msg.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text in Claude response");
  return block.text;
}

export async function synthesizeTurn(
  questionText: string,
  responses: Array<{ personaId: string; personaName: string; spoken: string; sentiment: string; painPoints: string[]; delights: string[]; confusionPoints: string[] }>,
  apiKey: string,
): Promise<TurnSynthesis> {
  const client = makeClient(apiKey);

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

  const raw = await callClaude(client, system, user);
  try {
    return parseJson<TurnSynthesis>(raw);
  } catch {
    return { summary: "Synthesis unavailable", keyInsights: [], sentimentDistribution: {}, commonPainPoints: [], commonDelights: [] };
  }
}

export async function synthesizeSession(
  persona: StudyPersonaDef,
  turns: StudyTurn[],
  apiKey: string,
): Promise<SessionSynthesis> {
  const client = makeClient(apiKey);

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

  const raw = await callClaude(client, system, user);
  try {
    return parseJson<SessionSynthesis>(raw);
  } catch {
    return { personaId: persona.id, personaName: persona.name, overallSentiment: "neutral", keyThemes: [], topPainPoints: [], topDelights: [], notableQuotes: [], summary: "Synthesis unavailable." };
  }
}

export async function generateReport(
  study: { title: string; problemStatement: string; researchGoals: string[] },
  sessionSummaries: SessionSynthesis[],
  apiKey: string,
): Promise<StudyReportPayload> {
  const client = makeClient(apiKey);

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

  const raw = await callClaude(client, system, user);
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
