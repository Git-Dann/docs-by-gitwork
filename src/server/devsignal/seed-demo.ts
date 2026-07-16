import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { buildDefaultConfigSnapshot } from "./config";
import { computeScore, type ScoringStageInput } from "./scoring";
import { buildClientFacingSummary } from "./best-match";
import { DEV_SIGNAL_STAGE_NAMES, type DevSignalStageId } from "./stages/types";

/**
 * Seeds a showcase set of DevSignal assessments so the dashboard demonstrates
 * its value end-to-end: a populated queue (proves search/filter/scale), a real
 * completion funnel, average score, one promoted-to-Code, and ~11 outcome-linked
 * scored assessments so the calibration flywheel leaves "insufficient" and shows
 * a real validity coefficient.
 *
 * Data is fabricated but flows through the REAL engine — computeScore() builds
 * each breakdown and buildClientFacingSummary() the label — so it behaves exactly
 * like production data. Candidates are EXTERNAL + unpublished (isolated from the
 * Code roster). Deterministic + idempotent; `clearDevSignalDemo` removes it all.
 */

interface Spec {
  name: string;
  handle: string;
  stack: string;
  years: number;
  status: "DRAFT" | "RUNNING" | "PENDING_HUMAN" | "COMPLETED";
  /** Per-stage 0–100 scores; presence = the stage was reached. */
  scores: Partial<Record<DevSignalStageId, number>>;
  decision?: "NONE" | "APPROVED_FOR_STAGING" | "APPROVED_FOR_CODE" | "REJECTED" | "NEEDS_MORE_INFO";
  promoted?: boolean;
  consent?: boolean;
  /** 1–5 client rating recorded as the delivery outcome (feeds calibration). */
  rating?: number;
  retained?: boolean;
}

/** Build a scored spec: coding + footprint drive quality, rating tracks it (with jitter). */
function scored(
  name: string,
  handle: string,
  stack: string,
  years: number,
  coding: number,
  footprint: number,
  interview: number,
  ratingJitter: number,
  opts: { promoted?: boolean; decision?: Spec["decision"] } = {},
): Spec {
  const scores: Spec["scores"] = {
    application_intake: 90,
    profile_connections: 80,
    coding_challenge: coding,
    online_footprint: footprint,
    video_assessment: Math.round((coding + interview) / 2),
    leadership_interview: interview,
    identity_verification: 100,
  };
  // Rating loosely tracks the strongest signals, with deterministic jitter so the
  // correlation is realistic (< 1), not a perfect artefact.
  const base = (coding * 0.5 + footprint * 0.3 + interview * 0.2) / 20; // ~1–5
  const rating = Math.max(1, Math.min(5, Math.round(base) + ratingJitter));
  return {
    name,
    handle,
    stack,
    years,
    status: "COMPLETED",
    scores,
    consent: true,
    decision: opts.decision ?? "APPROVED_FOR_STAGING",
    promoted: opts.promoted,
    rating,
    retained: rating >= 3,
  };
}

const SPECS: Spec[] = [
  scored("Amara Okafor", "amara-okafor", "TypeScript / Node", 7, 92, 88, 85, 0, { promoted: true, decision: "APPROVED_FOR_CODE" }),
  scored("Diego Martins", "diego-martins", "React / TypeScript", 5, 84, 79, 82, 1),
  scored("Mei Lin", "mei-lin-dev", "Python / Django", 8, 90, 86, 88, 0),
  scored("Tomasz Kowalski", "tomasz-kowalski", "Go / Postgres", 6, 78, 82, 74, -1),
  scored("Priya Nair", "priya-nair", "TypeScript / Next.js", 4, 71, 68, 70, 0),
  scored("Luca Bianchi", "luca-bianchi", "Node / AWS", 9, 88, 90, 91, 0),
  scored("Sofia Reyes", "sofia-reyes", "React / GraphQL", 3, 64, 60, 66, 1),
  scored("Kwame Mensah", "kwame-mensah", "Python / ML", 6, 81, 77, 79, -1),
  scored("Elena Petrova", "elena-petrova", "TypeScript / Node", 5, 76, 73, 80, 0),
  scored("Hiro Tanaka", "hiro-tanaka", "Go / Kubernetes", 10, 94, 92, 89, 0),
  scored("Fatima Al-Sayed", "fatima-alsayed", "React / TypeScript", 4, 69, 72, 65, 1, { decision: "NEEDS_MORE_INFO" }),
  // In-flight (no outcome yet) — populate the funnel + pending queue.
  {
    name: "Noah Williams",
    handle: "noah-williams",
    stack: "TypeScript / React",
    years: 5,
    status: "PENDING_HUMAN",
    consent: true,
    decision: "NONE",
    scores: { application_intake: 90, profile_connections: 80, coding_challenge: 74, online_footprint: 70, video_assessment: 72, identity_verification: 100 },
  },
  {
    name: "Ana Costa",
    handle: "ana-costa",
    stack: "Python / FastAPI",
    years: 3,
    status: "RUNNING",
    consent: true,
    decision: "NONE",
    scores: { application_intake: 88, profile_connections: 76, coding_challenge: 68 },
  },
  {
    name: "Sam Patel",
    handle: "sam-patel-dev",
    stack: "Node / TypeScript",
    years: 2,
    status: "DRAFT",
    consent: true,
    decision: "NONE",
    scores: { application_intake: 85 },
  },
];

export const DEMO_HANDLES = SPECS.map((s) => s.handle);

function statusForScore(score: number): "PASS" | "WARN" | "FAIL" {
  return score >= 70 ? "PASS" : score >= 40 ? "WARN" : "FAIL";
}

export async function seedDevSignalDemo(workspaceId: string): Promise<{ created: number; skipped: number }> {
  const config = buildDefaultConfigSnapshot();
  let created = 0;
  let skipped = 0;

  for (const spec of SPECS) {
    const candidate = await prisma.candidate.upsert({
      where: { workspaceId_githubHandle: { workspaceId, githubHandle: spec.handle } },
      update: {},
      create: {
        workspaceId,
        name: spec.name,
        githubHandle: spec.handle,
        email: `${spec.handle.replace(/[^a-z0-9]/g, ".")}@example.com`,
        primaryStack: spec.stack,
        techStacks: [spec.stack],
        signalSources: ["GITHUB"],
        origin: "EXTERNAL",
        published: Boolean(spec.promoted),
        status: spec.promoted ? "CODECLEAR_COMPLETE" : "SOURCED",
        yearsExperience: spec.years,
      },
      select: { id: true },
    });

    // Idempotent: one demo assessment per candidate.
    const existing = await prisma.devSignalAssessment.findFirst({
      where: { workspaceId, candidateId: candidate.id },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const stageInputs: ScoringStageInput[] = (Object.entries(spec.scores) as [DevSignalStageId, number][]).map(
      ([stageId, score]) => ({
        stageId,
        status: statusForScore(score),
        subScores: [{ key: "overall", label: "Overall", score, maxScore: 100 }],
      }),
    );

    const breakdown = computeScore(config, stageInputs);
    const summary = buildClientFacingSummary({ breakdown, promotedToCode: Boolean(spec.promoted) });
    const scoredNow = spec.status === "COMPLETED";

    const assessment = await prisma.devSignalAssessment.create({
      data: {
        workspaceId,
        candidateId: candidate.id,
        pipelineVersion: config.pipelineVersion,
        configVersion: config.version,
        configSnapshot: config as unknown as Prisma.InputJsonValue,
        status: spec.status,
        consent: spec.consent
          ? ({ noticeVersion: "v1", processing: true, humanReview: true, agreedAt: new Date().toISOString() } as Prisma.InputJsonValue)
          : Prisma.DbNull,
        finalScore: scoredNow ? breakdown.finalScore : null,
        scoreBreakdown: scoredNow ? (breakdown as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        bestMatchSummary: scoredNow ? (summary as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
        decision: spec.decision ?? "NONE",
        promotedToCode: Boolean(spec.promoted),
        promotedToCodeAt: spec.promoted ? new Date() : null,
        startedAt: new Date(),
        finishedAt: scoredNow ? new Date() : null,
      },
      select: { id: true },
    });

    // Stage results — power the funnel + the detail timeline.
    for (const [stageId, score] of Object.entries(spec.scores) as [DevSignalStageId, number][]) {
      await prisma.devSignalStageResult.create({
        data: {
          assessmentId: assessment.id,
          workspaceId,
          candidateId: candidate.id,
          stageId,
          stageName: DEV_SIGNAL_STAGE_NAMES[stageId],
          stageVersion: "seed-v1",
          status: statusForScore(score),
          weight: config.stages[stageId]?.weight ?? 0,
          subScores: [{ key: "overall", label: "Overall", score, maxScore: 100 }] as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Outcome link — the criterion the calibration flywheel correlates against.
    if (spec.rating) {
      await prisma.devSignalOutcomeLink.create({
        data: {
          workspaceId,
          assessmentId: assessment.id,
          candidateId: candidate.id,
          clientRating: spec.rating,
          retained: spec.retained ?? null,
          outcomeRecordedAt: new Date(),
          linkedAt: new Date(),
          source: "seed-demo",
        },
      });
    }

    created += 1;
  }

  return { created, skipped };
}

/** Remove everything the demo seeder created (by its deterministic handles). */
export async function clearDevSignalDemo(workspaceId: string): Promise<{ removed: number }> {
  const candidates = await prisma.candidate.findMany({
    where: { workspaceId, githubHandle: { in: DEMO_HANDLES }, origin: "EXTERNAL" },
    select: { id: true },
  });
  const ids = candidates.map((c) => c.id);
  if (ids.length === 0) return { removed: 0 };

  // Assessments (+ their stage results / outcome links / audit / data requests) cascade
  // on the assessment FK; delete assessments then the demo candidates.
  await prisma.devSignalAssessment.deleteMany({ where: { workspaceId, candidateId: { in: ids } } });
  const del = await prisma.candidate.deleteMany({ where: { id: { in: ids } } });
  return { removed: del.count };
}
