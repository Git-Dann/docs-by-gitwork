import type { CheckCategory } from "@/server/pulse-checks/categories";
export type { CheckCategory };

export type PulseScanStatus = "RUNNING" | "COMPLETED" | "FAILED";
export type PulseScanInputType = "URL" | "GITHUB_REPO" | "FREE_TEXT";
export type PulseCheckStatus =
  | "PASS"
  | "WARN"
  | "FAIL"
  | "SKIPPED"
  | "NOT_APPLICABLE"
  | "INCONCLUSIVE"
  | "ERROR"
  | "NOT_TESTED"
  | "EVIDENCE_REQUIRED";
export type PulseControlSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type PulseEvidenceStrength = "VERIFIED" | "STRONG" | "HEURISTIC" | "CLAIMED";
export type PulseUrgency = "CRITICAL" | "HIGH" | "MEDIUM";
export type PulseEffort = "S" | "M" | "L" | "XL";
export type PulseBusinessValue = "HIGH" | "MEDIUM" | "LOW";
export type PulseSeverity = "HIGH" | "MEDIUM" | "LOW";
export type TechStackPriority = "HIGH" | "MEDIUM" | "LOW";

export interface TechStackRecommendation {
  area: string;
  current: string | null;
  recommended: string;
  reason: string;
  priority: TechStackPriority;
}

export interface InfrastructureStack {
  frontend: string | null;
  backend: string | null;
  database: string | null;
  hosting: string | null;
  auth: string | null;
  payments: string | null;
  email: string | null;
  storage: string | null;
  caching: string | null;
  search: string | null;
  backgroundJobs: string | null;
  monitoring: string | null;
  analytics: string | null;
  cicd: string | null;
}

/** One layer of the recommended 2026 target architecture, with migration cost/risk. */
export interface TargetArchitectureLayer {
  layer: string;        // one of the InfrastructureStack keys (frontend, database, …)
  current: string | null;
  recommended: string;
  alternativeOptions: { name: string; pros: string[]; cons: string[]; approxCostPerMonthGbp: number }[];
  migration: { effort: PulseEffort; weeks: number; steps: string[]; blockers: string[] };
  risk: { level: "LOW" | "MEDIUM" | "HIGH"; concerns: string[]; mitigation: string };
  rationale: string;
  appliesAt: "MVP" | "GROWTH" | "SCALE";
}

export interface ArchitecturePhase {
  phase: number;
  duration: string;
  layers: string[];
  outcome: string;
}

export interface PulseTechStackAnalysis {
  assessment: string;
  detectedStack: InfrastructureStack;
  recommendations: TechStackRecommendation[];
  missingForProduction: string[];
  // Phase 2 (optional, additive): full target architecture + phased migration path.
  targetArchitecture?: TargetArchitectureLayer[];
  architecturePhases?: ArchitecturePhase[];
}

export interface PulseScanCheckRecord {
  id: string;
  scanId: string;
  category: string;
  checkKey: string;
  label: string;
  status: PulseCheckStatus;
  detail: string | null;
  evidence: string | null;
  sortOrder: number;
  createdAt: string;
  confidence: CheckConfidence | null;
  confidenceReason: string | null;
  trustBucket: TrustBucket | null;
  severity: PulseControlSeverity | null;
  evidenceStrength: PulseEvidenceStrength | null;
  scoreEligible: boolean;
  completenessEligible: boolean;
  controlId: string | null;
  detectorStatus: PulseCheckStatus | null;
  detectorDetail: string | null;
}

export interface PulseStrength {
  title: string;
  detail: string;
}

export interface PulseCriticalGap {
  category: string;
  gap: string;
  impact: string;
  urgency: PulseUrgency;
}

export interface PulseBuildOpportunity {
  title: string;
  description: string;
  estimatedEffort: PulseEffort;
  businessValue: PulseBusinessValue;
  category: string;
}

export interface PulseScalingPhase {
  phase: number;
  title: string;
  duration: string;
  goals: string[];
}

export interface PulseTechDebt {
  area: string;
  description: string;
  severity: PulseSeverity;
}

export type ProductionReadinessStatus = "DONE" | "MISSING" | "PARTIAL";

export interface ProductionReadinessItem {
  category: string;
  item: string;
  status: ProductionReadinessStatus;
  notes: string;
}

// Pre-production blockers — things the client cannot go live without
export interface ProductionBlocker {
  category: string;
  blocker: string;      // what's missing / broken
  why: string;          // business/legal/operational risk if not fixed
  recommendedService?: string;  // specific named service Gitwork recommends, e.g. "Resend", "Mailgun", "Sentry"
  urgency: "CRITICAL" | "HIGH";
}

export interface PulseProjectClassification {
  type: string;           // e.g. "E-commerce", "SaaS", "Marketplace", "Service Business"
  subtype: string | null; // e.g. "B2B SaaS", "Caravan / RV aftermarket", "Booking platform"
  confidence: "HIGH" | "MEDIUM" | "LOW";
  signals: string[];          // scan signals that led to this classification
  verticalInsights: string[]; // 3–5 vertical-specific recommendations for this project type
}

export interface PulseAnalysisOutput {
  projectClassification: PulseProjectClassification;
  executiveSummary: string;
  healthNarrative: string;
  strengths: PulseStrength[];
  criticalGaps: PulseCriticalGap[];
  buildOpportunities: PulseBuildOpportunity[];
  scalingRoadmap: PulseScalingPhase[];
  techDebt: PulseTechDebt[];
  proposalHook: string;
  productionBlockers: ProductionBlocker[];
  productionReadinessChecklist: ProductionReadinessItem[];
  techStackAnalysis: PulseTechStackAnalysis;
  aiMaturityScore?: number; // 0–4: Prototype / Functional / Production / Robust / Mature
  competitorSuggestions?: { url: string; name: string | null; reason: string }[]; // AI-suggested benchmarks (Wave D3)
  engagementEstimate?: EngagementEstimate | null; // F3 — effort/cost/timeline to production
  intakeAssessment?: IntakeAssessment | null; // F2 — stage / market / regulatory / feasibility
}

// F2 — idea/prototype intake assessment
export interface IntakeRegulatoryFlag {
  area: string;
  note: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
}
export interface IntakeAssessment {
  stage: "IDEA" | "PROTOTYPE" | "MVP" | "PRODUCTION";
  marketSignal: string;
  feasibility: string;
  riskiestAssumption: string;
  regulatoryFlags: IntakeRegulatoryFlag[];
}

// F3 — indicative effort/cost/timeline to take the product to production (seeds a proposal)
export interface EngagementPhase {
  name: string;
  weeks: number;
  outcome: string;
}
export interface EngagementEstimate {
  summary: string;
  weeksLow: number;
  weeksHigh: number;
  priceLow: number;   // indicative GBP
  priceHigh: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  phases: EngagementPhase[];
}

export const AI_MATURITY_LABELS: readonly string[] = ["Prototype", "Functional", "Production", "Robust", "Mature"];

/** A pricing/timeline tier for a given team size — deterministic, GBP, rate-card-grounded. */
export interface PricingBand {
  devs: number;          // 1 | 2 | 3
  weeksLow: number;      // calendar weeks for this team size
  weeksHigh: number;
  priceLowGbp: number;
  priceHighGbp: number;
  blendedDayRateGbp: number;
  rationale: string;     // e.g. "2 devs · ~6 wks · coordination overhead applied"
}

/** Workspace-level Pulse pricing config (stored on Workspace.pulsePricingConfig). */
export interface PulsePricingConfig {
  fxFromUsd: number;            // USD→GBP multiplier for rate-card conversion (e.g. 0.79)
  dayRateOverrideGbp?: number;  // if set, used instead of the rate-card blend
  seniority?: "mid" | "senior"; // which band of the rate card to blend
}

/** One requirement that a selected jurisdiction expects but the scan didn't satisfy. */
export interface ComplianceGapItem {
  checkKey: string;
  label: string;
  detail: string;
}

/** Per-jurisdiction compliance breakdown — deterministic, computed from the checks.
 *  `jurisdiction` is a JurisdictionCode (kept as string here to avoid coupling the
 *  shared types file to the server-side taxonomy module). */
export interface JurisdictionScorecardEntry {
  jurisdiction: string;
  label: string;
  primaryLaw: string;
  requiredChecks: number;
  passing: number;
  failing: number;
  missing: ComplianceGapItem[];
  compliancePct: number;
}

/** "Why this score" breakdown — mirrors calculateHealthScore so the explanation
 *  can never drift from the headline number. */
export interface ScoreCategoryBreakdown {
  category: string;
  weight: number;
  pass: number;
  warn: number;
  fail: number;
  skipped: number;
  unknown: number;
  earned: number;
  possible: number;
}
export interface ScoreCap {
  cap: number;
  reason: string;
}
export interface ScoreBreakdown {
  rawScore: number;
  finalScore: number;
  totalWeight: number;
  earnedWeight: number;
  byCategory: ScoreCategoryBreakdown[];
  capsApplied: ScoreCap[];
  scoreVersion: "pulse-score-v3";
  policyVersion: "pulse-policy-v3";
  completeness: number;
  lowerBound: number;
  upperBound: number;
  unknownWeight: number;
  excludedCount: number;
  /**
   * Which collectors ran, failed, or could not run — the EXPLANATION of
   * `completeness`, which is otherwise a percentage with no account of itself.
   * Optional: scans recorded before this existed have none, and a missing value
   * must read as "not recorded", never as "everything ran".
   */
  collectors?: {
    completed: number;
    failed: number;
    notApplicable: number;
    failedNames: string[];
    unavailable: { name: string; reason: string }[];
  };
  /**
   * The release decision — READY / CONDITIONAL / BLOCKED / INCONCLUSIVE — under a
   * named, versioned policy. Optional: scans predating the gate have none, and a
   * missing value must read as "no decision was taken", never as READY.
   */
  gate?: GateEvaluationRecord;
}

export type ReleaseDecisionState = "READY" | "CONDITIONAL" | "BLOCKED" | "INCONCLUSIVE";

export interface GateReasonRecord {
  code: string;
  summary: string;
  checkKeys: string[];
}

export interface GateEvaluationRecord {
  decision: ReleaseDecisionState;
  policy: { id: string; version: string; label: string };
  blocking: GateReasonRecord[];
  conditional: GateReasonRecord[];
  unverified: GateReasonRecord[];
  metrics: { health: number; coverage: number };
}

export interface PulseScanRecord {
  id: string;
  workspaceId: string;
  clientId: string | null;
  clientName: string | null;
  projectName: string;
  inputType: PulseScanInputType;
  inputUrl: string | null;
  inputGithubRepo: string | null;
  inputDescription: string | null;
  platform: string | null;
  status: PulseScanStatus;
  scanVersion: string;
  startedAt: string;
  completedAt: string | null;
  checksCompletedAt: string | null;
  healthScore: number | null;
  previousHealthScore: number | null;
  techStack: string[] | null;
  llmAnalysis: PulseAnalysisOutput | null;
  discoveryKit: DiscoveryKit | null;
  codeInsights: CodeAgentInsights | null;
  deployInsights: DeployAgentInsights | null;
  browserInsights: BrowserAgentInsights | null;
  visualInsights: VisualAgentInsights | null;
  aiError: string | null;
  competitorUrls: string[] | null;
  competitorData: CompetitorData | null;
  /** Jurisdiction codes the user declared this product serves (null = legacy/auto-only). */
  targetMarkets: string[] | null;
  /** Jurisdiction codes auto-detected during the scan (audit + legacy fallback). */
  detectedMarkets: string[] | null;
  /** Deterministic per-market required/missing compliance breakdown. */
  complianceScorecard: JurisdictionScorecardEntry[] | null;
  /** "Why this score" — per-category contribution + any hard caps applied. */
  scoreBreakdown: ScoreBreakdown | null;
  /** Deterministic dev-tier pricing/timeline bands (1/2/3 devs), GBP. */
  pricingBands: PricingBand[] | null;
  shareToken: string | null;
  isShared: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  generatedProposalId: string | null;
  /** Optional Study launched to validate this scan's assumptions (Study is a Pulse tool). */
  linkedStudyId: string | null;
  /** Optional Starter (Prompt→Production building block) adopted from this scan. */
  linkedStarterId: string | null;
  checks: PulseScanCheckRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface PulseScanListItem {
  id: string;
  workspaceId: string;
  clientId: string | null;
  clientName: string | null;
  projectName: string;
  inputType: PulseScanInputType;
  inputUrl: string | null;
  inputGithubRepo: string | null;
  status: PulseScanStatus;
  healthScore: number | null;
  generatedProposalId: string | null;
  /** Whether the tokenised public report (and therefore the score badge) is live. */
  isShared: boolean;
  /**
   * Only populated while `isShared` — an unshared scan's token is never handed
   * out, and unsharing clears it in the database anyway. Once shared this is no
   * more secret than the /report/[token] link it belongs to.
   */
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Portfolio (dashboard, client-grouped) ─────────────────────────────────────
// One row per client (or per standalone target for unassigned scans). Aggregated
// server-side in a single pass so the dashboard scales to 100s of clients without
// an N+1 of per-target history fetches.
export interface PulsePortfolioEntry {
  key: string;                 // stable group key (client:<id> | target:<url|repo|name>)
  clientId: string | null;
  label: string;               // client name, or the project name for standalone scans
  scanCount: number;
  latestScanId: string | null;
  latestScore: number | null;  // most-recent scan's health (null while running / never completed)
  latestStatus: PulseScanStatus | null;
  lastScannedAt: string | null;
  delta: number | null;        // latest completed score − previous completed score (same group)
  sparkline: number[];         // up to 8 most-recent completed scores, chronological
  worstScore: number | null;   // lowest current score across the group's targets (attention signal)
  monitor: { active: boolean; alerting: boolean } | null; // null when no monitor watches any target
  running: boolean;            // a scan in this group is currently RUNNING
}

// ── Industry benchmarks (Wave E3) ─────────────────────────────────────────────
export interface IndustryBenchmark {
  projectType: string;   // the segment this scan was benchmarked within
  peerCount: number;     // other completed scans in that segment
  yourScore: number;     // this scan's health score
  percentile: number;    // 0–100: % of peers this scan scores at or above
  median: number;        // median peer health score
  best: number;          // best peer health score
  // True when the platform segment was too small and we widened to the whole
  // corpus. The reader must be told: different project types have different
  // achievable ceilings, so a cross-type ranking is indicative, not a fact.
  widened?: boolean;
  // One sentence naming the corpus. Travels WITH the figure rather than beside
  // it, because a percentile gets screenshotted and outlives its context.
  caveat?: string;
}

export type CheckConfidence = "HIGH" | "MEDIUM" | "LOW";
export type TrustBucket = "CONFIRMED" | "LIKELY" | "VERIFIED_WORKING" | "INCONCLUSIVE";

export interface ScanDiffItem {
  checkKey: string;
  label: string;
  category: string;
  status: PulseCheckStatus;
  prevStatus?: PulseCheckStatus;
}

/**
 * A finding this scan can no longer speak to. `status` is nullable here and
 * nowhere else, because the commonest case is a control that produced no row at
 * all — and a made-up status would be exactly the fiction this bucket exists to
 * prevent. Shapes match `pulse-checks/scan-diff.ts`, which computes them.
 */
export interface UnverifiedDiffItem {
  checkKey: string;
  label: string;
  category: string;
  status: PulseCheckStatus | null;
  prevStatus: PulseCheckStatus;
  reason: "CHECK_ABSENT" | "PROBE_INCONCLUSIVE" | "CHECK_DISABLED" | "NOT_APPLICABLE_NOW" | "PASS_NOT_PROVEN";
  detail: string;
}

export interface PulseScanDiff {
  previousScanId: string;
  previousCompletedAt: string | null;
  scoreChange: number; // current - previous health score
  fixed: ScanDiffItem[];     // was an issue, now passing WITH PROOF
  regressed: ScanDiffItem[]; // was PASS, now FAIL/WARN
  newIssues: ScanDiffItem[]; // FAIL/WARN checkKey not present last time
  /**
   * Was an issue, and this scan cannot say whether it still is — the control
   * did not run, was switched off, stopped applying, or passed on evidence too
   * weak to count. NOT a fix. Left out of a diff, these findings simply vanish,
   * which is how "we stopped looking" reads as "we sorted it".
   */
  unverified: UnverifiedDiffItem[];
}

export interface PulseScanCheckInput {
  // Typed to the canonical union so a typo'd / unregistered category is a compile
  // error. The single source of truth is src/server/pulse-checks/categories.ts.
  category: CheckCategory;
  checkKey: string;
  label: string;
  status: PulseCheckStatus;
  detail?: string;
  evidence?: string;
  sortOrder?: number;
  // Trust layer — how sure we are this check is true, and which bucket it falls in.
  confidence?: CheckConfidence;
  confidenceReason?: string;
  trustBucket?: TrustBucket;
  severity?: PulseControlSeverity;
  evidenceStrength?: PulseEvidenceStrength;
  /** False for diagnostics, manual evidence and product-growth observations. */
  scoreEligible?: boolean;
  /** Diagnostic unknowns can reduce scan completeness without changing health. */
  completenessEligible?: boolean;
  /** Shared by controls backed by the same underlying signal. */
  controlId?: string;
  /**
   * What the detector concluded before workspace policy was applied. Set only when
   * policy changed the verdict, so `null`/absent means `status` is the detector's
   * own. Never write this from a check module — `applyCheckPolicy` owns it.
   */
  detectorStatus?: PulseCheckStatus;
  detectorDetail?: string;
}

// ── Agent intelligence outputs ────────────────────────────────────────────────

export interface CodeAgentInsights {
  vulnerabilities: { severity: string; packageName: string; description: string }[];
  branchProtected: boolean;
  requiresReviews: boolean;
  prReviewRate: number | null;    // 0–1, % of merged PRs that had at least 1 review
  commitVelocity: number | null;  // commits per week (last 30 days)
  uniqueContributors: number | null;
  homepageUrl: string | null;
  exposedSecrets?: { file: string; type: string }[]; // Wave B — secrets found in committed source
}

export interface DeployAgentInsights {
  platform: "vercel" | "netlify" | "railway" | "other" | null;
  recentDeployments: number | null;
  failedDeployments: number | null;
  avgBuildMs: number | null;
  buildWarnings: string[];
  recentErrorPatterns: string[];
}

export interface BrowserAgentInsights {
  performanceScore: number | null;  // 0–100
  accessibilityScore: number | null;
  seoScore: number | null;
  bestPracticesScore: number | null;
  lcp: number | null;   // ms
  cls: number | null;
  fcp: number | null;   // ms
  tbt: number | null;   // ms
  cruxCategory: string | null;
}

// Wave D1 — Visual Quality (vision-AI scan of the above-the-fold screenshot)
export interface VisualAgentInsights {
  visualQualityScore: number | null;  // 0–100 overall design polish
  valuePropClarity: number | null;    // 0–100
  ctaProminence: number | null;       // 0–100
  trustSignals: number | null;        // 0–100
  mobileFriendly: boolean | null;
  visualNarrative: string | null;     // 1–2 sentence biggest win + biggest gap
  a11yViolations?: number | null;     // F4 — total axe-core violations
  a11ySerious?: number | null;        // F4 — serious + critical violations
}

// ── Competitor benchmarking ───────────────────────────────────────────────────

export interface CompetitorScanSummary {
  url: string;
  healthScore: number;
  checksPass: number;
  checksWarn: number;
  checksFail: number;
  techStack: string[];
}

export interface CompetitorComparison {
  summary: string;
  advantages: string[];    // where user's project leads
  gaps: string[];          // where competitors lead
  recommendation: string;
}

export interface CompetitorData {
  scans: CompetitorScanSummary[];
  comparison: CompetitorComparison | null;
}

// ── Discovery call kit ────────────────────────────────────────────────────────

export interface DiscoveryQuestion {
  question: string;
  context: string;    // why this question, based on scan findings
  followUp: string;
}

export interface DiscoveryObjection {
  objection: string;
  response: string;
}

export interface DiscoveryKit {
  openingStatement: string;
  wowFinding: { finding: string; impact: string };
  questions: DiscoveryQuestion[];
  anticipatedObjections: DiscoveryObjection[];
  pricingAnchor: { low: number; high: number; rationale: string };
  talkingPoints: string[];
}
