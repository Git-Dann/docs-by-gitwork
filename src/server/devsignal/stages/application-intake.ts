import { prisma } from "@/lib/prisma";
import type {
  DevSignalStageContext,
  DevSignalStageResultInput,
  DevSignalStageRunner,
  DevSignalFlag,
} from "./types";
import { DEV_SIGNAL_STAGE_NAMES } from "./types";

/**
 * Stage 1 — application intake. Scores the completeness + eligibility of the
 * candidate's application from the staging Candidate record, and flags
 * duplicates. Real (not a commodity integration): no external calls, just a
 * data-quality pass over what we hold. Stores no extra personal data.
 */

const REQUIRED_FIELDS = ["name", "email", "githubHandle", "primaryStack"] as const;
const OPTIONAL_FIELDS = ["location", "timezone", "yearsExperience", "availability", "linkedinUrl"] as const;

export const applicationIntakeRunner: DevSignalStageRunner = {
  stageId: "application_intake",
  stageName: DEV_SIGNAL_STAGE_NAMES.application_intake,
  stageVersion: "intake-v1",

  async run(context: DevSignalStageContext): Promise<DevSignalStageResultInput> {
    const started = Date.now();
    const base = {
      stageId: "application_intake" as const,
      stageName: DEV_SIGNAL_STAGE_NAMES.application_intake,
      stageVersion: "intake-v1",
    };

    const candidate = await prisma.candidate.findFirst({
      where: { id: context.candidateId, workspaceId: context.workspaceId },
      select: {
        name: true,
        email: true,
        githubHandle: true,
        primaryStack: true,
        location: true,
        timezone: true,
        yearsExperience: true,
        availability: true,
        linkedinUrl: true,
      },
    });

    if (!candidate) {
      return {
        ...base,
        status: "ERROR",
        weight: 0,
        subScores: [],
        rawSignals: null,
        evidence: [],
        flags: [{ severity: "warn", code: "candidate_missing", message: "Candidate not found." }],
        durationMs: Date.now() - started,
      };
    }

    const has = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
    const record = candidate as Record<string, unknown>;
    const missingRequired = REQUIRED_FIELDS.filter((f) => !has(record[f]));
    const filledOptional = OPTIONAL_FIELDS.filter((f) => has(record[f])).length;

    // Completeness = required (weighted) + optional coverage.
    const requiredScore = ((REQUIRED_FIELDS.length - missingRequired.length) / REQUIRED_FIELDS.length) * 70;
    const optionalScore = (filledOptional / OPTIONAL_FIELDS.length) * 30;
    const completeness = Math.round(requiredScore + optionalScore);
    const eligible = has(candidate.email) && has(candidate.githubHandle);

    // Duplicate detection: another candidate sharing this handle or email.
    const duplicate = await prisma.candidate.findFirst({
      where: {
        workspaceId: context.workspaceId,
        id: { not: context.candidateId },
        OR: [
          { githubHandle: candidate.githubHandle },
          ...(candidate.email ? [{ email: candidate.email }] : []),
        ],
      },
      select: { id: true },
    });

    const flags: DevSignalFlag[] = [];
    if (missingRequired.length > 0) {
      flags.push({
        severity: "warn",
        code: "missing_required_fields",
        message: `Missing: ${missingRequired.join(", ")}`,
      });
    }
    if (duplicate) {
      flags.push({ severity: "warn", code: "possible_duplicate", message: "A candidate with this handle/email already exists." });
    }
    flags.push({ severity: "info", code: "consent_not_captured", message: "Structured consent record not yet captured." });

    const status = !eligible ? "FAIL" : completeness >= 60 ? "PASS" : "WARN";

    return {
      ...base,
      status,
      weight: 0,
      subScores: [
        { key: "completeness", label: "Data completeness", score: completeness, maxScore: 100 },
        { key: "eligibility", label: "Eligibility", score: eligible ? 100 : 0, maxScore: 100 },
      ],
      rawSignals: { missingRequired, filledOptional, eligible, duplicate: Boolean(duplicate) },
      evidence: [{ type: "candidate", label: "Application record", sourceRef: context.candidateId }],
      flags,
      durationMs: Date.now() - started,
    };
  },
};
