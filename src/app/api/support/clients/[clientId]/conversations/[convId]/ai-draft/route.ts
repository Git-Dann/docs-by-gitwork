import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string; convId: string }> },
) {
  try {
    const { clientId, convId } = await params;

    const { workspace } = await ensureBaseRecords();
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

    if (!apiKey) {
      return apiError(
        "No AI API key configured. Add one in Settings → Integrations.",
        422,
      );
    }

    const conversation = await prisma.supportConversation.findUnique({
      where: { id: convId, clientId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        client: { select: { name: true } },
      },
    });

    if (!conversation) return apiError("Conversation not found", 404);

    const threadText = conversation.messages
      .map((m) => `[${m.direction === "outbound" ? "Support" : "Customer"}] ${m.body}`)
      .join("\n\n");

    const systemPrompt = `You are a professional support agent at Gitwork, a UK-based design-and-build digital agency.
You manage client support on Gitwork's behalf.

Tone guidelines:
- Professional and warm, never stiff or corporate
- Direct and concise — no waffle, no filler phrases
- Solutions-focused with clear next steps
- British English spelling

Do NOT open with "I hope this email finds you well" or similar openers.
Sign off as: Gitwork Support

Reply ONLY with the message body — no subject line, no metadata, no preamble.`;

    const userPrompt = `Support conversation — client: ${conversation.client.name}
Subject: ${conversation.subject}
Customer: ${conversation.customerLabel}

--- Thread ---
${threadText || "(No messages yet — write an opening reply.)"}
---

Write a professional reply to the customer's most recent message.`;

    let draft = "";

    if (provider === "ANTHROPIC") {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      const block = response.content[0];
      draft = block.type === "text" ? block.text : "";
    } else {
      const openai = new OpenAI({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) });
      const response = await openai.chat.completions.create({
        model,
        max_tokens: 1024,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      draft = response.choices[0]?.message?.content ?? "";
    }

    return apiOk({ draft: draft.trim() });
  } catch (error) {
    return fromError(error);
  }
}
