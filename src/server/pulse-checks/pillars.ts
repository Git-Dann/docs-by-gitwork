// ─────────────────────────────────────────────────────────────────────────────
// PILLARS — six legible subscores with published weights.
//
// WHY THIS EXISTS. Pulse grades 836 checks across 26 categories in 12 domains.
// That is more accurate than any competitor's six-bucket rollup, and it is much
// harder to read: a client opening a report sees a number and then a wall, with
// no answer to "which part of this is the problem?" Competitors that publish six
// weighted dimensions get an inferior measurement and a superior conversation.
//
// So this adds the conversation without giving up the measurement. Pillars are a
// PRESENTATION ROLLUP over the same checks the health score already uses — not a
// second scoring system, and not a second place to add checks.
//
// THREE RULES THAT MAKE IT HONEST:
//
//   1. NOTHING IS HAND-MAINTAINED. Every category is assigned to exactly one
//      pillar, and a test fails if a category is missing or double-assigned. Add
//      a category to categories.ts and this file is where the compiler sends you.
//
//   2. WEIGHT IS REDISTRIBUTED, NEVER ASSUMED. A pillar with no applicable checks
//      (an iOS app has no SEO checks; a CLI has no accessibility checks) is
//      dropped and its weight is shared across the pillars that DID apply. The
//      alternative — scoring a pillar on nothing, or scoring it zero — is exactly
//      the "we could not look" → "it is not there" failure this codebase keeps
//      finding. A dropped pillar is reported as dropped.
//
//   3. IT REUSES SCORE V3 DIRECTLY. Severity, evidence, confidence, correlation,
//      unknown states and score eligibility are evaluated by computeScoreBreakdown,
//      so the pillar and headline cannot apply different trust rules.
//
// The pillar weights are published in the report and in docs/pulse-pillars.md.
// They are a JUDGEMENT — an agency shipping client software cares more about a
// leaked key than a missing hreflang — and they are stated so they can be argued
// with rather than being buried in a formula.
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseScanCheckInput } from "@/types/pulse";
import { CATEGORIES, ORDERED_CATEGORIES, type CheckCategory } from "./categories";
import { computeScoreBreakdown } from "./score-breakdown";

export type PillarKey = "security" | "access" | "code" | "reliability" | "legal" | "experience";

export interface PillarDef {
  key: PillarKey;
  label: string;
  /** Published weight out of 100. These sum to exactly 100 — enforced by a test. */
  weight: number;
  /** One line stating what this pillar answers, for the report. */
  question: string;
  categories: CheckCategory[];
}

/**
 * The six pillars.
 *
 * Weighting rationale, stated so it can be disagreed with:
 *   • Security dominates because its failures are unbounded — a leaked key or an
 *     injectable query costs the client their users' data, not a conversion point.
 *   • Access control is separated FROM security rather than folded into it,
 *     because "who can see what" fails differently and is fixed by different
 *     people (product decisions, not a dependency bump).
 *   • Experience carries the most categories and the least weight on purpose. It
 *     is the widest surface and the most recoverable: a missing OG tag is a
 *     morning's work, an exposed database is an incident.
 */
export const PILLARS: PillarDef[] = [
  {
    key: "security",
    label: "Security & secrets",
    weight: 30,
    question: "Can someone take something that isn't theirs?",
    categories: [CATEGORIES.SECURITY, CATEGORIES.SECRETS_KEYS, CATEGORIES.AI_SAFETY],
  },
  {
    key: "access",
    label: "Access & data",
    weight: 15,
    question: "Does the right person see the right data, and can they pay you?",
    categories: [CATEGORIES.AUTHENTICATION, CATEGORIES.ROLES, CATEGORIES.PAYMENTS, CATEGORIES.API_QUALITY],
  },
  {
    key: "code",
    label: "Code & maintainability",
    weight: 15,
    question: "Can the next developer change this safely?",
    categories: [CATEGORIES.CODE_QUALITY, CATEGORIES.VIBE_HYGIENE, CATEGORIES.STANDARDS_VERIFICATION],
  },
  {
    key: "reliability",
    label: "Reliability & performance",
    weight: 15,
    question: "Does it stay up, stay fast, and tell you when it doesn't?",
    categories: [
      CATEGORIES.INFRASTRUCTURE,
      CATEGORIES.OBSERVABILITY,
      CATEGORIES.PERFORMANCE,
      // Sits with its domain rather than under Security, even though its worst
      // findings are supply-chain compromises. A pipeline that cannot be trusted to
      // build the right thing is a delivery failure first; the individual
      // high-severity findings still escalate through priority.ts on their own.
      CATEGORIES.BUILD_PIPELINE,
    ],
  },
  {
    key: "legal",
    label: "Legal & compliance",
    weight: 15,
    question: "Can this ship in the markets it targets?",
    categories: [CATEGORIES.LEGAL, CATEGORIES.BUSINESS_OPS],
  },
  {
    key: "experience",
    label: "Experience & reach",
    weight: 10,
    question: "Can people find it, use it, and trust it?",
    categories: [
      CATEGORIES.SEO,
      CATEGORIES.AEO,
      CATEGORIES.STORE_LISTING,
      CATEGORIES.TRUST_BRAND,
      CATEGORIES.GLOBAL_DISTRIBUTION,
      CATEGORIES.MOBILE,
      CATEGORIES.ACCESSIBILITY,
      CATEGORIES.APP_STORE,
      CATEGORIES.SAAS,
      CATEGORIES.MISSING_PAGES,
      CATEGORIES.EMAIL,
      CATEGORIES.AI_READINESS,
    ],
  },
];

/** category → pillar. Built once; the reconcile test proves it is total. */
const PILLAR_BY_CATEGORY = new Map<string, PillarDef>(
  PILLARS.flatMap((p) => p.categories.map((c) => [c as string, p] as const)),
);

/** Categories with no pillar — must always be empty. Exported for the test. */
export function unassignedCategories(): CheckCategory[] {
  return ORDERED_CATEGORIES.filter((c) => !PILLAR_BY_CATEGORY.has(c));
}

/** Categories assigned to more than one pillar — must always be empty. */
export function duplicatedCategories(): string[] {
  const seen = new Map<string, number>();
  for (const p of PILLARS) {
    for (const c of p.categories) seen.set(c, (seen.get(c) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([c]) => c);
}

export interface PillarScore {
  key: PillarKey;
  label: string;
  question: string;
  /** The published weight this pillar carries when it applies. */
  publishedWeight: number;
  /** The weight it ACTUALLY carried in this scan, after redistribution. */
  effectiveWeight: number;
  /** 0–100 within the pillar, or null when nothing applicable was measured. */
  score: number | null;
  pass: number;
  warn: number;
  fail: number;
  /**
   * Measured but not scored: any non-outcome status (SKIPPED, NOT_APPLICABLE,
   * INCONCLUSIVE, ERROR, NOT_TESTED, EVIDENCE_REQUIRED) or a check marked
   * score-ineligible. NOT low-confidence outcomes — score v3 weights those
   * symmetrically and still counts them, which is the point of the trust model.
   */
  excluded: number;
  /** Set when the pillar was dropped, saying why in one line. */
  droppedReason?: string;
}

export interface PillarBreakdown {
  pillars: PillarScore[];
  /** Weighted mean of the pillars that applied. Null when none did. */
  overall: number | null;
  /** Pillars dropped for having nothing applicable — named, never silent. */
  dropped: PillarKey[];
}

/**
 * Score each pillar over the same checks the health score uses.
 *
 * Each pillar delegates to computeScoreBreakdown. Do not reimplement the formula
 * here: a pillar total that disagrees with the headline is worse than no rollup.
 */
export function computePillarBreakdown(checks: PulseScanCheckInput[]): PillarBreakdown {
  const acc = new Map<PillarKey, { earned: number; possible: number; pass: number; warn: number; fail: number; excluded: number; score: number | null }>();
  for (const p of PILLARS) {
    const pillarChecks = checks.filter((check) => PILLAR_BY_CATEGORY.get(check.category)?.key === p.key);
    const breakdown = computeScoreBreakdown(pillarChecks);
    acc.set(p.key, {
      earned: breakdown.earnedWeight,
      possible: breakdown.totalWeight,
      pass: pillarChecks.filter((check) => check.status === "PASS").length,
      warn: pillarChecks.filter((check) => check.status === "WARN").length,
      fail: pillarChecks.filter((check) => check.status === "FAIL").length,
      excluded: pillarChecks.filter((check) => !["PASS", "WARN", "FAIL"].includes(check.status) || check.scoreEligible === false).length,
      score: breakdown.totalWeight > 0 ? breakdown.finalScore : null,
    });
  }

  // Redistribute the weight of pillars that measured nothing across those that
  // did, so the total is always over 100 points that were actually assessable.
  const applicable = PILLARS.filter((p) => acc.get(p.key)!.possible > 0);
  const applicableWeight = applicable.reduce((sum, p) => sum + p.weight, 0);

  const pillars: PillarScore[] = PILLARS.map((p) => {
    const e = acc.get(p.key)!;
    const applies = e.possible > 0;
    return {
      key: p.key,
      label: p.label,
      question: p.question,
      publishedWeight: p.weight,
      effectiveWeight: applies && applicableWeight > 0
        ? Math.round((p.weight / applicableWeight) * 1000) / 10
        : 0,
      score: e.score,
      pass: e.pass,
      warn: e.warn,
      fail: e.fail,
      excluded: e.excluded,
      droppedReason: applies
        ? undefined
        : e.excluded > 0
          ? `No scoreable checks — all ${e.excluded} were skipped as not applicable to this project, or were ` +
            `inconclusive on the evidence available. This pillar's ${p.weight} points were redistributed across the ` +
            `pillars that did apply, so the overall score is not penalised for something we could not assess.`
          : `No checks in this pillar ran for this project type. Its ${p.weight} points were redistributed.`,
    };
  });

  const overall = applicableWeight === 0 ? null : computeScoreBreakdown(checks).finalScore;

  return {
    pillars,
    overall,
    dropped: pillars.filter((p) => p.score === null).map((p) => p.key),
  };
}
