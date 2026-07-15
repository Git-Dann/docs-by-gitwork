/**
 * POST /api/documents/[id]/ai/chat
 *
 * Conversational AI endpoint. The client sends the running message history each turn (the
 * server is stateless w.r.t. session — the UI keeps the conversation in component state). The
 * model can respond with prose AND/OR a tool call that PROPOSES a change to a section. Proposed
 * changes are NOT applied server-side; the response carries before/after JSON so the UI can
 * render a diff and let the user accept or reject.
 *
 * Body shape:
 *   {
 *     messages: Array<{ role: "user" | "assistant"; content: string }>;
 *     pulseScanId?: string;
 *   }
 *
 * Response shape:
 *   {
 *     reply: string;                              // The model's natural-language reply
 *     proposals: Array<{                          // Zero or more proposed changes
 *       sectionKey: string;
 *       before: unknown;                          // Current section data
 *       after: unknown;                           // Proposed section data (validated shape)
 *       summary: string;                          // One-line description of what changed
 *     }>;
 *   }
 *
 * The accept-a-proposal action is a separate endpoint, /api/documents/[id]/ai/apply, which
 * actually patches the section after the user clicks Accept.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { SECTION_REGISTRY } from "@/lib/sections/registry";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { AiNotConfiguredError } from "@/server/document-ai";
import { assertCan, canGenerateAi, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { recordAiUsage, usageFromAnthropic } from "@/server/ai-usage";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const DEFAULT_MODEL = "claude-sonnet-5";

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40),
  pulseScanId: z.string().optional(),
});

/**
 * Conservatively merge a candidate value into an existing data shape: arrays stay arrays,
 * objects merge with existing keys taking precedence (no key drops). Returns null when the
 * candidate is structurally incompatible.
 */
function mergeShape(original: unknown, candidate: unknown): unknown | null {
  if (Array.isArray(original)) {
    return Array.isArray(candidate) ? candidate : null;
  }
  if (original !== null && typeof original === "object") {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      return null;
    }
    const result: Record<string, unknown> = { ...(original as Record<string, unknown>) };
    for (const [k, v] of Object.entries(original as Record<string, unknown>)) {
      const next = (candidate as Record<string, unknown>)[k];
      if (next === undefined) {
        result[k] = v;
        continue;
      }
      const merged = mergeShape(v, next);
      result[k] = merged ?? v;
    }
    return result;
  }
  if (candidate === null) return original;
  return typeof candidate === typeof original ? candidate : original;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const effectiveUser = await getEffectiveUserOrNull(request);
    assertCan(effectiveUser, canGenerateAi, "use AI document authoring");
    const { id } = await context.params;
    const body = chatSchema.parse(await request.json());

    // Load workspace AI config
    const { workspace } = await ensureBaseRecords();
    const ws = await prisma.workspace.findUnique({
      where: { id: workspace.id },
      select: { aiProvider: true, anthropicApiKey: true, anthropicModel: true },
    });
    if (!ws || (ws.aiProvider ?? "ANTHROPIC") !== "ANTHROPIC" || !ws.anthropicApiKey) {
      throw new AiNotConfiguredError();
    }

    const client = new Anthropic({
      apiKey: ws.anthropicApiKey,
      timeout: 60_000,
      maxRetries: 1,
    });

    // Load the document so we have current section data to ground the conversation
    const doc = await prisma.document.findUnique({
      where: { id },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });
    if (!doc) return apiError("Document not found", 404);

    // Optional Pulse context — same shape used by draftDocument
    let pulseContext = "";
    if (body.pulseScanId) {
      const scan = await prisma.pulseScan.findUnique({
        where: { id: body.pulseScanId },
        select: { projectName: true, inputUrl: true, llmAnalysis: true },
      });
      if (scan) {
        const a = scan.llmAnalysis as
          | {
              executiveSummary?: string;
              criticalGaps?: Array<{ gap: string; urgency: string; impact: string }>;
              buildOpportunities?: Array<{ title: string; description: string }>;
            }
          | null;
        pulseContext = [
          `Linked Pulse scan: ${scan.projectName}${scan.inputUrl ? ` (${scan.inputUrl})` : ""}`,
          a?.executiveSummary ? `Summary: ${a.executiveSummary}` : "",
          a?.criticalGaps?.length
            ? "Critical gaps: " + a.criticalGaps.map((g) => `${g.gap} [${g.urgency}]`).join("; ")
            : "",
        ]
          .filter(Boolean)
          .join("\n");
      }
    }

    // System prompt explains the document model + the propose_change tool
    const sectionList = doc.sections
      .map((s) => {
        const reg = SECTION_REGISTRY[s.key as keyof typeof SECTION_REGISTRY];
        return `- ${s.key} ("${reg?.displayName ?? s.title}"): ${reg?.description ?? ""}`;
      })
      .join("\n");

    const systemPrompt = [
      "You are a senior document-writing assistant working with the operator on a Foundry doc",
      "(proposal, SLA, SOW, etc.). You can have a normal conversation AND propose concrete",
      "changes to any section by calling the propose_change tool.",
      "",
      "How to behave:",
      "- Be concise — operators are busy. 2–4 sentences per reply unless they ask for more.",
      "- When the operator asks for a change (\"make it more concise\", \"add a phase\", \"rewrite",
      "  the introduction\"), call propose_change with the new section data. The system shows",
      "  them a diff and they accept or reject.",
      "- Match the existing JSON shape EXACTLY when calling propose_change. Don't invent keys.",
      "- For tone questions, factual questions, or strategy questions, just answer in prose —",
      "  don't call the tool.",
      "- Never invent prices, dates, or names. Use [REVIEW] as a placeholder if needed.",
      "",
      pulseContext ? `Linked Pulse context:\n${pulseContext}\n` : "",
      "Current document sections (key → displayName: description):",
      sectionList,
    ].join("\n");

    // Convert client messages to Anthropic format
    const anthropicMessages = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const chatModel = ws.anthropicModel || DEFAULT_MODEL;
    const t0 = Date.now();
    const response = await client.messages.create({
      model: chatModel,
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: systemPrompt,
          // Cache the system prompt across turns — heavy and reused.
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: "propose_change",
          description:
            "Propose a change to a specific section. The system will show the user a diff and " +
            "let them accept or reject. Does NOT directly apply the change.",
          input_schema: {
            type: "object",
            properties: {
              sectionKey: {
                type: "string",
                description: "The section's key (e.g. \"introduction\", \"objectives\", \"costing\").",
              },
              after: {
                type: "object",
                description:
                  "The new section data, matching the existing JSON shape. Keep ALL existing keys.",
                additionalProperties: true,
              },
              summary: {
                type: "string",
                description: "One-line description of what changed.",
              },
            },
            required: ["sectionKey", "after", "summary"],
          },
        },
        {
          name: "propose_document_draft",
          description:
            "Propose a full first-draft of the document. Use when the operator asks for a draft " +
            "or rewrite of everything.",
          input_schema: {
            type: "object",
            properties: {
              sections: {
                type: "object",
                description:
                  "Object keyed by section.key. Each value is the new `data` payload for that section.",
                additionalProperties: true,
              },
              summary: { type: "string" },
            },
            required: ["sections", "summary"],
          },
        },
      ],
      messages: anthropicMessages,
    });
    recordAiUsage({
      module: "DOCS",
      workspaceId: workspace.id,
      userId: effectiveUser?.id ?? null,
      operation: "chat",
      provider: "ANTHROPIC",
      model: chatModel,
      usage: usageFromAnthropic(response.usage),
      latencyMs: Date.now() - t0,
    });

    // Extract text blocks (the reply) + tool_use blocks (the proposals)
    let replyText = "";
    const proposals: Array<{ sectionKey: string; before: unknown; after: unknown; summary: string }> = [];

    for (const block of response.content) {
      if (block.type === "text") {
        replyText += block.text;
      } else if (block.type === "tool_use") {
        if (block.name === "propose_change") {
          const input = block.input as { sectionKey?: string; after?: unknown; summary?: string };
          if (!input.sectionKey || !input.after) continue;
          const section = doc.sections.find((s) => s.key === input.sectionKey);
          if (!section) continue;
          const merged = mergeShape(section.data, input.after);
          if (merged === null) continue;
          proposals.push({
            sectionKey: input.sectionKey,
            before: section.data,
            after: merged,
            summary: input.summary ?? "Proposed update",
          });
        } else if (block.name === "propose_document_draft") {
          const input = block.input as { sections?: Record<string, unknown>; summary?: string };
          if (!input.sections) continue;
          for (const section of doc.sections) {
            const candidate = input.sections[section.key];
            if (candidate === undefined) continue;
            const merged = mergeShape(section.data, candidate);
            if (merged === null) continue;
            proposals.push({
              sectionKey: section.key,
              before: section.data,
              after: merged,
              summary: input.summary ?? "Full-doc draft",
            });
          }
        }
      }
    }

    return apiOk({
      reply: replyText.trim() || (proposals.length > 0 ? "Here's a proposed change — review the diff." : ""),
      proposals,
    });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return apiError(error.message, 412);
    }
    if (error instanceof z.ZodError) {
      return apiError(error.issues.map((i) => i.message).join(", "), 400);
    }
    return fromError(error);
  }
}
