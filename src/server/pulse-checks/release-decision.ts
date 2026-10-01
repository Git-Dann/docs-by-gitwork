// ─────────────────────────────────────────────────────────────────────────────
// PULSE GATE — the release decision.
//
// This is the thing that makes Pulse an assurance platform rather than a scanner.
// A score says how a product is doing; a decision says whether it can ship, names
// what is stopping it, and says plainly when the evidence does not support an
// answer at all.
//
// It is DETERMINISTIC. No model output reaches it — a release decision made from
// generated prose is not a decision, it is a guess with a confident voice.
//
// ── The precedence, which is the whole design ────────────────────────────────
//
//   BLOCKED  >  INCONCLUSIVE  >  CONDITIONAL  >  READY
//
// BLOCKED outranks INCONCLUSIVE because a confirmed blocker is KNOWLEDGE while
// low coverage is the ABSENCE of knowledge. If we proved a cross-tenant read, it
// does not matter that we also failed to reach PageSpeed — the answer is already
// no, and saying "inconclusive" would bury the one thing we are certain of.
//
// INCONCLUSIVE outranks CONDITIONAL and READY because the opposite mistake is
// fatal: a scan that verified 42% of what it should and found nothing wrong is
// not a pass, and every scanner that reports it as one is lying by omission.
// Absence of evidence is the single most common way an assurance tool
// overstates itself, and this is where that is stopped.
//
// Mirrors the precedence rule Provenance already uses for mark validity (§38):
// order by what a reader most needs to know, not by severity arithmetic.
// ─────────────────────────────────────────────────────────────────────────────

import type { PulseScanCheckInput, ScoreBreakdown } from "@/types/pulse";
import { CATEGORIES, type CheckCategory } from "./categories";
import { detectStoreTarget, type StoreTarget } from "@/lib/pulse-store-url";

export type ReleaseDecision = "READY" | "CONDITIONAL" | "BLOCKED" | "INCONCLUSIVE";

/** A stable code so a reason can be matched in CI without parsing prose. */
export type GateReasonCode =
  | "CONFIRMED_CRITICAL"
  | "BLOCKING_CONTROL_FAILED"
  | "COVERAGE_BELOW_FLOOR"
  | "REQUIRED_COLLECTOR_UNAVAILABLE"
  | "HEALTH_BELOW_FLOOR"
  | "UNRESOLVED_FAILURES"
  | "EVIDENCE_REQUIRED"
  | "BLOCKING_CONTROL_UNESTABLISHED";

export interface GateReason {
  code: GateReasonCode;
  /** One sentence a non-engineer can act on. */
  summary: string;
  /** The controls this rests on, so every reason is traceable to evidence. */
  checkKeys: string[];
}

export interface GatePolicy {
  id: string;
  /** Bumped whenever a rule changes, and recorded on the scan that used it. */
  version: string;
  label: string;
  description: string;
  /**
   * Assurance coverage floor. Below this, the scan cannot support a decision —
   * it does not mean the product is bad, it means we did not see enough of it.
   */
  minCoverage: number;
  /**
   * Technical health floor. Falling below it is CONDITIONAL, never BLOCKED: a low
   * score is accumulated debt spread over many controls, not a specific thing
   * anyone can point at and fix before shipping. Blocking belongs to named
   * failures.
   */
  minHealth: number;
  /** Controls that stop a release outright when they confirm a failure. */
  blockingKeys: readonly string[];
  /** Categories where a CONFIRMED critical failure blocks. */
  blockingCategories: readonly CheckCategory[];
  /** Collectors whose absence makes the decision unsupportable. */
  requiredCollectors: readonly string[];
}

/**
 * The controls that stop a launch in any policy.
 *
 * Deliberately short. A blocking list that grows to include everything important
 * stops meaning "cannot ship" and starts meaning "should fix", at which point the
 * decision carries no information. Each of these loses user data, exposes
 * credentials, or makes the product legally unshippable.
 */
const UNIVERSAL_BLOCKERS = [
  "ssl_valid",
  "no_exposed_env",
  "no_exposed_git",
  "supabase_rls_enforced",
  "no_service_role_key_exposed",
  "target_content_accessible",
] as const;

export const GATE_POLICIES: GatePolicy[] = [
  {
    id: "launch-ready",
    version: "1.0.0",
    label: "Launch ready",
    description:
      "The general bar for putting something in front of real users: nothing leaking, nothing legally unshippable, and enough of the product actually assessed to say so.",
    minCoverage: 70,
    minHealth: 60,
    blockingKeys: [...UNIVERSAL_BLOCKERS, "privacy_policy", "terms_of_service"],
    blockingCategories: [CATEGORIES.SECURITY, CATEGORIES.SECRETS_KEYS],
    requiredCollectors: ["url-checks"],
  },
  {
    id: "saas-production",
    version: "1.0.0",
    label: "SaaS production",
    description:
      "For multi-tenant software where one customer seeing another's data is the failure that ends the contract. Adds access control to the blocking set and demands higher coverage.",
    minCoverage: 80,
    minHealth: 70,
    blockingKeys: [...UNIVERSAL_BLOCKERS, "privacy_policy", "terms_of_service"],
    blockingCategories: [
      CATEGORIES.SECURITY,
      CATEGORIES.SECRETS_KEYS,
      CATEGORIES.AUTHENTICATION,
      CATEGORIES.ROLES,
      CATEGORIES.AI_SAFETY,
    ],
    requiredCollectors: ["url-checks"],
  },
  {
    id: "handover",
    version: "1.0.0",
    label: "Agency handover",
    description:
      "For giving a build to the client who will own it. Source access is mandatory — handing over a product whose repository was never read is the one thing this policy exists to prevent.",
    minCoverage: 85,
    minHealth: 65,
    blockingKeys: [...UNIVERSAL_BLOCKERS],
    blockingCategories: [CATEGORIES.SECURITY, CATEGORIES.SECRETS_KEYS],
    requiredCollectors: ["url-checks", "github-checks", "code-agent"],
  },
];

/**
 * An app assessed from its store listing.
 *
 * ⚠️ Why a store link needs its own policy. Every policy above describes a WEBSITE —
 * they require url-checks and block on the website's privacy policy and terms. An App
 * Store link runs none of that, so under `launch-ready` an iOS scan could only ever
 * answer "INCONCLUSIVE — scan the product's own URL": the policy asked an iOS app to
 * be a website, and reported it as one that had failed to load.
 *
 * These policies ask what a listing CAN establish, about the app it lists: the listing
 * is live, it links a privacy policy, and it carries the store's own privacy
 * declaration — each of which the store itself enforces, and each read from the
 * store's structured data. They require the store-listing collector, so a listing that
 * could not be read (a rate limit, a changed page) is INCONCLUSIVE rather than a pass.
 *
 * The label names the scope, because a decision is only as honest as what it covers:
 * READY here means the LISTING meets the bar. The app's code is not in scope — the
 * scan says so in its own coverage check and points at a repository scan.
 */
const STORE_POLICIES: Record<StoreTarget, GatePolicy> = {
  app_store: {
    id: "ios-app-listing",
    version: "1.0.0",
    label: "iOS app · App Store listing",
    description:
      "For an iOS app assessed from its App Store listing: the listing is live, it links a privacy policy, it declares its App Privacy details, and enough of it could be read to say so. The app's code is not in scope — scan its repository for that.",
    minCoverage: 70,
    minHealth: 60,
    blockingKeys: ["store_page_live", "store_privacy_policy", "appstore_privacy_label"],
    blockingCategories: [],
    requiredCollectors: ["store-listing"],
  },
  play_store: {
    id: "android-app-listing",
    version: "1.0.0",
    label: "Android app · Google Play listing",
    description:
      "For an Android app assessed from its Google Play listing: the listing is live, it links a privacy policy, it declares its Data safety section, and enough of it could be read to say so. The app's code is not in scope — scan its repository for that.",
    minCoverage: 70,
    minHealth: 60,
    blockingKeys: ["store_page_live", "store_privacy_policy", "playstore_data_safety"],
    blockingCategories: [],
    requiredCollectors: ["store-listing"],
  },
};

GATE_POLICIES.push(STORE_POLICIES.app_store, STORE_POLICIES.play_store);

export const DEFAULT_GATE_POLICY = GATE_POLICIES[0];

export function gatePolicyById(id: string | null | undefined): GatePolicy {
  return GATE_POLICIES.find((policy) => policy.id === id) ?? DEFAULT_GATE_POLICY;
}

/**
 * The policy a scan is judged by. An explicit choice wins; otherwise a store link is
 * judged as the app it lists, and everything else by the general launch policy.
 *
 * Every place a gate is evaluated must come through here — the scan, the agent verdict
 * and the report's fallback — or the same scan would get two different answers
 * depending on who asked.
 */
export function resolveGatePolicy(args: { policyId?: string | null; targetUrl?: string | null }): GatePolicy {
  if (args.policyId) return gatePolicyById(args.policyId);
  const store = args.targetUrl ? detectStoreTarget(args.targetUrl) : null;
  return store ? STORE_POLICIES[store] : DEFAULT_GATE_POLICY;
}

export interface GateEvaluation {
  decision: ReleaseDecision;
  policy: { id: string; version: string; label: string };
  /** Why it cannot ship. Empty unless BLOCKED. */
  blocking: GateReason[];
  /** Why it ships with reservations. */
  conditional: GateReason[];
  /** What Pulse could not establish — the reason an INCONCLUSIVE is inconclusive. */
  unverified: GateReason[];
  metrics: { health: number; coverage: number };
}

/**
 * A failure is only allowed to block when we are SURE of it.
 *
 * `trustBucket === "CONFIRMED"` already means "FAIL or WARN, at HIGH confidence"
 * — reusing it keeps the blocking rule tied to the same trust model the score
 * uses, rather than inventing a second opinion about certainty. Blocking a
 * release on a heuristic is how a gate gets switched off and stays off.
 */
function isConfirmedFailure(check: PulseScanCheckInput): boolean {
  return check.status === "FAIL" && check.trustBucket === "CONFIRMED";
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function evaluateReleaseGate(
  checks: PulseScanCheckInput[],
  breakdown: Pick<ScoreBreakdown, "finalScore" | "completeness"> & {
    collectors?: ScoreBreakdown["collectors"];
  },
  policy: GatePolicy = DEFAULT_GATE_POLICY,
): GateEvaluation {
  const blocking: GateReason[] = [];
  const conditional: GateReason[] = [];
  const unverified: GateReason[] = [];

  const confirmedFailures = checks.filter(isConfirmedFailure);

  // ── Blocking ───────────────────────────────────────────────────────────────
  const namedBlockers = confirmedFailures.filter((check) => policy.blockingKeys.includes(check.checkKey));
  if (namedBlockers.length > 0) {
    blocking.push({
      code: "BLOCKING_CONTROL_FAILED",
      summary: `${namedBlockers.length} control${plural(namedBlockers.length, "", "s")} this policy treats as non-negotiable ${plural(namedBlockers.length, "is", "are")} failing: ${namedBlockers.map((check) => check.label).join("; ")}.`,
      checkKeys: namedBlockers.map((check) => check.checkKey),
    });
  }

  const criticalInBlockedCategory = confirmedFailures.filter(
    (check) =>
      check.severity === "CRITICAL" &&
      policy.blockingCategories.includes(check.category) &&
      !policy.blockingKeys.includes(check.checkKey),
  );
  if (criticalInBlockedCategory.length > 0) {
    blocking.push({
      code: "CONFIRMED_CRITICAL",
      summary: `${criticalInBlockedCategory.length} confirmed critical ${plural(criticalInBlockedCategory.length, "failure", "failures")} in ${[...new Set(criticalInBlockedCategory.map((check) => check.category))].join(", ")}.`,
      checkKeys: criticalInBlockedCategory.map((check) => check.checkKey),
    });
  }

  // ── Unverified — the grounds for INCONCLUSIVE ──────────────────────────────
  if (breakdown.completeness < policy.minCoverage) {
    unverified.push({
      code: "COVERAGE_BELOW_FLOOR",
      summary: `Pulse verified ${Math.round(breakdown.completeness)}% of what this policy expects to assess, against a floor of ${policy.minCoverage}%. That is not a finding about the product — it is Pulse saying it did not see enough to judge it.`,
      checkKeys: [],
    });
  }

  const unavailableCollectors = new Set((breakdown.collectors?.unavailable ?? []).map((item) => item.name));
  const failedCollectors = new Set(breakdown.collectors?.failedNames ?? []);
  // A required collector counts as missing when it failed, was unavailable, or — where
  // the scan recorded which collectors completed — simply is not among them. The last
  // case is the one that used to pass: a collector the scan never ran appears in no
  // list at all, and an absence nobody checked for reads exactly like a success.
  const completedCollectors = breakdown.collectors?.completedNames
    ? new Set(breakdown.collectors.completedNames)
    : null;
  const missingRequired = policy.requiredCollectors.filter(
    (name) =>
      unavailableCollectors.has(name) ||
      failedCollectors.has(name) ||
      (completedCollectors !== null && !completedCollectors.has(name)),
  );
  if (missingRequired.length > 0) {
    // Say WHY, in the collector's own words. A collector that ran and was refused (a
    // store rate-limiting the scan) did not "not run", and telling a reader it did sends
    // them looking for a configuration problem that does not exist.
    const cause =
      breakdown.collectors?.failedDetails?.find((item) => missingRequired.includes(item.name))?.detail
      ?? breakdown.collectors?.unavailable.find((item) => missingRequired.includes(item.name))?.reason
      ?? "";
    const anyFailed = missingRequired.some((name) => failedCollectors.has(name));
    unverified.push({
      code: "REQUIRED_COLLECTOR_UNAVAILABLE",
      summary: `This policy requires ${missingRequired.join(", ")}, which ${anyFailed ? "did not complete" : "did not run"}. ${cause}`.trim(),
      checkKeys: [],
    });
  }

  const evidenceRequired = checks.filter((check) => check.status === "EVIDENCE_REQUIRED");
  if (evidenceRequired.length > 0) {
    unverified.push({
      code: "EVIDENCE_REQUIRED",
      summary: `${evidenceRequired.length} control${plural(evidenceRequired.length, "", "s")} ${plural(evidenceRequired.length, "needs", "need")} evidence Pulse cannot collect itself — account access, a document, or a human review.`,
      checkKeys: evidenceRequired.map((check) => check.checkKey),
    });
  }

  // ── A named blocker Pulse could not establish either way ───────────────────
  //
  // The precedence argued at the top of this file says INCONCLUSIVE outranks READY
  // "because the opposite mistake is worse" — and yet a blocking key that came back
  // INCONCLUSIVE fed into nothing, so it read to this function exactly like a PASS.
  // Measured before this existed: privacy_policy and terms_of_service both
  // INCONCLUSIVE on an otherwise-clean scan returned decision READY, score 100,
  // unverified []. Byte-identical to the all-PASS run.
  //
  // That is not an edge case. A client-rendered site behind catch-all 200 routing
  // cannot have either legal document established from outside — and that is Pulse's
  // core target population, so the commonest scan we run was being rubber-stamped on
  // the two controls a launch actually turns on.
  //
  // ⚠️ SKIPPED and NOT_APPLICABLE are deliberately EXCLUDED. Those mean "this control
  // does not apply to this subject", which is a decision Pulse made on evidence, not a
  // gap in what it saw — including them would make every URL-only scan permanently
  // INCONCLUSIVE on its repo-only blockers. A blocker that produced no check at all is
  // likewise excluded: that is what COVERAGE_BELOW_FLOOR already measures, and
  // double-counting it here would fire on any policy whose blockers outrun the scan's
  // input type.
  const unestablishedBlockers = checks.filter(
    (check) =>
      policy.blockingKeys.includes(check.checkKey) &&
      (check.status === "INCONCLUSIVE" || check.status === "ERROR" || check.status === "NOT_TESTED"),
  );
  if (unestablishedBlockers.length > 0) {
    unverified.push({
      code: "BLOCKING_CONTROL_UNESTABLISHED",
      summary: `${unestablishedBlockers.length} control${plural(unestablishedBlockers.length, "", "s")} this policy treats as non-negotiable could not be established either way: ${unestablishedBlockers.map((check) => check.label).join("; ")}. Pulse is not saying ${plural(unestablishedBlockers.length, "it is", "they are")} failing — it is saying it could not see enough to clear ${plural(unestablishedBlockers.length, "it", "them")}, so this decision cannot be a pass.`,
      checkKeys: unestablishedBlockers.map((check) => check.checkKey),
    });
  }

  // ── Conditional ────────────────────────────────────────────────────────────
  if (breakdown.finalScore < policy.minHealth) {
    conditional.push({
      code: "HEALTH_BELOW_FLOOR",
      summary: `Technical health is ${breakdown.finalScore}, below this policy's floor of ${policy.minHealth}. Spread across many controls rather than one blocker, so it is debt to schedule, not a reason to stop.`,
      checkKeys: [],
    });
  }

  // ⚠️ CONDITIONAL takes LIKELY failures as well as CONFIRMED ones, and that asymmetry with the
  // blocking rule above is deliberate. Blocking must be certain — stopping a release on a
  // heuristic is how a gate gets switched off. A reservation does not have to be certain; a
  // reservation is what "we think this is failing" IS. Inheriting the CONFIRMED-only filter here
  // meant a scan could report READY while carrying real failures whose only flaw was MEDIUM
  // confidence — observed on three live sites with no privacy policy, no terms and no cookie
  // consent, every one of them a MEDIUM-confidence FAIL. LOW-confidence adverse checks are still
  // excluded: they bucket as INCONCLUSIVE, and score-breakdown already treats those as unproven
  // alarms rather than findings.
  const reservations = checks.filter(
    (check) =>
      check.status === "FAIL" &&
      (check.trustBucket === "CONFIRMED" || check.trustBucket === "LIKELY") &&
      !namedBlockers.includes(check) &&
      !criticalInBlockedCategory.includes(check),
  );
  if (reservations.length > 0) {
    const confirmedCount = reservations.filter((check) => check.trustBucket === "CONFIRMED").length;
    const likelyCount = reservations.length - confirmedCount;
    const grading = [
      confirmedCount > 0 && `${confirmedCount} confirmed`,
      likelyCount > 0 && `${likelyCount} likely`,
    ].filter(Boolean).join(", ");
    conditional.push({
      code: "UNRESOLVED_FAILURES",
      summary: `${reservations.length} ${plural(reservations.length, "failure", "failures")} outside the blocking set (${grading}).`,
      checkKeys: reservations.map((check) => check.checkKey),
    });
  }

  // ── The decision ───────────────────────────────────────────────────────────
  // Order matters and is argued at the top of this file.
  const decision: ReleaseDecision =
    blocking.length > 0 ? "BLOCKED"
      // Only coverage and missing collectors make a decision unsupportable.
      // EVIDENCE_REQUIRED is reported as unverified but does not by itself block
      // a decision — otherwise every scan of a product with a manual control
      // would be permanently inconclusive, and the state would stop meaning
      // anything.
      : unverified.some((reason) => reason.code !== "EVIDENCE_REQUIRED") ? "INCONCLUSIVE"
        : conditional.length > 0 ? "CONDITIONAL"
          : "READY";

  return {
    decision,
    policy: { id: policy.id, version: policy.version, label: policy.label },
    blocking,
    conditional,
    unverified,
    metrics: { health: breakdown.finalScore, coverage: Math.round(breakdown.completeness) },
  };
}

/**
 * Downgrade a decision made from a scan that did not finish.
 *
 * A partial scan can still prove a blocker — that is knowledge, and the
 * precedence argued at the top of this file says knowledge survives. What it
 * cannot do is clear a gate: READY and CONDITIONAL both assert that Pulse
 * looked and was satisfied, and a scan that crashed halfway did not look. The
 * failure mode this prevents is the quiet one — a scan errors, returns whatever
 * it managed to collect, finds nothing wrong in it, and reports a pass.
 */
export function withScanIncomplete(evaluation: GateEvaluation, reason: string): GateEvaluation {
  if (evaluation.decision === "BLOCKED") return evaluation;
  const unverified = [
    { code: "COVERAGE_BELOW_FLOOR" as const, summary: `The scan did not complete, so its coverage cannot be trusted. ${reason}`.trim(), checkKeys: [] },
    ...evaluation.unverified,
  ];
  return { ...evaluation, decision: "INCONCLUSIVE", unverified };
}

/** One line for a CI log or a Slack message. */
export function describeDecision(evaluation: GateEvaluation): string {
  const { decision, metrics, policy } = evaluation;
  const head = `${decision} · health ${metrics.health}/100 · coverage ${metrics.coverage}% · policy ${policy.id}@${policy.version}`;
  if (decision === "BLOCKED") return `${head} — ${evaluation.blocking.map((reason) => reason.summary).join(" ")}`;
  if (decision === "INCONCLUSIVE") return `${head} — ${evaluation.unverified.map((reason) => reason.summary).join(" ")}`;
  if (decision === "CONDITIONAL") return `${head} — ${evaluation.conditional.map((reason) => reason.summary).join(" ")}`;
  return head;
}
