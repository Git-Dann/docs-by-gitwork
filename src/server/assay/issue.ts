// Assay — the persistence layer. The only file here that touches Prisma; everything the
// verdict depends on lives in the pure modules (evaluate/lapse/digest) so it stays testable.

import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CheckConfidence } from "@/server/pulse-checks/confidence";
import { computeDigest, computeSeal } from "./digest";
import { evaluateStandard, type AssayCheckEvidence } from "./evaluate";
import { expiryFor, hallmarkStatus } from "./lapse";
import { DEFAULT_STANDARD_ID, getStandard } from "./standard";
import type {
  AssayBlindSpot,
  AssayResult,
  AttestationPayload,
  ClauseOutcome,
  HallmarkGrade,
  HallmarkRecord,
} from "./types";

/** 32 bytes of entropy — the certificate URL's only credential. Matches the Docs pattern. */
function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Build the payload the digest and seal are computed over.
 *
 * Clauses are reduced to `{clauseId, verdict}` and sorted by id: the payload must be a
 * stable function of the *verdict*, not of prose. Rationale text is presentation — if it
 * were included, an innocuous wording change to a rationale would invalidate the seal on
 * every mark ever issued.
 */
export function buildPayload(input: {
  hallmarkId: string;
  issuedAt: Date;
  expiresAt: Date;
  issuerName: string;
  subjectName: string;
  subjectRepo: string | null;
  subjectCommit: string | null;
  subjectUrl: string | null;
  standardId: string;
  standardVersion: string;
  grade: HallmarkGrade;
  clauses: ClauseOutcome[];
  blindSpots: AssayBlindSpot[];
  scanId: string;
  scanVersion: string;
  checkCount: number;
}): AttestationPayload {
  return {
    payloadVersion: 1,
    hallmarkId: input.hallmarkId,
    issuedAt: input.issuedAt.toISOString(),
    issuer: input.issuerName,
    subject: {
      name: input.subjectName,
      repo: input.subjectRepo,
      commit: input.subjectCommit,
      url: input.subjectUrl,
    },
    standardId: input.standardId,
    standardVersion: input.standardVersion,
    grade: input.grade,
    expiresAt: input.expiresAt.toISOString(),
    clauses: input.clauses
      .map((c) => ({ clauseId: c.clauseId, verdict: c.verdict }))
      .sort((a, b) => (a.clauseId < b.clauseId ? -1 : a.clauseId > b.clauseId ? 1 : 0)),
    // Kinds only, de-duplicated and sorted. The statements are generated prose; the KINDS
    // are the claim about what was not established, and that is what must be sealed.
    blindSpotKinds: [...new Set(input.blindSpots.map((b) => b.kind))].sort(),
    evidence: { scanId: input.scanId, scanVersion: input.scanVersion, checkCount: input.checkCount },
  };
}

/**
 * `PulseScanCheck.confidence` is a plain `String?` column, not the enum, so an unrecognised
 * value is possible (an older row, or a future confidence tier). It is mapped to `null`,
 * which the engine reads as MEDIUM — the conservative direction here, because MEDIUM counts
 * as proof and can therefore FAIL a clause. Silently treating an unknown value as LOW would
 * let a genuine failure be downgraded to "not established" and pass a critical clause.
 */
function narrowConfidence(value: string | null): CheckConfidence | null {
  return value === "HIGH" || value === "MEDIUM" || value === "LOW" ? value : null;
}

export class AssayError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Assay a completed Pulse scan and issue a hallmark against it.
 *
 * Refuses an incomplete scan outright. Attesting on partial evidence is the exact mistake
 * this product exists to prevent, and a `RUNNING` scan's checks are still arriving — a mark
 * issued mid-scan would say "not established" about clauses that were about to pass.
 */
export async function issueHallmark(input: {
  workspaceId: string;
  scanId: string;
  standardId?: string;
  issuerName: string;
}): Promise<HallmarkRecord> {
  const standard = getStandard(input.standardId ?? DEFAULT_STANDARD_ID);
  if (!standard) throw new AssayError(`Unknown standard "${input.standardId}".`, 400);

  const scan = await prisma.pulseScan.findFirst({
    where: { id: input.scanId, workspaceId: input.workspaceId },
    include: {
      checks: { select: { checkKey: true, status: true, confidence: true, detail: true } },
      client: { select: { id: true, name: true } },
    },
  });
  if (!scan) throw new AssayError("Scan not found in this workspace.", 404);
  if (scan.status !== "COMPLETED") {
    throw new AssayError(
      `This scan is ${scan.status.toLowerCase()}. A hallmark can only be issued from a completed ` +
        `assay — issuing from a partial one would report clauses as unestablished that were still being checked.`,
      409,
    );
  }
  if (scan.checks.length === 0) {
    throw new AssayError("This scan recorded no checks, so there is nothing to attest to.", 409);
  }

  const evidence: AssayCheckEvidence[] = scan.checks.map((c) => ({
    checkKey: c.checkKey,
    status: c.status,
    confidence: narrowConfidence(c.confidence),
    detail: c.detail,
  }));
  const result = evaluateStandard(evidence, standard);

  const issuedAt = new Date();
  const expiresAt = expiryFor(issuedAt, standard.id, result.grade);
  const token = mintToken();

  // The digest covers the hallmark's own id, so the row is created first and then patched
  // with digest + seal. Both are written in one transaction with the supersession update,
  // so a reader can never see a mark with an empty digest or two live marks for a subject.
  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.hallmark.create({
      data: {
        workspaceId: input.workspaceId,
        clientId: scan.client?.id ?? null,
        subjectName: scan.projectName,
        subjectRepo: scan.inputGithubRepo,
        // No commit pinning yet — see docs/assay.md "Deferred". Recorded as null rather
        // than guessed, so the certificate does not imply a precision we do not have.
        subjectCommit: null,
        subjectUrl: scan.inputUrl,
        scanId: scan.id,
        scanVersion: scan.scanVersion,
        checkCount: scan.checks.length,
        standardId: standard.id,
        standardVersion: standard.version,
        grade: result.grade,
        gradeReason: result.gradeReason,
        clauses: result.clauses as unknown as Prisma.InputJsonValue,
        blindSpots: result.blindSpots as unknown as Prisma.InputJsonValue,
        coverage: result.coverage as unknown as Prisma.InputJsonValue,
        issuerName: input.issuerName,
        issuedAt,
        expiresAt,
        digest: "",
        token,
      },
    });

    const payload = buildPayload({
      hallmarkId: row.id,
      issuedAt,
      expiresAt,
      issuerName: input.issuerName,
      subjectName: row.subjectName,
      subjectRepo: row.subjectRepo,
      subjectCommit: row.subjectCommit,
      subjectUrl: row.subjectUrl,
      standardId: standard.id,
      standardVersion: standard.version,
      grade: result.grade,
      clauses: result.clauses,
      blindSpots: result.blindSpots,
      scanId: scan.id,
      scanVersion: scan.scanVersion,
      checkCount: scan.checks.length,
    });

    // Supersede the previous live mark for the same subject. Scoped to marks that are still
    // asserting: re-pointing an already-lapsed or revoked mark would overwrite the more
    // specific reason it stopped counting.
    await tx.hallmark.updateMany({
      where: {
        workspaceId: input.workspaceId,
        subjectName: row.subjectName,
        id: { not: row.id },
        revokedAt: null,
        supersededById: null,
        expiresAt: { gt: issuedAt },
      },
      data: { supersededById: row.id },
    });

    return tx.hallmark.update({
      where: { id: row.id },
      data: { digest: computeDigest(payload), seal: computeSeal(payload) },
    });
  });

  return serializeHallmark({ ...created, client: scan.client ?? null });
}

type HallmarkRow = Prisma.HallmarkGetPayload<{ include: { client: { select: { id: true; name: true } } } }>;

export function serializeHallmark(row: HallmarkRow, now: Date = new Date()): HallmarkRecord {
  const { status, daysRemaining } = hallmarkStatus(
    { expiresAt: row.expiresAt, revokedAt: row.revokedAt, supersededById: row.supersededById },
    now,
  );
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    clientId: row.clientId,
    clientName: row.client?.name ?? null,
    subjectName: row.subjectName,
    subjectRepo: row.subjectRepo,
    subjectCommit: row.subjectCommit,
    subjectUrl: row.subjectUrl,
    scanId: row.scanId,
    scanVersion: row.scanVersion,
    checkCount: row.checkCount,
    standardId: row.standardId,
    standardVersion: row.standardVersion,
    grade: row.grade,
    gradeReason: row.gradeReason,
    clauses: (row.clauses as unknown as ClauseOutcome[]) ?? [],
    blindSpots: (row.blindSpots as unknown as AssayBlindSpot[]) ?? [],
    coverage: (row.coverage as unknown as AssayResult["coverage"]) ?? {
      measured: 0,
      unmeasured: 0,
      total: 0,
      pct: 0,
    },
    issuerName: row.issuerName,
    issuedAt: row.issuedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revokedReason: row.revokedReason,
    supersededById: row.supersededById,
    digest: row.digest,
    seal: row.seal,
    token: row.token,
    status,
    daysRemaining,
  };
}

const withClient = { client: { select: { id: true, name: true } } } as const;

export async function listHallmarks(workspaceId: string, limit = 50): Promise<HallmarkRecord[]> {
  const rows = await prisma.hallmark.findMany({
    where: { workspaceId },
    include: withClient,
    orderBy: { issuedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  });
  const now = new Date();
  return rows.map((r) => serializeHallmark(r, now));
}

export async function getHallmark(workspaceId: string, id: string): Promise<HallmarkRecord | null> {
  const row = await prisma.hallmark.findFirst({ where: { id, workspaceId }, include: withClient });
  return row ? serializeHallmark(row) : null;
}

/** Public lookup by token. No workspace scope — the token IS the credential. */
export async function getHallmarkByToken(token: string): Promise<HallmarkRecord | null> {
  const row = await prisma.hallmark.findUnique({ where: { token }, include: withClient });
  return row ? serializeHallmark(row) : null;
}

/**
 * Withdraw a mark. Never deletes: the row stays publicly resolvable and reports REVOKED,
 * so whoever holds the certificate link finds out. Idempotent — re-revoking keeps the
 * original timestamp and reason rather than rewriting the record of when it happened.
 */
export async function revokeHallmark(input: {
  workspaceId: string;
  id: string;
  reason: string;
  byName: string;
}): Promise<HallmarkRecord> {
  const existing = await prisma.hallmark.findFirst({
    where: { id: input.id, workspaceId: input.workspaceId },
    include: withClient,
  });
  if (!existing) throw new AssayError("Hallmark not found in this workspace.", 404);
  if (existing.revokedAt) return serializeHallmark(existing);

  const updated = await prisma.hallmark.update({
    where: { id: existing.id },
    data: { revokedAt: new Date(), revokedReason: input.reason, revokedByName: input.byName },
    include: withClient,
  });
  return serializeHallmark(updated);
}
