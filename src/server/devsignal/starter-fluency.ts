import type { DevSignalStageStatus } from "@prisma/client";
import { completeText, parseJsonObject, resolveAiConfig, type WorkspaceAiFields } from "@/server/ai-provider";
import { listStarters, getStarter, type StarterListItem } from "@/server/starters";
import type { DevSignalFlag, DevSignalSubScore } from "./stages/types";

/**
 * Starter Fluency (stage 5, weight 15) — a work-sample signal closer to real delivery work
 * than the pure-function coding_challenge kata: the candidate is handed a real internal
 * Foundry Starter's public brief and asked to extend/adapt it for a scenario, in writing (a
 * plan, an adapted prompt, or a short code sketch — whatever's appropriate to the starter's
 * type). No code execution required, so this doesn't need a sandboxed CodeRunnerProvider
 * (deliberately out of scope for v1 — see stages/providers/code-runner's own "do not wire one
 * in without approval" guardrail). Scored the same way as video_assessment: an LLM-judged
 * rubric via the shared AI provider, with a conservative heuristic fallback so nothing is a
 * black box when no AI key is configured.
 */

export interface PublicStarterFixture {
  starterId: string;
  starterName: string;
  starterSummary: string;
  techStack: string[];
  /** A condensed, candidate-safe brief — built from summary/description/whatYouGet.
   * NEVER the starter's raw internal promptText (that's the actual IP artifact) or _buildRef. */
  briefMarkdown: string;
  scenario: string;
}

const GENERIC_SCENARIO =
  "Read the brief below for a real internal building block. Write a short technical response " +
  "(a plan, an adapted prompt, or a code sketch — whichever fits) explaining how you'd extend or " +
  "adapt it to handle the stated scenario. We're assessing technical judgment and communication " +
  "clarity, not whether you produce a fully working build.";

function tokenize(value?: string | null): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[\s,/&|+]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Candidate-eligible starter types for a written extend/adapt task — PLUGIN/COLLECTION are
 * file bundles or reference material with no single spec to extend, so they're excluded. */
const ELIGIBLE_TYPES = new Set(["PROMPT", "SKILL", "KIT"]);

/**
 * Pick the best-matching eligible starter for a candidate. Deterministic scoring: overlap
 * between the candidate's declared stack and the starter's techStack + tags. Mirrors
 * pickBestChallenge's shape so the two matchers read the same way. Pure — takes the resolved
 * catalog, so it's unit-testable without a DB.
 */
export function pickBestStarterFixture(
  starters: StarterListItem[],
  criteria: { primaryStack?: string | null },
): StarterListItem | null {
  const eligible = starters.filter((s) => ELIGIBLE_TYPES.has(s.type));
  if (eligible.length === 0) return null;

  const stackTokens = new Set(tokenize(criteria.primaryStack));
  let best: StarterListItem | null = null;
  let bestScore = -Infinity;

  eligible.forEach((s, index) => {
    const haystack = new Set(s.tags.map((t) => t.toLowerCase()));
    const stackHits = [...stackTokens].filter((t) => haystack.has(t)).length;
    const positionBias = -index * 0.001;
    const score = stackHits * 5 + positionBias;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  });

  return best;
}

function buildBrief(s: StarterListItem, description: string | null, whatYouGet: string[]): string {
  const parts: string[] = [`**${s.name}**\n\n${s.summary}`];
  if (description) parts.push(description);
  if (whatYouGet.length > 0) {
    parts.push(`What it provides:\n${whatYouGet.map((w) => `- ${w}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

/** DB-backed convenience: resolve the catalog, pick a match, build the candidate-safe fixture. */
export async function pickStarterFixtureFor(criteria: {
  primaryStack?: string | null;
}): Promise<PublicStarterFixture | null> {
  const starters = await listStarters();
  const match = pickBestStarterFixture(starters, criteria) ?? starters.find((s) => ELIGIBLE_TYPES.has(s.type)) ?? null;
  if (!match) return null;

  // listStarters() doesn't carry content/description (list-item shape) — fetch the one record
  // we picked to get its public whatYouGet/techStack/description for the brief.
  const full = await getStarter(match.id);

  return {
    starterId: match.id,
    starterName: match.name,
    starterSummary: match.summary,
    techStack: full?.content?.techStack ?? [],
    briefMarkdown: buildBrief(match, full?.description ?? null, full?.content?.whatYouGet ?? []),
    scenario: GENERIC_SCENARIO,
  };
}

export interface StarterFluencyScoreResult {
  status: DevSignalStageStatus;
  subScores: DevSignalSubScore[];
  flags: DevSignalFlag[];
}

const RUBRIC_KEYS = ["technical_understanding", "practical_judgment", "communication_clarity", "pattern_adherence"] as const;

const SYSTEM = [
  "You assess a developer candidate's written response to an 'extend/adapt this internal spec'",
  "task, for TECHNICAL SUBSTANCE and COMMUNICATION only.",
  "STRICT RULES: judge the response on its own technical merits. Do NOT reward length, confident",
  "tone, or buzzwords over substance. A short, precise, correct answer should score as high as a",
  "long one. Do NOT penalise non-native English phrasing — judge the technical content.",
  "Score each dimension 0-100: technical_understanding (did they grasp what the spec actually",
  "does), practical_judgment (is the proposed extension sound and scoped sensibly),",
  "communication_clarity (is the explanation easy to follow), pattern_adherence (does it respect",
  "the existing spec's conventions rather than ignoring them). Return ONLY JSON:",
  '{"technical_understanding":n,"practical_judgment":n,"communication_clarity":n,"pattern_adherence":n,"notes":"short note"}',
].join(" ");

function heuristicScores(response: string): DevSignalSubScore[] {
  const words = response.trim().split(/\s+/).filter(Boolean).length;
  const base = Math.min(65, Math.round((words / 150) * 65));
  return RUBRIC_KEYS.map((key) => ({
    key,
    label: key.replace(/_/g, " "),
    score: base,
    maxScore: 100,
    rationale: "Heuristic (no AI provider configured).",
  }));
}

function statusFromAverage(subScores: DevSignalSubScore[]): DevSignalStageStatus {
  const avg = subScores.reduce((s, x) => s + x.score, 0) / (subScores.length || 1);
  return avg >= 65 ? "PASS" : avg >= 45 ? "WARN" : "FAIL";
}

export async function scoreStarterFluencyResponse(args: {
  response: string;
  fixture: PublicStarterFixture;
  workspace: WorkspaceAiFields;
  workspaceId?: string;
}): Promise<StarterFluencyScoreResult> {
  const response = args.response.trim();
  if (!response) {
    return {
      status: "PENDING_HUMAN",
      subScores: [],
      flags: [{ severity: "warn", code: "empty_response", message: "No response submitted." }],
    };
  }

  const config = resolveAiConfig(args.workspace);
  if (!config.apiKey) {
    const subScores = heuristicScores(response);
    return {
      status: statusFromAverage(subScores),
      subScores,
      flags: [{ severity: "info", code: "heuristic_scoring", message: "Scored heuristically — no AI provider configured." }],
    };
  }

  try {
    const raw = await completeText({
      config,
      system: SYSTEM,
      user: `SPEC BRIEF:\n${args.fixture.briefMarkdown}\n\nSCENARIO:\n${args.fixture.scenario}\n\nCANDIDATE RESPONSE:\n${response}`,
      maxTokens: 400,
      tier: "standard",
      usageContext: args.workspaceId
        ? { module: "DEVSIGNAL", workspaceId: args.workspaceId, operation: "starterFluencyScoring" }
        : undefined,
    });
    const parsed = parseJsonObject<Record<string, unknown>>(raw);
    if (!parsed) throw new Error("Unparseable AI response");

    const subScores: DevSignalSubScore[] = RUBRIC_KEYS.map((key) => ({
      key,
      label: key.replace(/_/g, " "),
      score: Math.max(0, Math.min(100, Math.round(Number(parsed[key]) || 0))),
      maxScore: 100,
    }));

    return { status: statusFromAverage(subScores), subScores, flags: [] };
  } catch {
    const subScores = heuristicScores(response);
    return {
      status: statusFromAverage(subScores),
      subScores,
      flags: [{ severity: "info", code: "heuristic_fallback", message: "AI scoring failed; fell back to heuristic." }],
    };
  }
}
