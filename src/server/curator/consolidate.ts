/**
 * Curator — opt-in LLM consolidation pass.
 *
 * Cost-disciplined by design: ONE batched call, light tier (Haiku), a modest token cap, the stable
 * framing in the cached system prompt, and the whole call wrapped in the workspace AI-response cache
 * keyed on a hash of the candidate set — so an unchanged library between weeks returns cached
 * proposals for £0. Callers only invoke this when candidates actually exist (see run.ts).
 *
 * The model only ever *proposes*. Every proposal is validated against the real candidate set
 * (hallucinated targets are dropped) and applied later only on Super-Admin approval (apply.ts).
 */

import { randomUUID } from "node:crypto";
import {
  resolveAiConfig,
  completeText,
  parseJsonObject,
  type WorkspaceAiFields,
} from "@/server/ai-provider";
import { cachedOrCompute, hashInputs } from "@/server/ai-cache";
import type { CheckCandidate } from "./checks-pass";
import type { StarterCandidate } from "./starters-pass";
import type { CuratorProposal, ProposalKind } from "./types";

const SYSTEM_PROMPT = `You are the Curator, a maintenance assistant for an internal agency platform.
You are given two candidate lists and must propose a SHORT list of concrete, conservative cleanups.

STARTERS are reusable prompt/skill/kit library entries. CHECKS are automated production-readiness
checks with a computed "signal":
  - "dead": never ran in the window (likely broken or unreachable emit code)
  - "always_pass": ran many times, always passed (low signal)
  - "noisy": ran many times, always failed (mis-calibrated / always-red)

Allowed proposal kinds:
  - STARTER_ARCHIVE      target = starter id. Only for clearly redundant/superseded starters.
  - STARTER_CONSOLIDATE  target = comma-separated starter ids that overlap; payload.mergeInto = the
                         one to keep. ADVISORY ONLY (a human merges manually) — still worth flagging.
  - CHECK_DISABLE        target = checkKey. For "dead" checks, or "noisy" checks with no value.
  - CHECK_SEVERITY       target = checkKey; payload.severity = "WARN" or "FAIL". Down/upgrade a check.
  - CHECK_RELABEL        target = checkKey; payload.label = a clearer label.

Rules:
  - Be conservative. Propose only high-confidence cleanups. Fewer, better proposals.
  - NEVER propose archiving a heavily-used starter. NEVER propose disabling a check that still WARNs/FAILs usefully.
  - Every target MUST be an id/checkKey present in the input. Do not invent targets.
  - Each proposal needs a one-sentence "rationale".

Respond with ONLY a JSON object: { "proposals": [ { "kind", "target", "targetLabel", "rationale", "payload"? } ] }.
If nothing is worth changing, return { "proposals": [] }.`;

const ALLOWED_KINDS: ReadonlySet<ProposalKind> = new Set<ProposalKind>([
  "STARTER_ARCHIVE",
  "STARTER_CONSOLIDATE",
  "CHECK_DISABLE",
  "CHECK_SEVERITY",
  "CHECK_RELABEL",
]);

interface RawProposal {
  kind?: string;
  target?: string;
  targetLabel?: string;
  rationale?: string;
  payload?: Record<string, unknown>;
}

export interface ConsolidationResult {
  proposals: CuratorProposal[];
  aiModel: string | null;
}

/** Validate one raw LLM proposal against the real candidate set. Returns null if invalid. */
function validate(
  raw: RawProposal,
  starterIds: Set<string>,
  checkKeys: Set<string>,
): CuratorProposal | null {
  const kind = raw.kind as ProposalKind;
  if (!ALLOWED_KINDS.has(kind)) return null;
  const target = typeof raw.target === "string" ? raw.target.trim() : "";
  if (!target) return null;
  const rationale = typeof raw.rationale === "string" ? raw.rationale.trim() : "";
  if (!rationale) return null;

  if (kind === "STARTER_ARCHIVE") {
    if (!starterIds.has(target)) return null;
  } else if (kind === "STARTER_CONSOLIDATE") {
    const ids = target.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length < 2 || !ids.every((id) => starterIds.has(id))) return null;
    const mergeInto = raw.payload?.mergeInto;
    if (typeof mergeInto === "string" && !starterIds.has(mergeInto.trim())) return null;
  } else {
    // CHECK_* — target is a checkKey
    if (!checkKeys.has(target)) return null;
    if (kind === "CHECK_SEVERITY") {
      const sev = raw.payload?.severity;
      if (sev !== "WARN" && sev !== "FAIL") return null;
    }
    if (kind === "CHECK_RELABEL") {
      const label = raw.payload?.label;
      if (typeof label !== "string" || !label.trim()) return null;
    }
  }

  return {
    id: randomUUID(),
    kind,
    target,
    targetLabel: typeof raw.targetLabel === "string" ? raw.targetLabel : undefined,
    rationale,
    payload: raw.payload && typeof raw.payload === "object" ? raw.payload : undefined,
    status: "open",
  };
}

export async function runConsolidation(opts: {
  workspaceId: string;
  aiFields: WorkspaceAiFields;
  starters: StarterCandidate[];
  checks: CheckCandidate[];
}): Promise<ConsolidationResult> {
  const config = resolveAiConfig(opts.aiFields);

  // Compact, order-stable inputs so the cache key is deterministic.
  const inputs = {
    starters: [...opts.starters]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        summary: s.summary,
        tags: s.tags,
        usageCount: s.usageCount,
        daysSinceUsed: s.daysSinceUsed,
        state: s.state,
      })),
    checks: [...opts.checks]
      .sort((a, b) => a.checkKey.localeCompare(b.checkKey))
      .map((c) => ({ checkKey: c.checkKey, label: c.label, signal: c.signal, fireCount: c.fireCount, passRate: Number(c.passRate.toFixed(2)) })),
  };

  const starterIds = new Set(opts.starters.map((s) => s.id));
  const checkKeys = new Set(opts.checks.map((c) => c.checkKey));

  const result = await cachedOrCompute<{ proposals: RawProposal[]; model: string | null }>({
    workspaceId: opts.workspaceId,
    cacheKey: "curator-consolidation",
    inputsHash: hashInputs(inputs),
    compute: async () => {
      const raw = await completeText({
        config,
        system: SYSTEM_PROMPT,
        user: JSON.stringify(inputs),
        maxTokens: 1500,
        tier: "light",
      });
      const parsed = parseJsonObject<{ proposals?: RawProposal[] }>(raw);
      return {
        response: { proposals: Array.isArray(parsed?.proposals) ? parsed!.proposals! : [], model: config.model },
        modelUsed: config.model,
      };
    },
  });

  const rawProposals = result?.response.proposals ?? [];
  const proposals = rawProposals
    .map((p) => validate(p, starterIds, checkKeys))
    .filter((p): p is CuratorProposal => p !== null);

  return { proposals, aiModel: result?.modelUsed ?? null };
}
