// The examination itself — PURE. No Prisma, no network, no clock. Everything here is a
// function of (checks, standard), which is what makes the verdict testable and what
// makes it defensible: an attestation nobody can reproduce is a marketing claim.
//
// ── The one rule this file exists to enforce ─────────────────────────────────────
//
// A clause with no evidence is UNPROVEN, never MET. Pulse's own history is the argument:
// §35 records a scan that reported ~28 confident "missing X" findings having read nothing
// at all, because an unauthenticated repo listing came back empty and every check read
// that emptiness as absence. §37 records the same disease one layer up. A report can
// survive that mistake; an attestation cannot, because somebody accepts delivery on it.
//
// So the asymmetry is deliberate and load-bearing:
//   • To say MET we need every covering check to have run AND passed.
//   • To say FAILED we need an adverse check at HIGH or MEDIUM confidence.
//   • Anything else is UNPROVEN, and an UNPROVEN critical clause blocks certification.
//
// This mirrors score-breakdown.ts, which already excludes LOW-confidence adverse checks
// from scoring on the same reasoning ("an unproven alarm shouldn't tank the score"). Here
// the consequence is stronger: it shouldn't earn a pass either.

import type { CheckConfidence } from "@/server/pulse-checks/confidence";
import type { PulseCheckStatus } from "@/types/pulse";
import type { ProvenanceBlindSpot, ProvenanceResult, ProvenanceStandard, ClauseOutcome, ClauseVerdict } from "./types";

/**
 * The minimum shape the examination needs from a check. Structurally satisfied by both
 * `PulseScanCheckInput` (fresh from a scan) and `PulseScanCheckRecord` (read back from
 * the DB, where `detail`/`confidence` are nullable) — so the engine works on either
 * without a mapping layer.
 */
export interface ProvenanceCheckEvidence {
  checkKey: string;
  status: PulseCheckStatus;
  confidence?: CheckConfidence | null;
  detail?: string | null;
}

/** Coverage below this, and absence-based clauses are reported as thin evidence. */
const THIN_COVERAGE_PCT = 60;

/** Ranked so "the worst confidence we have for an adverse signal" is well-defined. */
const CONFIDENCE_RANK: Record<CheckConfidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function strongest(a: CheckConfidence | null, b: CheckConfidence | null): CheckConfidence | null {
  if (!a) return b;
  if (!b) return a;
  return CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b;
}

/**
 * An adverse check only counts as evidence at MEDIUM or better. An unset confidence is
 * treated as MEDIUM, matching `deriveConfidence`'s own fail-safe default — but note that
 * default cuts the *other* way here, so it is stated explicitly rather than inherited.
 */
function countsAsProof(confidence: CheckConfidence | null | undefined): boolean {
  return (confidence ?? "MEDIUM") !== "LOW";
}

function evaluateClause(
  clause: ProvenanceStandard["clauses"][number],
  byKey: Map<string, ProvenanceCheckEvidence[]>,
): ClauseOutcome {
  const evidenceKeys: string[] = [];
  const missingKeys: string[] = [];
  let passes = 0;
  let skipped = 0;
  const provenFails: string[] = [];
  const provenWarns: string[] = [];
  const unprovenAdverse: string[] = [];
  let adverseConfidence: CheckConfidence | null = null;

  for (const key of clause.checkKeys) {
    const hits = byKey.get(key);
    if (!hits || hits.length === 0) {
      missingKeys.push(key);
      continue;
    }
    evidenceKeys.push(key);
    for (const hit of hits) {
      if (!["PASS", "WARN", "FAIL"].includes(hit.status)) {
        skipped++;
      } else if (hit.status === "PASS") {
        passes++;
      } else if (countsAsProof(hit.confidence)) {
        adverseConfidence = strongest(adverseConfidence, hit.confidence ?? "MEDIUM");
        (hit.status === "FAIL" ? provenFails : provenWarns).push(key);
      } else {
        // Adverse but only weakly evidenced. Neither a finding nor a pass.
        unprovenAdverse.push(key);
      }
    }
  }

  const base = {
    clauseId: clause.id,
    title: clause.title,
    assertion: clause.assertion,
    critical: clause.critical,
    evidenceKeys,
    missingKeys,
  };

  // Nothing ran at all → we did not look. The most important verdict in the system.
  if (evidenceKeys.length === 0) {
    return {
      ...base,
      verdict: "UNPROVEN",
      rationale:
        `Not established. None of the ${clause.checkKeys.length} checks this clause relies on ` +
        `produced a result in this examination, so it is neither met nor failed.`,
      confidence: null,
    };
  }

  if (provenFails.length > 0) {
    return {
      ...base,
      verdict: "FAILED",
      rationale:
        `Failed on ${describeKeys(provenFails)} at ${adverseConfidence} confidence` +
        (unprovenAdverse.length > 0
          ? `; ${unprovenAdverse.length} further signal(s) were too weak to rely on.`
          : "."),
      confidence: adverseConfidence,
    };
  }

  if (provenWarns.length > 0) {
    return {
      ...base,
      verdict: "QUALIFIED",
      rationale: `Partially met — ${describeKeys(provenWarns)} returned a warning at ${adverseConfidence} confidence.`,
      confidence: adverseConfidence,
    };
  }

  // Only weak adverse signals: explicitly not a pass. The alternative — treating a
  // LOW-confidence FAIL as though it never happened — would let a clause be certified on
  // the strength of a check we ourselves distrust.
  if (unprovenAdverse.length > 0 && passes === 0) {
    return {
      ...base,
      verdict: "UNPROVEN",
      rationale:
        `Not established. The only adverse signals (${describeKeys(unprovenAdverse)}) were ` +
        `low-confidence heuristics, which are not strong enough to fail the clause or to clear it.`,
      confidence: "LOW",
    };
  }

  if (passes === 0 && skipped > 0) {
    return {
      ...base,
      verdict: "NOT_APPLICABLE",
      rationale: `Does not apply to this kind of project — ${skipped} covering check(s) were skipped as inapplicable.`,
      confidence: null,
    };
  }

  if (passes === 0) {
    return {
      ...base,
      verdict: "UNPROVEN",
      rationale: "Not established — no covering check returned a usable result.",
      confidence: null,
    };
  }

  return {
    ...base,
    verdict: "MET",
    rationale:
      `Met on ${passes} passing check(s)` +
      (unprovenAdverse.length > 0 ? `, with ${unprovenAdverse.length} low-confidence signal(s) noted and not relied on` : "") +
      (missingKeys.length > 0 ? `; ${missingKeys.length} of ${clause.checkKeys.length} supporting checks did not run.` : "."),
    confidence: null,
  };
}

function describeKeys(keys: string[]): string {
  const unique = [...new Set(keys)];
  if (unique.length <= 3) return unique.join(", ");
  return `${unique.slice(0, 3).join(", ")} and ${unique.length - 3} more`;
}

/** Every question this examination could not answer, stated for a non-technical reader. */
function deriveBlindSpots(clauses: ClauseOutcome[], coveragePct: number): ProvenanceBlindSpot[] {
  const spots: ProvenanceBlindSpot[] = [];

  const notMeasured = clauses.filter((c) => c.verdict === "UNPROVEN" && c.evidenceKeys.length === 0);
  if (notMeasured.length > 0) {
    spots.push({
      kind: "CLAUSE_NOT_MEASURED",
      statement:
        `${notMeasured.length} clause(s) were not tested at all in this examination, so this mark says ` +
        `nothing either way about them: ${notMeasured.map((c) => c.title).join("; ")}.`,
      clauseIds: notMeasured.map((c) => c.clauseId),
    });
  }

  const weakOnly = clauses.filter((c) => c.verdict === "UNPROVEN" && c.confidence === "LOW");
  if (weakOnly.length > 0) {
    spots.push({
      kind: "LOW_CONFIDENCE_ONLY",
      statement:
        `${weakOnly.length} clause(s) had only weak evidence against them. That is not a pass — ` +
        `it means a proper answer needs a human to look.`,
      clauseIds: weakOnly.map((c) => c.clauseId),
    });
  }

  const partial = clauses.filter((c) => c.verdict === "MET" && c.missingKeys.length > 0);
  if (partial.length > 0) {
    spots.push({
      kind: "THIN_EVIDENCE",
      statement:
        `${partial.length} clause(s) were met on some but not all of their supporting checks, so the ` +
        `finding is narrower than the clause title suggests.`,
      clauseIds: partial.map((c) => c.clauseId),
    });
  }

  if (coveragePct < THIN_COVERAGE_PCT) {
    spots.push({
      kind: "SOURCE_NOT_READ",
      statement:
        `Only ${coveragePct}% of the standard's clauses produced a verdict. Treat this mark as a ` +
        `partial examination: re-run against a reachable repository and a live URL for full coverage.`,
      clauseIds: [],
    });
  }

  // Stated unconditionally and last, because it is the boundary of the whole product and
  // a reader should never have to infer it from what is absent.
  spots.push({
    kind: "RUNTIME_NOT_PROBED",
    statement:
      "This examination inspects code, configuration and public responses. It does not sign in as a " +
      "user, exercise payment flows, or attempt to breach authorisation between two accounts — " +
      "so it cannot rule out a logic flaw that only appears once signed in.",
    clauseIds: [],
  });

  return spots;
}

/** Provenance a set of checks against a standard. Pure — same inputs, same result, always. */
export function evaluateStandard(
  checks: readonly ProvenanceCheckEvidence[],
  standard: ProvenanceStandard,
): ProvenanceResult {
  const byKey = new Map<string, ProvenanceCheckEvidence[]>();
  for (const check of checks) {
    const list = byKey.get(check.checkKey);
    if (list) list.push(check);
    else byKey.set(check.checkKey, [check]);
  }

  const clauses = standard.clauses.map((clause) => evaluateClause(clause, byKey));

  const counts: Record<ClauseVerdict, number> = {
    MET: 0,
    QUALIFIED: 0,
    FAILED: 0,
    UNPROVEN: 0,
    NOT_APPLICABLE: 0,
  };
  for (const c of clauses) counts[c.verdict]++;

  const total = clauses.length;
  // NOT_APPLICABLE counts as measured: we did look, and the answer was "not relevant here".
  const measured = clauses.filter((c) => c.verdict !== "UNPROVEN").length;
  const coverage = {
    measured,
    unmeasured: total - measured,
    total,
    pct: total === 0 ? 0 : Math.round((measured / total) * 100),
  };

  const criticalFailed = clauses.filter((c) => c.critical && c.verdict === "FAILED");
  const criticalUnproven = clauses.filter((c) => c.critical && c.verdict === "UNPROVEN");

  let grade: ProvenanceResult["grade"];
  let gradeReason: string;

  if (criticalFailed.length > 0) {
    grade = "NOT_CERTIFIED";
    gradeReason =
      `${criticalFailed.length} critical clause(s) failed on confirmed evidence: ` +
      `${criticalFailed.map((c) => c.clauseId).join(", ")}.`;
  } else if (criticalUnproven.length > 0) {
    // Ordered AFTER the failure branch on purpose: a confirmed failure is a more useful
    // thing to tell a reader than an unproven one, so it wins the headline.
    grade = "INCOMPLETE";
    gradeReason =
      `No critical clause failed, but ${criticalUnproven.length} could not be established ` +
      `(${criticalUnproven.map((c) => c.clauseId).join(", ")}). A mark cannot certify what was not checked.`;
  } else if (counts.FAILED > 0 || counts.QUALIFIED > 0) {
    grade = "CONDITIONAL";
    gradeReason =
      `All critical clauses met. ${counts.FAILED} non-critical clause(s) failed and ` +
      `${counts.QUALIFIED} were partially met.`;
  } else {
    grade = "CERTIFIED";
    gradeReason =
      `All ${counts.MET} applicable clause(s) met` +
      (counts.NOT_APPLICABLE > 0 ? `, ${counts.NOT_APPLICABLE} not applicable` : "") +
      ".";
  }

  return {
    standardId: standard.id,
    standardVersion: standard.version,
    grade,
    gradeReason,
    clauses,
    blindSpots: deriveBlindSpots(clauses, coverage.pct),
    coverage,
    counts,
  };
}
