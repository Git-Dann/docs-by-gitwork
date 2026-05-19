import Anthropic from "@anthropic-ai/sdk";
import type { PersonaInterviewResponse } from "./types";
import type { StudyPersonaDef } from "@/config/study-personas";

function makeClient(apiKey: string) {
  return new Anthropic({ apiKey });
}

function parseJson<T>(raw: string): T {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  const jsonStr = match ? match[1] : raw;
  return JSON.parse(jsonStr.trim()) as T;
}

export async function conductInterview(
  persona: StudyPersonaDef,
  study: { title: string; problemStatement: string; researchGoals: string[] },
  question: string,
  sessionHistory: Array<{ question: string; answer: string }>,
  apiKey: string,
): Promise<PersonaInterviewResponse> {
  const client = new Anthropic({ apiKey });

  const system = `You are ${persona.name}. ${persona.description}

Demographics: ${persona.demographics.age} years old, ${persona.demographics.occupation}, based in ${persona.demographics.location}.
Tech comfort: ${persona.techComfort}.
Communication style: ${persona.communicationStyle}.

Goals:
${persona.goals.map((g) => `- ${g}`).join("\n")}

Pain points:
${persona.painPoints.map((p) => `- ${p}`).join("\n")}

Behavioural traits:
${persona.behaviouralTraits.map((t) => `- ${t}`).join("\n")}

${persona.systemPromptFragment}

You are being interviewed about: "${study.title}"
Problem being researched: ${study.problemStatement}

Stay fully in character. Speak as this person — same vocabulary, tone, and biases.
React as a real user, not a designer or researcher. Be honest and concrete.
Use examples from your daily life when relevant.

Output JSON only:
{
  "spoken": "your natural spoken response (2–5 sentences)",
  "sentiment": "positive" | "neutral" | "negative" | "frustrated" | "confused" | "delighted",
  "painPoints": ["specific pain points raised"],
  "delights": ["specific things that pleased you"],
  "confusionPoints": ["things that confused you"]
}`;

  const historyContext = sessionHistory.length > 0
    ? `\nPrevious exchanges in this session:\n${sessionHistory.map((h) => `Q: ${h.question}\nYou said: ${h.answer}`).join("\n\n")}\n\n`
    : "";

  const user = `${historyContext}Now answer this question as ${persona.name}:
${question}`;

  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
  });

  const block = msg.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text in Claude response");

  try {
    return parseJson<PersonaInterviewResponse>(block.text);
  } catch {
    return {
      spoken: block.text.slice(0, 500),
      sentiment: "neutral",
      painPoints: [],
      delights: [],
      confusionPoints: [],
    };
  }
}
