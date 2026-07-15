/**
 * AI assistance for documents (Sprint 5+6 of the Docs rebuild).
 *
 * Two flavours, both backed by Anthropic via the workspace's `anthropicApiKey`:
 *
 *   draftDocument(...)
 *     Whole-doc rewrite. The model is given the document's current sections (key + display
 *     name + current data) plus the user-supplied brief + optional Pulse insights, and asked
 *     to return a partial map of section.key → newSectionData. The route applies the patch.
 *
 *   expandSection(...)
 *     Per-section rewrite. The model receives one section + a free-text instruction and
 *     returns the new data for that section only.
 *
 * Output validation is shape-based — for each returned section, we confirm the data shape is
 * structurally compatible with the original (same top-level keys for objects, array for list
 * shapes). Anything mismatched is dropped from the patch with a warning so a hallucinated
 * shape can't corrupt the doc.
 *
 * **Provider note**: per the Sprint 5+6 decisions, this module is Anthropic-only. Workspaces
 * configured for OPENAI/GEMINI/LOCAL still produce a friendly error: "AI drafting requires an
 * Anthropic API key. Set one in Settings → Integrations." Multi-provider support can come
 * later (the pattern's already there in pulse-ai.ts).
 */

import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAiUsage, usageFromAnthropic } from "@/server/ai-usage";
import { SECTION_REGISTRY } from "@/lib/sections/registry";
import type { ProposalDocument, ProposalSection, SectionKey } from "@/types/proposal";

const DEFAULT_MODEL = "claude-sonnet-5";

// ── Errors ────────────────────────────────────────────────────────────────

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "AI drafting requires an Anthropic API key on this workspace. Add one in Settings → Integrations.",
    );
    this.name = "AiNotConfiguredError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Pull workspace AI config. Throws AiNotConfiguredError if the workspace's provider isn't
 * Anthropic or the key is missing.
 */
async function loadWorkspaceAnthropic(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { aiProvider: true, anthropicApiKey: true, anthropicModel: true },
  });
  if (!workspace) throw new Error("Workspace not found.");

  const provider = workspace.aiProvider ?? "ANTHROPIC";
  if (provider !== "ANTHROPIC") {
    throw new AiNotConfiguredError();
  }
  if (!workspace.anthropicApiKey) {
    throw new AiNotConfiguredError();
  }

  return {
    client: new Anthropic({ apiKey: workspace.anthropicApiKey, timeout: 120_000, maxRetries: 1 }),
    model: workspace.anthropicModel || DEFAULT_MODEL,
  };
}

/**
 * Validate that a candidate section data shape is compatible with the original. We're
 * intentionally conservative:
 *   - If original is an object: candidate must be an object with the same top-level keys
 *     (extras allowed, missing keys filled with the original's values)
 *   - If original is an array: candidate must be an array
 *   - Primitives: candidate must be the same `typeof`
 *
 * Returns the safely-merged value, or null if the candidate is structurally incompatible.
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
  // Primitive: accept if same type, else keep original
  if (candidate === null) return original;
  return typeof candidate === typeof original ? candidate : original;
}

/** Tight one-line description of a section type so the model knows what it's filling in. */
function sectionContextLine(section: ProposalSection): string {
  const registry = SECTION_REGISTRY[section.key];
  const displayName = registry?.displayName ?? section.title;
  const description = registry?.description ?? section.description ?? "";
  return `- **${section.key}** ("${displayName}"): ${description}`;
}

// ── Draft a whole document ───────────────────────────────────────────────

export interface DraftDocumentInput {
  documentId: string;
  workspaceId: string;
  brief: string;
  pulseScanId?: string;
  clientId?: string;
}

export interface DraftDocumentResult {
  updatedAt: string;
  sectionsUpdated: SectionKey[];
  sectionsSkipped: SectionKey[];
  /** The patched proposal — caller can replace its local copy with this. */
  proposal: ProposalDocument;
}

/**
 * Generate a first-draft for every section of the document based on `brief`. Reads the
 * document's current sections, fans them into one Anthropic call, and applies the returned
 * patches in a transaction.
 *
 * When `pulseScanId` is provided, the scan's critical gaps + build opportunities + scaling
 * roadmap are included in the prompt so the model can tailor scope + deliverables.
 */
export async function draftDocument(input: DraftDocumentInput): Promise<DraftDocumentResult> {
  const { client, model } = await loadWorkspaceAnthropic(input.workspaceId);

  const document = await prisma.document.findUnique({
    where: { id: input.documentId },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
  if (!document) throw new Error("Document not found.");

  // ── Build the pulse-aware context (optional) ─────────────────────────────────────────
  let pulseContext = "";
  if (input.pulseScanId) {
    const scan = await prisma.pulseScan.findUnique({
      where: { id: input.pulseScanId },
      select: {
        projectName: true,
        inputUrl: true,
        llmAnalysis: true,
        techStack: true,
      },
    });
    if (scan) {
      const analysis = scan.llmAnalysis as
        | {
            executiveSummary?: string;
            proposalHook?: string;
            criticalGaps?: Array<{ gap: string; urgency: string; impact: string }>;
            buildOpportunities?: Array<{ title: string; description: string }>;
            scalingRoadmap?: Array<{ title: string; goals: string[] }>;
          }
        | null;
      pulseContext = [
        `## Linked Pulse audit: ${scan.projectName}`,
        scan.inputUrl ? `URL: ${scan.inputUrl}` : "",
        analysis?.executiveSummary ? `Executive summary:\n${analysis.executiveSummary}` : "",
        analysis?.proposalHook
          ? `**Proposal hook (use as the introduction's lead sentence):**\n${analysis.proposalHook}`
          : "",
        analysis?.criticalGaps?.length
          ? "Critical gaps (map 1:1 into the `objectives` section):\n" +
            analysis.criticalGaps
              .map((g) => `- [${g.urgency}] ${g.gap} — ${g.impact}`)
              .join("\n")
          : "",
        analysis?.buildOpportunities?.length
          ? "Build opportunities (map into the `touchpoints` section):\n" +
            analysis.buildOpportunities.map((o) => `- ${o.title}: ${o.description}`).join("\n")
          : "",
        analysis?.scalingRoadmap?.length
          ? "Scaling roadmap (map into timeline phases):\n" +
            analysis.scalingRoadmap
              .map((p) => `- ${p.title}: ${p.goals.join(", ")}`)
              .join("\n")
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    }
  }

  // ── Build the prompt ────────────────────────────────────────────────────────────────
  const sectionList = document.sections
    .map((s) => sectionContextLine(s as unknown as ProposalSection))
    .join("\n");

  const currentSectionData: Record<string, unknown> = {};
  for (const s of document.sections) {
    currentSectionData[s.key] = s.data;
  }

  const systemPrompt = [
    "You are a senior document-writing assistant for Gitwork, a delivery agency. Your job is to",
    "draft a first-pass document body — proposal, SLA, SOW, etc. — based on a brief from the",
    "Gitwork operator.",
    "",
    "Output rules:",
    "1. Return JSON via the submit_document_draft tool. The `sections` field is an object keyed",
    "   by the section's `key` field (e.g. \"introduction\", \"objectives\", \"parties\"). Each value is",
    "   that section's new `data` shape — match the current shape exactly. Keep ALL existing",
    "   keys; only rewrite the values.",
    "2. For prose fields (statement, summary, intro, definition, criteria, etc.): write in the",
    "   first person plural (\"we will…\", \"our team\"), professional tone, no marketing fluff,",
    "   max 3 sentences per field unless the field is clearly meant to be longer.",
    "3. For list/table sections (objectives, touchpoints, exclusions, etc.): regenerate the",
    "   `items`/`tiers`/`priorities` array with 3-5 realistic entries derived from the brief.",
    "4. For structured legal sections (term, signatures, parties): keep the existing values",
    "   unless the brief specifically asks to change them.",
    "5. DO NOT invent prices, names, or dates that weren't in the brief. Leave placeholders",
    "   like \"[REVIEW]\" for anything you'd need explicit confirmation on.",
    "6. Skip any section where you have no useful information — just omit it from the output.",
    "",
    "Pulse-aware drafting (when a linked Pulse audit is attached, see User message):",
    "- Map the audit's `criticalGaps` directly into the `objectives` section's `items`. Each",
    "  critical gap becomes one objective (title = a short rephrasing of the gap, description =",
    "  the impact statement). These ARE the problems we're proposing to solve.",
    "- Map `buildOpportunities` into the `touchpoints` section's `items`. Each opportunity",
    "  becomes one touchpoint (title = the opportunity title, summary = the description,",
    "  features = the top capabilities you'd build to land it).",
    "- Map `scalingRoadmap` phases 1:N into the document's timeline phases when the doc has a",
    "  timeline section. Phase name = the roadmap title; deliverables = the goals list.",
    "- The proposalHook (if any) is the single sentence that should anchor the `introduction`",
    "  statement — lead with it.",
    "",
    "Section types available in this document:",
    sectionList,
  ].join("\n");

  const userMessage = [
    "## Brief",
    input.brief.trim(),
    pulseContext ? "\n" + pulseContext : "",
    "",
    "## Current section data (rewrite by section key)",
    "```json",
    JSON.stringify(currentSectionData, null, 2),
    "```",
  ].join("\n");

  // ── Anthropic call with tool_use for structured output ──────────────────────────────
  const t0 = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: [
      {
        type: "text",
        text: systemPrompt,
        // Cache the system prompt across drafts in the same workspace — it's large and reused.
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: "submit_document_draft",
        description: "Submit the rewritten section data for the document.",
        input_schema: {
          type: "object",
          properties: {
            sections: {
              type: "object",
              description:
                "Object keyed by section.key. Each value is the new `data` payload for that section, matching the existing shape.",
              additionalProperties: true,
            },
            notes: {
              type: "string",
              description:
                "Optional brief note to the operator about decisions or things that need their attention.",
            },
          },
          required: ["sections"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_document_draft" },
    messages: [{ role: "user", content: userMessage }],
  });
  recordAiUsage({
    module: "DOCS",
    workspaceId: input.workspaceId,
    operation: "draftDocument",
    provider: "ANTHROPIC",
    model,
    usage: usageFromAnthropic(response.usage),
    latencyMs: Date.now() - t0,
  });

  if (response.stop_reason === "refusal") {
    throw new Error("AI declined this draft (safety refusal).");
  }
  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI did not return a structured draft. Try again with a clearer brief.");
  }

  const result = toolUse.input as { sections?: Record<string, unknown>; notes?: string };
  const candidateSections = result.sections ?? {};

  // ── Validate + patch ────────────────────────────────────────────────────────────────
  const sectionsUpdated: SectionKey[] = [];
  const sectionsSkipped: SectionKey[] = [];

  const updates: Array<{ id: string; data: Prisma.InputJsonValue }> = [];
  for (const section of document.sections) {
    const key = section.key as SectionKey;
    if (!(key in candidateSections)) {
      sectionsSkipped.push(key);
      continue;
    }
    const merged = mergeShape(section.data, candidateSections[key]);
    if (merged === null) {
      sectionsSkipped.push(key);
      continue;
    }
    updates.push({ id: section.id, data: merged as Prisma.InputJsonValue });
    sectionsUpdated.push(key);
  }

  // Apply all patches in one transaction so a failure leaves the doc unchanged.
  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.documentSection.update({
          where: { id: u.id },
          data: { data: u.data },
        }),
      ),
    );
  }

  const refreshed = await prisma.document.findUniqueOrThrow({
    where: { id: input.documentId },
    include: {
      sections: { orderBy: { sortOrder: "asc" } },
      costLineItems: { orderBy: { sortOrder: "asc" } },
      timelinePhases: { orderBy: { sortOrder: "asc" } },
      assets: { orderBy: { sortOrder: "asc" } },
      links: { orderBy: { sortOrder: "asc" } },
      ctas: { orderBy: { sortOrder: "asc" } },
    },
  });

  // We don't fully re-serialize here — the route handler will use serializeProposal. Keep
  // this return shape lightweight; the caller hydrates the full ProposalDocument.
  return {
    updatedAt: refreshed.updatedAt.toISOString(),
    sectionsUpdated,
    sectionsSkipped,
    proposal: refreshed as unknown as ProposalDocument,
  };
}

// ── Per-section expand ────────────────────────────────────────────────────

export interface ExpandSectionInput {
  documentId: string;
  workspaceId: string;
  sectionKey: SectionKey;
  /** Free-text instruction from the operator ("Make this more concise", "Add 2 more bullets…"). */
  instruction: string;
}

export interface ExpandSectionResult {
  sectionKey: SectionKey;
  data: unknown;
}

export async function expandSection(input: ExpandSectionInput): Promise<ExpandSectionResult> {
  const { client, model } = await loadWorkspaceAnthropic(input.workspaceId);

  const section = await prisma.documentSection.findFirst({
    where: { documentId: input.documentId, key: input.sectionKey },
  });
  if (!section) throw new Error(`Section "${input.sectionKey}" not found on document.`);

  const registry = SECTION_REGISTRY[input.sectionKey as SectionKey];
  if (!registry) throw new Error(`Section type "${input.sectionKey}" is not configured.`);

  const systemPrompt = [
    "You are a senior document-writing assistant for Gitwork. Rewrite a single section of a",
    "document based on the operator's instruction. Match the existing JSON shape exactly —",
    "keep all keys, only change values. Tone: professional, first-person plural, no fluff.",
    "Return the result via the submit_section tool.",
    "",
    `Section: ${registry.displayName} (key: ${registry.key})`,
    `Purpose: ${registry.description}`,
  ].join("\n");

  const userMessage = [
    "## Instruction",
    input.instruction.trim(),
    "",
    "## Current section data",
    "```json",
    JSON.stringify(section.data, null, 2),
    "```",
  ].join("\n");

  const t0 = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    // Cache the (large, reused) system prompt for parity with the full-draft call above.
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    tools: [
      {
        name: "submit_section",
        description: "Submit the rewritten section data.",
        input_schema: {
          type: "object",
          properties: {
            data: {
              type: "object",
              description: "The new `data` payload for the section, matching the existing shape.",
              additionalProperties: true,
            },
          },
          required: ["data"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_section" },
    messages: [{ role: "user", content: userMessage }],
  });
  recordAiUsage({
    module: "DOCS",
    workspaceId: input.workspaceId,
    operation: "expandSection",
    provider: "ANTHROPIC",
    model,
    usage: usageFromAnthropic(response.usage),
    latencyMs: Date.now() - t0,
  });

  if (response.stop_reason === "refusal") {
    throw new Error("AI declined this rewrite (safety refusal).");
  }
  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI did not return a structured section. Try again.");
  }

  const next = (toolUse.input as { data?: unknown }).data;
  const merged = mergeShape(section.data, next);
  if (merged === null) {
    throw new Error("AI returned an incompatible shape — section left unchanged.");
  }

  await prisma.documentSection.update({
    where: { id: section.id },
    data: { data: merged as Prisma.InputJsonValue },
  });

  return { sectionKey: input.sectionKey, data: merged };
}
