import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { google } from "googleapis";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { auth } from "@/auth";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getUserGoogleAuth } from "@/server/google-auth";
import { getSlackBotToken } from "@/server/slack/client";
import { getEffectiveUserOrNull, canComputeAiFor } from "@/server/auth/effective-user";
import { lightModelFor } from "@/server/ai-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  eventId: z.string(),
  eventTitle: z.string(),
  eventDate: z.string(),
  attendees: z.array(z.string()).default([]),
  channelIds: z.array(z.string()).optional(),
  // Pass `force: true` to regenerate even when a cached summary exists.
  force: z.boolean().optional(),
});

// Hash the inputs that materially affect the generated summary. If any change, the cached
// summary is treated as stale and we regenerate. We hash the channelIds set (sorted) so the
// order users pick them in doesn't bust the cache.
function computeInputsHash(input: {
  eventTitle: string;
  eventDate: string;
  attendees: string[];
  channelIds: string[];
  model: string;
}): string {
  const payload = JSON.stringify({
    title: input.eventTitle,
    date: input.eventDate,
    attendees: [...input.attendees].sort(),
    channels: [...input.channelIds].sort(),
    model: input.model,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  try {
    const body = bodySchema.parse(await req.json());
    const { workspace } = await ensureBaseRecords();

    // ── Resolve AI config ──────────────────────────────────────────────────────
    const provider = workspace.aiProvider as "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";
    let apiKey: string | null;
    let model: string;
    let baseUrl: string | null = null;

    // We need `model` to compute the cache key — resolve it before the cache lookup so a
    // model switch (e.g. Sonnet → Opus) invalidates entries automatically.

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
      model = workspace.anthropicModel ?? "claude-sonnet-5";
    }

    // A meeting summary is short, structured output — route it to the light tier (Haiku /
    // gpt-4o-mini, ~3.75× cheaper) rather than full Sonnet. Model is part of the cache key,
    // so this also invalidates any Sonnet-generated entries on first re-fetch.
    model = lightModelFor(provider, model);

    if (!apiKey) {
      return apiError("No AI API key configured. Add one in Settings → Integrations.", 422);
    }

    // ── Cache lookup ──────────────────────────────────────────────────────────
    // Cache key: (workspaceId, eventId). Inputs hash invalidates entries when meeting
    // details or channel selection change. Anyone on the same call gets the same cached
    // summary, paid for by whichever Gitwork teammate clicked Summarise first.
    const channelIdsForKey = body.channelIds ?? [];
    const inputsHash = computeInputsHash({
      eventTitle: body.eventTitle,
      eventDate: body.eventDate,
      attendees: body.attendees,
      channelIds: channelIdsForKey,
      model,
    });

    if (!body.force) {
      const cached = await prisma.meetingSummary.findUnique({
        where: { workspaceId_eventId: { workspaceId: workspace.id, eventId: body.eventId } },
        select: {
          summary: true,
          inputsHash: true,
          createdAt: true,
          updatedAt: true,
          generatedBy: { select: { name: true, email: true } },
        },
      });

      if (cached && cached.inputsHash === inputsHash) {
        return apiOk({
          summary: cached.summary,
          cached: true,
          cachedAt: cached.updatedAt.toISOString(),
          generatedBy: cached.generatedBy?.name ?? cached.generatedBy?.email ?? null,
        });
      }
    }

    // Cache missed (or stale). Only AI-generation holders (admins by default) pay to
    // generate a fresh summary; everyone else gets an empty result and can view whatever
    // an admin has already cached. Keeps the dashboard widget from burning tokens per-viewer.
    if (!canComputeAiFor(await getEffectiveUserOrNull(req))) {
      return apiOk({ summary: "", cached: false, notGenerated: true });
    }

    // ── Fetch related Gmail threads ────────────────────────────────────────────
    // Pull email context from the *signed-in user's* Gmail (or the workspace service account
    // if one is configured). The previous workspace OAuth path leaked the most-recent
    // signer's inbox to everyone else — removed. With a workspace-shared cache, the first
    // caller's email context informs the summary; subsequent callers reuse the cached output.
    let emailContext = "";
    const hasServiceAccount = !!(workspace.googleServiceAccountJson && workspace.googleSubjectEmail);
    const userAuth = hasServiceAccount ? null : await getUserGoogleAuth();
    const hasUserGoogle = userAuth?.ok === true;

    if (hasServiceAccount || hasUserGoogle) {
      try {
        let gmailAuth: Parameters<typeof google.gmail>[0]["auth"];

        if (hasServiceAccount) {
          const credentials = JSON.parse(workspace.googleServiceAccountJson!) as Record<string, unknown>;
          const serviceAuth = new google.auth.GoogleAuth({
            credentials,
            scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
          });
          const authClient = await serviceAuth.getClient();
          if ("subject" in authClient) {
            (authClient as { subject?: string }).subject = workspace.googleSubjectEmail!;
          }
          gmailAuth = authClient as Parameters<typeof google.gmail>[0]["auth"];
        } else if (userAuth?.ok) {
          // Per-user Google OAuth — same identity used by Calendar + Gmail widgets.
          gmailAuth = userAuth.client;
        } else {
          // Defensive — shouldn't reach here given the outer guard, but TS needs the narrowing.
          throw new Error("No Google auth available for meeting summary");
        }

        const gmail = google.gmail({ version: "v1", auth: gmailAuth });

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
    const slackBotToken = getSlackBotToken(workspace);
    if (slackBotToken) {
      try {
        // Resolve which channel IDs to search:
        // 1. Use channelIds from request body if provided
        // 2. Fall back to all saved channels on workspace
        // 3. Fall back to legacy single-channel setting
        const savedChannels = (workspace.slackChannels as Array<{ id: string; name: string }> | null) ?? [];
        let targetIds: string[] = body.channelIds ?? savedChannels.map((c) => c.id);
        if (targetIds.length === 0 && workspace.slackSummaryChannelId) {
          targetIds = [workspace.slackSummaryChannelId];
        }

        if (targetIds.length > 0) {
          const eventTime = new Date(body.eventDate).getTime() / 1000;
          // Search 3 days back → 1 day ahead so recurring stand-ups and prep
          // threads are captured even when no message mentions the meeting title.
          const windowStart = eventTime - 3 * 86400;
          const windowEnd = eventTime + 86400;

          const allMessages: string[] = [];
          await Promise.all(
            targetIds.map(async (channelId) => {
              try {
                const res = await fetch(
                  `https://slack.com/api/conversations.history?channel=${channelId}&oldest=${windowStart}&latest=${windowEnd}&limit=50`,
                  { headers: { Authorization: `Bearer ${slackBotToken}` } },
                );
                const data = (await res.json()) as { ok: boolean; messages?: Array<{ text: string; ts: string }> };
                if (data.ok && data.messages) {
                  // Include all non-empty messages — AI decides what's relevant
                  const msgs = data.messages
                    .filter((m) => m.text && m.text.trim().length > 0)
                    .map((m) => m.text)
                    .slice(0, 20);
                  allMessages.push(...msgs);
                }
              } catch {
                // Channel unavailable — skip
              }
            }),
          );

          slackContext = allMessages.slice(0, 30).join("\n---\n");
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

    const trimmedSummary = summary.trim();

    // Persist the cache entry — fire-and-forget on auth lookup so we don't block the
    // response. If the user isn't logged in (shouldn't happen for app routes), we still
    // cache the summary with no actor.
    const session = await auth().catch(() => null);
    const actorId = session?.user?.id ?? null;
    if (trimmedSummary) {
      await prisma.meetingSummary
        .upsert({
          where: { workspaceId_eventId: { workspaceId: workspace.id, eventId: body.eventId } },
          create: {
            workspaceId: workspace.id,
            eventId: body.eventId,
            summary: trimmedSummary,
            inputsHash,
            modelUsed: model,
            generatedByUserId: actorId,
          },
          update: {
            summary: trimmedSummary,
            inputsHash,
            modelUsed: model,
            generatedByUserId: actorId,
          },
        })
        .catch((err: unknown) => {
          // Cache write failures shouldn't break the response — log and move on.
          console.error("[meeting-summary] cache upsert failed", err);
        });
    }

    return apiOk({ summary: trimmedSummary, cached: false });
  } catch (error) {
    return fromError(error);
  }
}
