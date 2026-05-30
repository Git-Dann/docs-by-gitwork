import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureBaseRecords } from "@/server/bootstrap";
import { cachedOrCompute, hashInputs } from "@/server/ai-cache";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  brief: z.string().min(50, "Brief must be at least 50 characters.").max(20000, "Brief must be under 20,000 characters."),
});

const briefKeyContactSchema = z.object({
  name: z.string(),
  role: z.string(),
});

const briefAnalysisSchema = z.object({
  clientName: z.string().nullable(),
  projectTitle: z.string().nullable(),
  overview: z.string().nullable(),
  goals: z.array(z.string()),
  deliverables: z.array(z.string()),
  timeline: z.string().nullable(),
  budget: z.string().nullable(),
  targetAudience: z.string().nullable(),
  technicalRequirements: z.array(z.string()),
  successCriteria: z.array(z.string()),
  keyContacts: z.array(briefKeyContactSchema),
  constraints: z.array(z.string()),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

const SYSTEM_PROMPT = `You are a senior business analyst at a digital consultancy. Your job is to parse client briefs and extract structured, actionable information.

You will receive raw brief text — this could be an email, a document, a Slack message, or any informal communication from a client.

You must respond with ONLY a valid JSON object. No markdown, no explanation, no extra text — just raw JSON.

Extract the following fields:
- clientName: The client company or individual name (null if not mentioned)
- projectTitle: The project or product name (null if not mentioned)
- overview: A 2–3 sentence narrative summary of the project in your own words
- goals: Array of specific business or project goals/objectives (empty array if none found)
- deliverables: Array of concrete deliverables or scope items (empty array if none found)
- timeline: Timeline or deadline summary as a single string (null if not mentioned)
- budget: Budget information as a single string (null if not mentioned)
- targetAudience: Who the product or work is intended for (null if not mentioned)
- technicalRequirements: Array of specific tech stack, platform, or technical constraints (empty array if none found)
- successCriteria: Array of how success will be measured (empty array if none found)
- keyContacts: Array of {name, role} objects for any named people (empty array if none found)
- constraints: Array of limitations, restrictions, or challenges noted (empty array if none found)
- confidence: Your confidence in the extraction quality — "HIGH" if the brief is detailed and clear, "MEDIUM" if some information is vague or missing, "LOW" if the brief is very sparse or unclear`;

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI key is not configured. Add ANTHROPIC_API_KEY to your environment variables to enable brief analysis." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const { brief } = parsed.data;
  const { workspace } = await ensureBaseRecords();
  const MODEL = "claude-opus-4-6";

  // Workspace-cached: if any teammate already analysed this exact brief text, return the
  // cached structured analysis instead of paying for another Opus call. The brief content
  // itself is the cache key (hashed) — same brief = same analysis.
  const inputsHash = hashInputs({ brief, model: MODEL, systemPrompt: SYSTEM_PROMPT });

  try {
    const result = await cachedOrCompute<z.infer<typeof briefAnalysisSchema>>({
      workspaceId: workspace.id,
      cacheKey: `proof-analyse:${inputsHash}`,
      inputsHash,
      compute: async () => {
        const client = new Anthropic({ apiKey });
        const message = await client.messages.create({
          model: MODEL,
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: brief }],
        });
        const block = message.content[0];
        if (!block || block.type !== "text") {
          throw new Error("Unexpected response format from AI.");
        }
        const rawContent = block.text.trim();

        let parsed2: unknown;
        try {
          parsed2 = JSON.parse(rawContent);
        } catch {
          throw new Error("AI returned invalid JSON. Please try again.");
        }
        const validated = briefAnalysisSchema.safeParse(parsed2);
        if (!validated.success) {
          throw new Error("AI response did not match expected schema. Please try again.");
        }
        return { response: validated.data, modelUsed: MODEL };
      },
    });

    return NextResponse.json({ analysis: result.response, cached: result.cached });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `AI request failed: ${message}` }, { status: 502 });
  }
}
