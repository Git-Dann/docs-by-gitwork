import { NextRequest } from "next/server";
import { z } from "zod";
import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  eventId: z.string(),
  eventTitle: z.string(),
  eventDate: z.string(),
  attendees: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const body = bodySchema.parse(await req.json());
    const { workspace } = await ensureBaseRecords();

    // ── Resolve AI config ──────────────────────────────────────────────────────
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
      return apiError("No AI API key configured. Add one in Settings → Integrations.", 422);
    }

    // ── Fetch related Gmail threads ────────────────────────────────────────────
    let emailContext = "";
    if (workspace.googleServiceAccountJson && workspace.googleSubjectEmail) {
      try {
        const credentials = JSON.parse(workspace.googleServiceAccountJson) as Record<string, unknown>;
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        });
        const authClient = await auth.getClient();
        if ("subject" in authClient) {
          (authClient as { subject?: string }).subject = workspace.googleSubjectEmail;
        }
        const gmail = google.gmail({
          version: "v1",
          auth: authClient as Parameters<typeof google.gmail>[0]["auth"],
        });

        // Search for emails related to this meeting
        const searchQuery = [
          `subject:"${body.eventTitle.replace(/"/g, "")}"`,
          `newer_than:30d`,
        ].join(" ");

        const listRes = await gmail.users.messages.list({
          userId: "me",
          q: searchQuery,
          maxResults: 5,
        });

        if ((listRes.data.messages ?? []).length > 0) {
          const threads = await Promise.all(
            (listRes.data.messages ?? []).map((m) =>
              gmail.users.messages.get({ userId: "me", id: m.id!, format: "metadata",
                metadataHeaders: ["From", "Subject", "Date"] }),
            ),
          );
          emailContext = threads
            .map((t) => {
              const headers = t.data.payload?.headers ?? [];
              const get = (n: string) => headers.find((h) => h.name === n)?.value ?? "";
              return `From: ${get("From")}\nSubject: ${get("Subject")}\nDate: ${get("Date")}\nSnippet: ${t.data.snippet ?? ""}`;
            })
            .join("\n\n---\n\n");
        }
      } catch {
        // Gmail unavailable — continue without email context
      }
    }

    // ── Fetch Slack messages around event date ────────────────────────────────
    let slackContext = "";
    if (workspace.slackBotToken && workspace.slackSummaryChannelId) {
      try {
        const eventTime = new Date(body.eventDate).getTime() / 1000;
        const dayBefore = eventTime - 86400;
        const dayAfter = eventTime + 86400;

        const res = await fetch(
          `https://slack.com/api/conversations.history?channel=${workspace.slackSummaryChannelId}&oldest=${dayBefore}&latest=${dayAfter}&limit=30`,
          { headers: { Authorization: `Bearer ${workspace.slackBotToken}` } },
        );
        const data = (await res.json()) as { ok: boolean; messages?: Array<{ text: string; ts: string }> };
        if (data.ok && data.messages) {
          slackContext = data.messages
            .filter((m) => m.text && m.text.toLowerCase().includes(body.eventTitle.toLowerCase().split(" ")[0]))
            .map((m) => m.text)
            .slice(0, 10)
            .join("\n");
        }
      } catch {
        // Slack unavailable — continue without Slack context
      }
    }

    // ── Build prompt ──────────────────────────────────────────────────────────
    const systemPrompt = `You are a professional assistant for Gitwork, a UK digital design-and-build agency.
Your job is to produce concise, actionable meeting summaries.

Format your response with these sections (only include sections with content):
**Meeting:** [title and date]
**Attendees:** [list]
**Key Decisions:** [bullet points]
**Action Items:** [bullet points with owner if known]
**Follow-ups:** [any open questions or next steps]

Be concise. British English. No filler.`;

    const userPrompt = [
      `Meeting: ${body.eventTitle}`,
      `Date: ${body.eventDate}`,
      body.attendees.length > 0 ? `Attendees: ${body.attendees.join(", ")}` : null,
      emailContext ? `\n--- Related emails ---\n${emailContext}` : null,
      slackContext ? `\n--- Related Slack messages ---\n${slackContext}` : null,
      !emailContext && !slackContext ? "\n(No email or Slack context available — summarise based on meeting details above.)" : null,
    ]
      .filter(Boolean)
      .join("\n");

    // ── Generate summary ──────────────────────────────────────────────────────
    let summary = "";

    if (provider === "ANTHROPIC") {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      const block = response.content[0];
      summary = block.type === "text" ? block.text : "";
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
      summary = response.choices[0]?.message?.content ?? "";
    }

    return apiOk({ summary: summary.trim() });
  } catch (error) {
    return fromError(error);
  }
}
