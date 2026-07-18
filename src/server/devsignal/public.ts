import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { PublicVetSession } from "@/types/devsignal";
import { defaultChallenge, toPublicChallenge } from "./challenges";
import { getChallengeBySlug, pickChallengeFor } from "./challenge-store";
import { summarizeTelemetry, type TelemetryEvent } from "./telemetry";
import { evaluateChallenge } from "./challenge-eval";
import { scoreVideoTranscript } from "./video-scoring";
import { pickStarterFixtureFor, scoreStarterFluencyResponse } from "./starter-fluency";
import { getTranscriptionProvider } from "./providers/transcription";
import { MockIdentityProvider } from "./providers/identity/mock";
import { applyStageResult } from "./assessment";
import { DEV_SIGNAL_STAGE_NAMES, type DevSignalStageId } from "./stages/types";
import { safeGithubRequest } from "@/lib/github";
import { isAtLeast } from "@/types/auth";
import { sendWorkspaceEmail, escapeHtml } from "@/server/email";
import { type DataRequestType, DATA_REQUEST_LABELS } from "@/lib/devsignal/processing-notice";
import { getActiveNotice } from "./notice-store";

/** Does this GitHub username resolve to a real public account? */
export async function githubUserExists(handle: string): Promise<boolean> {
  const clean = handle.trim().replace(/^@+/, "");
  if (!clean) return false;
  const user = await safeGithubRequest<{ login?: string } | null>(
    `/users/${encodeURIComponent(clean)}`,
    null,
  );
  return Boolean(user?.login);
}

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

interface ConsentRecord {
  noticeVersion: string;
  processing: boolean;
  humanReview: boolean;
  transcriptRetention?: boolean;
  agreedAt: string;
}

/** Has the candidate accepted the (required) processing consents? */
function hasConsent(a: LoadedAssessment): boolean {
  const c = a.consent as ConsentRecord | null;
  return Boolean(c?.processing && c?.humanReview);
}

/** Guard every candidate-supplied write: no processing without recorded consent. */
function assertConsent(a: LoadedAssessment): void {
  if (!hasConsent(a)) {
    throw new Error("Please accept the processing notice before continuing.");
  }
}

async function buildSession(a: LoadedAssessment): Promise<PublicVetSession> {
  const stageRows = await prisma.devSignalStageResult.findMany({
    where: { assessmentId: a.id },
    select: { stageId: true },
  });
  const doneStages = new Set(stageRows.map((r) => r.stageId));
  const c = a.candidate;
  const notice = await getActiveNotice(a.workspace.id);
  // Serve the challenge that best matches what the candidate declared, not one
  // default task for everyone. Deterministic; falls back to the first active one.
  const challenge = await pickChallengeFor(a.workspace.id, {
    primaryStack: c.primaryStack,
    yearsExperience: c.yearsExperience,
  });
  // Same idea for the Starter Fluency fixture — deterministic on the candidate's declared stack,
  // so re-picking on every session load (same pattern as `challenge` above) still lands on the
  // same starter across reloads rather than needing separate persistence.
  const starterFixture = await pickStarterFixtureFor({ primaryStack: c.primaryStack });

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
    consentGiven: hasConsent(a),
    notice: { version: notice.version, ...notice.content },
    githubConnected: Boolean(c.githubHandle && c.githubHandle.trim() && c.githubHandle !== "unknown"),
    challenge: toPublicChallenge(challenge),
    challengeSubmitted: doneStages.has("coding_challenge"),
    starterFixture,
    starterFluencySubmitted: doneStages.has("starter_fluency"),
    videoQuestion: DEFAULT_VIDEO_QUESTION,
    videoSubmitted: doneStages.has("video_assessment"),
    identitySubmitted: doneStages.has("identity_verification"),
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
  assertConsent(a);

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
  assertConsent(a);
  const clean = handle.trim().replace(/^@+/, "");
  if (!clean) throw new Error("Enter your GitHub username.");
  // Validate the account actually exists before saving — real per-step validation.
  if (!(await githubUserExists(clean))) {
    throw new Error(`We couldn't find a GitHub user named "${clean}". Check the spelling.`);
  }
  await prisma.candidate.update({ where: { id: a.candidateId }, data: { githubHandle: clean } });
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
  assertConsent(a);

  const challenge = (await getChallengeBySlug(a.workspace.id, submission.challengeId)) ?? defaultChallenge();
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

export interface StarterFluencySubmission {
  starterId: string;
  response: string;
}

export async function submitStarterFluency(
  token: string,
  submission: StarterFluencySubmission,
): Promise<{ ok: boolean }> {
  const a = await loadByToken(token);
  if (!a || isExpired(a)) return { ok: false };
  assertConsent(a);

  const fixture = await pickStarterFixtureFor({ primaryStack: a.candidate.primaryStack });
  if (!fixture) return { ok: false };

  const scored = await scoreStarterFluencyResponse({
    response: submission.response,
    fixture,
    workspace: a.workspace,
    workspaceId: a.workspace.id,
  });

  const stageId: DevSignalStageId = "starter_fluency";
  await applyStageResult(a.workspace.id, a.id, {
    stageId,
    stageName: DEV_SIGNAL_STAGE_NAMES[stageId],
    stageVersion: "starter-fluency-v1",
    status: scored.status,
    weight: 0,
    subScores: scored.subScores,
    rawSignals: { starterId: fixture.starterId, starterName: fixture.starterName, response: submission.response },
    evidence: [{ type: "starter", label: fixture.starterName, sourceRef: fixture.starterId }],
    flags: scored.flags,
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
  assertConsent(a);

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
    workspaceId: a.workspace.id,
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

/**
 * Identity verification (stage 6). Uses the IdentityVerificationProvider
 * abstraction. Today only the mock is wired (no Stripe keys) — it records a
 * PENDING_HUMAN result so nothing is faked; a real Stripe Identity provider
 * slots in behind the same interface. NO raw ID documents are ever stored.
 */
export async function submitIdentity(token: string): Promise<{ ok: boolean }> {
  const a = await loadByToken(token);
  if (!a || isExpired(a)) return { ok: false };
  assertConsent(a);

  const provider = new MockIdentityProvider();
  const result = await provider.verify({ candidateId: a.candidateId, email: a.candidate.email });

  const stageId: DevSignalStageId = "identity_verification";
  // Mock provider isn't real verification → keep it advisory + flag for a human.
  await applyStageResult(a.workspace.id, a.id, {
    stageId,
    stageName: DEV_SIGNAL_STAGE_NAMES[stageId],
    stageVersion: `${result.provider}-v1`,
    status: "PENDING_HUMAN",
    weight: 0,
    subScores: [],
    // Store ONLY provider ref + status — never document data.
    rawSignals: { provider: result.provider, verificationId: result.verificationId, status: result.status },
    evidence: [],
    flags: [
      { severity: "info", code: "identity_mock", message: "Identity provider is mock — verify manually until Stripe Identity is wired." },
    ],
  });
  return { ok: true };
}

// ─── consent + data-rights (GDPR) ─────────────────────────────────────────────

export interface ConsentSubmission {
  processing: boolean;
  humanReview: boolean;
}

/**
 * Record the candidate's consent to processing BEFORE any of their data is
 * handled. Both consents are required; stamps the notice version so we know
 * exactly what they agreed to.
 */
export async function recordConsent(
  token: string,
  submission: ConsentSubmission,
): Promise<PublicVetSession | null> {
  const a = await loadByToken(token);
  if (!a || isExpired(a)) return null;
  if (!submission.processing || !submission.humanReview) {
    throw new Error("Both consents are required to continue.");
  }
  // Stamp the version the candidate actually saw (the active notice at consent time).
  const active = await getActiveNotice(a.workspace.id);
  const record: ConsentRecord = {
    noticeVersion: active.version,
    processing: true,
    humanReview: true,
    agreedAt: new Date().toISOString(),
  };
  await prisma.devSignalAssessment.update({
    where: { id: a.id },
    data: { consent: record as unknown as Prisma.InputJsonValue },
  });
  const reloaded = await loadByToken(token);
  return reloaded ? buildSession(reloaded) : null;
}

/**
 * Candidate-initiated data-rights request (explanation / appeal / erasure). We
 * LOG it and notify the workspace admins — we never auto-delete; erasure is a
 * human-actioned workflow so nothing irreversible happens automatically.
 */
export async function createDataRequest(
  token: string,
  input: { type: DataRequestType; message?: string },
): Promise<{ ok: boolean }> {
  const a = await loadByToken(token);
  if (!a || isExpired(a)) return { ok: false };

  await prisma.devSignalDataRequest.create({
    data: {
      workspaceId: a.workspace.id,
      assessmentId: a.id,
      candidateId: a.candidateId,
      type: input.type,
      message: input.message?.slice(0, 4000) ?? null,
      status: "OPEN",
    },
  });

  void notifyAdminsOfDataRequest(a, input.type, input.message).catch(() => {});
  return { ok: true };
}

async function notifyAdminsOfDataRequest(
  a: LoadedAssessment,
  type: DataRequestType,
  message?: string,
): Promise<void> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: a.workspace.id },
    include: { user: { select: { email: true } } },
  });
  const recipients = members
    .filter((m) => isAtLeast(m.role, "ADMIN"))
    .map((m) => m.user.email)
    .filter(Boolean);
  if (recipients.length === 0) return;

  const label = DATA_REQUEST_LABELS[type];
  await Promise.all(
    recipients.map((to) =>
      sendWorkspaceEmail({
        workspaceId: a.workspace.id,
        to,
        subject: `DevSignal data request — ${label}`,
        html: [
          `<p>A candidate has submitted a data-rights request via DevSignal.</p>`,
          `<p><strong>Candidate:</strong> ${escapeHtml(a.candidate.name)} (${escapeHtml(a.candidate.email ?? "no email")})</p>`,
          `<p><strong>Request:</strong> ${escapeHtml(label)}</p>`,
          message ? `<p><strong>Their note:</strong> ${escapeHtml(message)}</p>` : "",
          `<p>Action it in DevSignal → the candidate's assessment.</p>`,
        ].join(""),
      }).catch(() => ({ ok: false }) as unknown),
    ),
  );
}
