// Assay — the attestation layer. Types shared by the pure engine, the DB layer, the
// API and the public certificate page.
//
// The distinction that drives every shape here: a Pulse scan is a REPORT (for the person
// who owns the software), and a Countermark is an ATTESTATION (for a counterparty who does
// not own it and cannot read code — a client accepting handover, an insurer, an acquirer,
// a procurement officer). A report may be provisional and may be re-read later. An
// attestation must be frozen, self-describing, and honest about its own limits, because
// somebody is going to rely on it in a transaction.

import type { CheckConfidence } from "@/server/pulse-checks/confidence";

/** What a single clause of a standard resolved to on the evidence available. */
export type ClauseVerdict =
  /** Every covering check passed. */
  | "MET"
  /** At least one covering check warned, none failed provably. */
  | "QUALIFIED"
  /** At least one covering check failed at HIGH or MEDIUM confidence. */
  | "FAILED"
  /**
   * The evidence does not support a verdict either way: no covering check ran, or the
   * only adverse signal was LOW confidence. NOT a pass and NOT a failure — the whole
   * reason this product can be relied on is that it says so.
   */
  | "UNPROVEN"
  /** The clause does not apply to this kind of artifact (every covering check SKIPPED). */
  | "NOT_APPLICABLE";

/** The overall grade struck onto the countermark. */
export type CountermarkGrade =
  /** Every critical clause MET, nothing failed, nothing qualified. */
  | "CERTIFIED"
  /** Nothing critical failed, but there are qualified or non-critical failed clauses. */
  | "CONDITIONAL"
  /** At least one critical clause provably FAILED. */
  | "NOT_CERTIFIED"
  /**
   * At least one critical clause is UNPROVEN. Deliberately distinct from NOT_CERTIFIED:
   * "we could not check this" and "this is broken" are different facts with different
   * fixes, and conflating them is the defect this whole product exists to avoid
   * (CLAUDE.md §35 — a failed lookup must never read as an absence).
   */
  | "INCOMPLETE";

/** Validity of an issued countermark at a point in time. */
export type CountermarkStatus =
  | "VALID"
  /** Still valid, inside the notice window before expiry. */
  | "EXPIRING"
  /** Past its validity window — the mark no longer asserts anything. */
  | "LAPSED"
  /** Withdrawn by the issuer before expiry. Stays publicly resolvable, saying so. */
  | "REVOKED"
  /** A newer countermark has been issued for the same subject. */
  | "SUPERSEDED";

/** A named question the assay could not answer. Mirrors Dispatch/Foreman blind spots. */
export interface AssayBlindSpot {
  kind:
    | "CLAUSE_NOT_MEASURED"
    | "LOW_CONFIDENCE_ONLY"
    | "SOURCE_NOT_READ"
    | "RUNTIME_NOT_PROBED"
    | "THIN_EVIDENCE";
  /** Plain-English statement of what is NOT established. Written for a non-technical reader. */
  statement: string;
  /** Clause ids this blind spot bears on, where applicable. */
  clauseIds: string[];
}

/** One clause of a standard — the unit a countermark makes a claim about. */
export interface AssayClause {
  id: string;
  /** Short title, e.g. "Secrets are not shipped to the browser". */
  title: string;
  /**
   * The claim a MET verdict licenses, in the words a certificate should use. This is the
   * text a counterparty relies on, so it must not overstate what the checks establish.
   */
  assertion: string;
  /** Why a buyer should care. Kept non-technical on purpose. */
  whyItMatters: string;
  /**
   * A critical clause cannot be left unproven or failed by a CERTIFIED mark. These are
   * the ones where being wrong costs money or exposes data.
   */
  critical: boolean;
  /** Pulse check keys that constitute evidence for this clause. */
  checkKeys: string[];
}

export interface AssayStandard {
  /** Stable id, versioned. A certificate is meaningless without naming its standard. */
  id: string;
  version: string;
  label: string;
  summary: string;
  /** Days a mark issued against this standard stays valid, by grade. */
  validityDays: { certified: number; conditional: number };
  clauses: AssayClause[];
}

/** Per-clause outcome, frozen onto the countermark at issue time. */
export interface ClauseOutcome {
  clauseId: string;
  title: string;
  assertion: string;
  critical: boolean;
  verdict: ClauseVerdict;
  /** Why this verdict, naming the evidence. Shown on the certificate. */
  rationale: string;
  /** Highest confidence among the checks that drove an adverse verdict, if any. */
  confidence: CheckConfidence | null;
  /** The check keys that actually contributed evidence (i.e. were present in the scan). */
  evidenceKeys: string[];
  /** Keys the clause expected but the scan never produced. */
  missingKeys: string[];
}

/** The result of assaying a set of checks against a standard. Pure. */
export interface AssayResult {
  standardId: string;
  standardVersion: string;
  grade: CountermarkGrade;
  /** One line explaining the grade, derived from the clause outcomes. */
  gradeReason: string;
  clauses: ClauseOutcome[];
  blindSpots: AssayBlindSpot[];
  coverage: {
    /** Clauses with at least one contributing check. */
    measured: number;
    /** Clauses with no contributing check at all. */
    unmeasured: number;
    total: number;
    /** Share of clauses that produced a verdict either way, 0–100. */
    pct: number;
  };
  counts: Record<ClauseVerdict, number>;
}

/**
 * The signed payload. This — not the DB row — is what the digest and seal are computed
 * over, so a certificate can be verified from its printed contents alone.
 */
export interface AttestationPayload {
  /** Payload schema version, so an old seal stays verifiable when this shape changes. */
  payloadVersion: 1;
  countermarkId: string;
  issuedAt: string;
  issuer: string;
  subject: {
    name: string;
    /** Repo + commit and/or live URL. What the mark is actually about. */
    repo: string | null;
    commit: string | null;
    url: string | null;
  };
  standardId: string;
  standardVersion: string;
  grade: CountermarkGrade;
  expiresAt: string;
  /** Verdict per clause, ordered by clause id, so the digest is stable. */
  clauses: Array<{ clauseId: string; verdict: ClauseVerdict }>;
  blindSpotKinds: string[];
  /** Pulse scan the evidence came from, and the engine version that produced it. */
  evidence: { scanId: string; scanVersion: string; checkCount: number };
}

/** A countermark as the app and the public certificate page consume it. */
export interface CountermarkRecord {
  id: string;
  workspaceId: string;
  clientId: string | null;
  clientName: string | null;
  subjectName: string;
  subjectRepo: string | null;
  subjectCommit: string | null;
  subjectUrl: string | null;
  scanId: string;
  scanVersion: string;
  checkCount: number;
  standardId: string;
  standardVersion: string;
  grade: CountermarkGrade;
  gradeReason: string;
  clauses: ClauseOutcome[];
  blindSpots: AssayBlindSpot[];
  coverage: AssayResult["coverage"];
  issuerName: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  supersededById: string | null;
  digest: string;
  /** null when no signing secret is configured — the certificate says "unsealed". */
  seal: string | null;
  token: string;
  /** Derived, never stored: depends on `now`. */
  status: CountermarkStatus;
  daysRemaining: number;
}
