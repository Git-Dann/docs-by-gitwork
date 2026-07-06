import type { DevSignalStageStatus } from "@prisma/client";
import { completeText, parseJsonObject, resolveAiConfig, type WorkspaceAiFields } from "@/server/ai-provider";
import type { DevSignalFlag, DevSignalSubScore } from "./stages/types";

/**
 * Video assessment scoring — CONTENT + communication STRUCTURE only. Hard
 * fairness rule (spec Stage 3): the model must NOT assess accent, emotion,
 * facial cues, personality, native-speaker status, or neurodiversity, and must
 * not reward "native-sounding" speech. Tone/sentiment is advisory metadata with
 * ZERO scoring weight. If no AI key is configured, we fall back to a
 * conservative heuristic and flag it — never a black box.
 */

export interface VideoScoreResult {
  status: DevSignalStageStatus;
  subScores: DevSignalSubScore[];
  flags: DevSignalFlag[];
  /** Advisory-only; deliberately not part of the weighted sub-scores. */
  advisory: { toneNote?: string };
}

const RUBRIC_KEYS = ["completeness", "role_relevance", "specificity", "clarity", "structure"] as const;

const SYSTEM = [
  "You assess a developer's recorded answer from its TRANSCRIPT, for CONTENT and",
  "COMMUNICATION STRUCTURE only.",
  "STRICT RULES: Do NOT assess or infer accent, pronunciation, emotion, tone,",
  "personality, gender, ethnicity, age, native-speaker status, or neurodiversity.",
  "Do NOT reward fluent/native-sounding phrasing. Judge the substance regardless",
  "of accent or phrasing. Non-native speakers with clear content must score just",
  "as highly.",
  "Score each dimension 0-100: completeness, role_relevance, specificity, clarity,",
  "structure. Return ONLY JSON:",
  '{"completeness":n,"role_relevance":n,"specificity":n,"clarity":n,"structure":n,"notes":"short content note"}',
].join(" ");

function heuristicScores(transcript: string): DevSignalSubScore[] {
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  // Very rough: more substance → higher, capped conservatively.
  const base = Math.min(70, Math.round((words / 200) * 70));
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

export async function scoreVideoTranscript(args: {
  transcript: string;
  question: string;
  workspace: WorkspaceAiFields;
}): Promise<VideoScoreResult> {
  const transcript = args.transcript.trim();
  if (!transcript) {
    return {
      status: "PENDING_HUMAN",
      subScores: [],
      flags: [{ severity: "warn", code: "empty_transcript", message: "No transcript to score." }],
      advisory: {},
    };
  }

  const config = resolveAiConfig(args.workspace);
  if (!config.apiKey) {
    const subScores = heuristicScores(transcript);
    return {
      status: statusFromAverage(subScores),
      subScores,
      flags: [{ severity: "info", code: "heuristic_scoring", message: "Scored heuristically — no AI provider configured." }],
      advisory: {},
    };
  }

  try {
    const raw = await completeText({
      config,
      system: SYSTEM,
      user: `QUESTION:\n${args.question}\n\nTRANSCRIPT:\n${transcript}`,
      maxTokens: 400,
      tier: "standard",
    });
    const parsed = parseJsonObject<Record<string, unknown>>(raw);
    if (!parsed) throw new Error("Unparseable AI response");

    const subScores: DevSignalSubScore[] = RUBRIC_KEYS.map((key) => ({
      key,
      label: key.replace(/_/g, " "),
      score: Math.max(0, Math.min(100, Math.round(Number(parsed[key]) || 0))),
      maxScore: 100,
    }));

    return {
      status: statusFromAverage(subScores),
      subScores,
      flags: [],
      advisory: { toneNote: typeof parsed.notes === "string" ? parsed.notes : undefined },
    };
  } catch {
    const subScores = heuristicScores(transcript);
    return {
      status: statusFromAverage(subScores),
      subScores,
      flags: [{ severity: "info", code: "heuristic_fallback", message: "AI scoring failed; fell back to heuristic." }],
      advisory: {},
    };
  }
}
