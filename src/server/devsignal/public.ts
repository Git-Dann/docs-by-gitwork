import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { PublicVetSession } from "@/types/devsignal";
import { defaultChallenge, getChallenge, toPublicChallenge } from "./challenges";
import { summarizeTelemetry, type TelemetryEvent } from "./telemetry";
import { evaluateChallenge } from "./challenge-eval";
import { scoreVideoTranscript } from "./video-scoring";
import { getTranscriptionProvider } from "./providers/transcription";
import { applyStageResult } from "./assessment";
import { DEV_SIGNAL_STAGE_NAMES, type DevSignalStageId } from "./stages/types";

/**
 * Public candidate flow (/vet/[token]). Token-gated, no auth. Returns ONLY safe
 * data — never scores, sub-scores, flags, or breakdowns. Candidate-supplied
 * stages (coding challenge, video) are scored server-side with config weights
 * the candidate can't influence.
 */

export const DEFAULT_VIDEO_QUESTION =
  "Tell us about a recent project you shipped: what problem it solved, the trickiest technical decision you made, and how you'd approach it differently next time.";

const INTAKE_FIELDS = [
  "name",
  "email",
  "location",
  "timezone",
  "primaryStack",
  "yearsExperience",
  "linkedinUrl",
  "portfolioUrl",
  "availability",
] as const;

type LoadedAssessment = Prisma.DevSignalAssessmentGetPayload<{
  include: {
    candidate: true;
    workspace: {
      select: {
        id: true;
        aiProvider: true;
        anthropicApiKey: true;
        anthropicModel: true;
        openaiApiKey: true;
        openaiModel: true;
        geminiApiKey: true;
        geminiModel: true;
        localLlmUrl: true;
        localLlmModel: true;
      };
    };
  };
}>;

async function loadByToken(token: string): Promise<LoadedAssessment | null> {
  return prisma.devSignalAssessment.findFirst({
    where: { publicToken: token },
    include: {
      candidate: true,
      workspace: {
        select: {
          id: true,
          aiProvider: true,
          anthropicApiKey: true,
          anthropicModel: true,
          openaiApiKey: true,
          openaiModel: true,
          geminiApiKey: true,
          geminiModel: true,
          localLlmUrl: true,
          localLlmModel: true,
        },
      },
    },
  });
}

function isExpired(a: LoadedAssessment): boolean {
  return Boolean(a.tokenExpiresAt && a.tokenExpiresAt.getTime() < Date.now());
}

async function buildSession(a: LoadedAssessment): Promise<PublicVetSession> {
  const stageRows = await prisma.devSignalStageResult.findMany({
    where: { assessmentId: a.id },
    select: { stageId: true },
  });
  const doneStages = new Set(stageRows.map((r) => r.stageId));
  const c = a.candidate;
  const challenge = defaultChallenge();

  return {
    token: a.publicToken ?? "",
    status: a.status,
    submitted: a.status !== "DRAFT" && a.status !== "RUNNING",
    candidate: {
      name: c.name,
      email: c.email,
      githubHandle: c.githubHandle,
      location: c.location,
      timezone: c.timezone,
      primaryStack: c.primaryStack,
      yearsExperience: c.yearsExperience,
      linkedinUrl: c.linkedinUrl,
      portfolioUrl: c.portfolioUrl,
      availability: c.availability,
    },
    githubConnected: Boolean(c.githubHandle && c.githubHandle.trim() && c.githubHandle !== "unknown"),
    challenge: toPublicChallenge(challenge),
    challengeSubmitted: doneStages.has("coding_challenge"),
    videoQuestion: DEFAULT_VIDEO_QUESTION,
    videoSubmitted: doneStages.has("video_assessment"),
    expired: isExpired(a),
  };
}

export async function getPublicSession(token: string): Promise<PublicVetSession | null> {
  const a = await loadByToken(token);
  if (!a) return null;
  return buildSession(a);
}

export async function autosaveIntake(
  token: string,
  patch: Record<string, unknown>,
): Promise<PublicVetSession | null> {
  const a = await loadByToken(token);
  if (!a || isExpired(a)) return null;

  const data: Record<string, unknown> = {};
  for (const field of INTAKE_FIELDS) {
    if (field in patch) {
      const value = patch[field];
      if (field === "yearsExperience") {
        const n = Number(value);
        data[field] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
      } else {
        data[field] = value === "" || value == null ? null : String(value);
      }
    }
  }
  if (Object.keys(data).length > 0) {
    await prisma.candidate.update({ where: { id: a.candidateId }, data });
  }
  const reloaded = await loadByToken(token);
  return reloaded ? buildSession(reloaded) : null;
}

export async function connectGithub(token: string, handle: string): Promise<PublicVetSession | null> {
  const a = await loadByToken(token);
  if (!a || isExpired(a)) return null;
  const clean = handle.trim().replace(/^@+/, "");
  if (clean) {
    await prisma.candidate.update({ where: { id: a.candidateId }, data: { githubHandle: clean } });
  }
  const reloaded = await loadByToken(token);
  return reloaded ? buildSession(reloaded) : null;
}

export interface ChallengeSubmission {
  challengeId: string;
  code: string;
  testsPassed: number;
  testsTotal: number;
  timeTakenSec: number;
  telemetry: TelemetryEvent[];
}

export async function submitChallenge(
  token: string,
  submission: ChallengeSubmission,
): Promise<{ ok: boolean }> {
  const a = await loadByToken(token);
  if (!a || isExpired(a)) return { ok: false };

  const challenge = getChallenge(submission.challengeId) ?? defaultChallenge();
  const telemetry = summarizeTelemetry(submission.telemetry ?? []);
  const evalResult = evaluateChallenge({
    testsPassed: submission.testsPassed,
    testsTotal: submission.testsTotal || challenge.tests.length,
    timeTakenSec: submission.timeTakenSec,
    timeLimitSec: challenge.timeLimitSec,
    telemetry,
  });

  const stageId: DevSignalStageId = "coding_challenge";
  await applyStageResult(a.workspace.id, a.id, {
    stageId,
    stageName: DEV_SIGNAL_STAGE_NAMES[stageId],
    stageVersion: "challenge-v1",
    status: evalResult.status,
    weight: 0,
    subScores: evalResult.subScores,
    // Store the code + telemetry summary for the reviewer; never the raw keystroke stream.
    rawSignals: { challengeId: challenge.id, code: submission.code, telemetry },
    evidence: [{ type: "challenge", label: challenge.title, sourceRef: challenge.id }],
    flags: evalResult.flags,
    durationMs: submission.timeTakenSec * 1000,
  });
  return { ok: true };
}

export interface VideoSubmission {
  /** Base64-encoded audio, transcribed then discarded. */
  audioBase64?: string;
  mimeType?: string;
  /** Optional client-provided transcript (used if no server STT is configured). */
  transcript?: string;
  /** Candidate consent to retain the transcript text. */
  consentRetainTranscript: boolean;
}

export async function submitVideo(token: string, submission: VideoSubmission): Promise<{ ok: boolean }> {
  const a = await loadByToken(token);
  if (!a || isExpired(a)) return { ok: false };

  // 1) Obtain a transcript. Audio is transcribed then DISCARDED — never stored.
  let transcript = submission.transcript?.trim() ?? "";
  if (!transcript && submission.audioBase64) {
    const provider = getTranscriptionProvider();
    if (provider.name !== "mock") {
      try {
        const data = Uint8Array.from(Buffer.from(submission.audioBase64, "base64"));
        const result = await provider.transcribe({ data, mimeType: submission.mimeType ?? "audio/webm" });
        transcript = result.transcript.trim();
      } catch {
        transcript = "";
      }
    }
  }

  const stageId: DevSignalStageId = "video_assessment";
  const base = {
    stageId,
    stageName: DEV_SIGNAL_STAGE_NAMES[stageId],
    stageVersion: "video-v1",
    weight: 0,
    evidence: [],
  };

  if (!transcript) {
    // No transcript (no STT configured) → flag for manual transcription, don't fake a score.
    await applyStageResult(a.workspace.id, a.id, {
      ...base,
      status: "PENDING_HUMAN",
      subScores: [],
      rawSignals: { note: "Audio received; no transcript (server STT not configured)." },
      flags: [{ severity: "warn", code: "transcription_unavailable", message: "Manual transcription required." }],
    });
    return { ok: true };
  }

  const scored = await scoreVideoTranscript({
    transcript,
    question: DEFAULT_VIDEO_QUESTION,
    workspace: a.workspace,
  });

  // Retention: keep the transcript only with consent; otherwise a hash + word count.
  const rawSignals = submission.consentRetainTranscript
    ? { transcript, advisory: scored.advisory }
    : {
        transcriptHash: createHash("sha256").update(transcript).digest("hex"),
        wordCount: transcript.split(/\s+/).filter(Boolean).length,
        advisory: scored.advisory,
      };

  await applyStageResult(a.workspace.id, a.id, {
    ...base,
    status: scored.status,
    subScores: scored.subScores,
    rawSignals,
    flags: scored.flags,
  });
  return { ok: true };
}
