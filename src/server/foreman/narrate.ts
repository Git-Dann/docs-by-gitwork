/**
 * Foreman — opt-in AI narrative pass.
 *
 * Cost-disciplined like the Curator's consolidation: ONE batched light-tier (Haiku) call, a modest
 * token cap, the stable framing in a cached system prompt, and the whole call wrapped in the
 * workspace AI-response cache keyed on a hash of the findings — so an unchanged risk picture reuses
 * the cached narrative for £0. Only invoked when findings actually warrant it (see run.ts).
 *
 * The model only ever *summarises* the deterministic findings — it never invents risks. Output is
 * validated to plain strings; anything malformed degrades to no narrative (the findings stand alone).
 */

import {
  resolveAiConfig,
  completeText,
  parseJsonObject,
  type WorkspaceAiFields,
} from "@/server/ai-provider";
import { cachedOrCompute, hashInputs } from "@/server/ai-cache";
import type { ForemanFinding, ForemanNarrative } from "./types";

const SYSTEM_PROMPT = `You are Foreman, the delivery lead for a design-and-build agency. You are given a
list of ALREADY-DETECTED delivery risks (overdue tasks, slipping feature blocks, missed milestones,
overloaded developers) plus "blind spots" (missing due dates / timelines). Every risk was found by
deterministic rules — your job is ONLY to summarise and prioritise them for a busy founder's morning.

Rules:
  - Do NOT invent risks, clients, or numbers. Only reference what is in the input.
  - "summary": 2-3 tight sentences — the honest state of delivery today. Plain, calm, specific.
  - "priorities": the 3-5 most important actions, most urgent first. Each a short imperative line
    naming the client/developer. Lead with critical items. If something is a blind spot (missing
    data), you may note that Foreman can't fully judge it.
  - If the input is empty or trivial, say delivery looks on track and return few/no priorities.

Respond with ONLY a JSON object: { "summary": "...", "priorities": ["...", "..."] }.`;

interface RawNarrative {
  summary?: unknown;
  priorities?: unknown;
}

export interface NarrativeResult {
  narrative: ForemanNarrative | null;
  aiModel: string | null;
}

export async function runNarrative(opts: {
  workspaceId: string;
  aiFields: WorkspaceAiFields;
  findings: ForemanFinding[];
}): Promise<NarrativeResult> {
  const config = resolveAiConfig(opts.aiFields);

  // Compact, order-stable inputs so the cache key is deterministic.
  const inputs = [...opts.findings]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((f) => ({
      severity: f.severity,
      category: f.category,
      subject: f.subjectLabel,
      headline: f.headline,
      metric: f.metric,
      trend: f.trend,
    }));

  const result = await cachedOrCompute<{ narrative: RawNarrative | null; model: string | null }>({
    workspaceId: opts.workspaceId,
    cacheKey: "foreman-narrative",
    inputsHash: hashInputs(inputs),
    compute: async () => {
      const raw = await completeText({
        config,
        system: SYSTEM_PROMPT,
        user: JSON.stringify(inputs),
        maxTokens: 700,
        tier: "light",
        usageContext: { module: "FOREMAN", workspaceId: opts.workspaceId, operation: "narrate" },
      });
      const parsed = parseJsonObject<RawNarrative>(raw);
      return { response: { narrative: parsed ?? null, model: config.model }, modelUsed: config.model };
    },
  });

  const raw = result?.response.narrative;
  const summary = typeof raw?.summary === "string" ? raw.summary.trim() : "";
  const priorities = Array.isArray(raw?.priorities)
    ? raw!.priorities.filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim()).slice(0, 6)
    : [];

  if (!summary && priorities.length === 0) return { narrative: null, aiModel: result?.modelUsed ?? null };
  return { narrative: { summary, priorities }, aiModel: result?.modelUsed ?? null };
}
