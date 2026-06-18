export type PulseScanStatus = "RUNNING" | "COMPLETED" | "FAILED";
export type PulseScanInputType = "URL" | "GITHUB_REPO" | "FREE_TEXT";
export type PulseCheckStatus = "PASS" | "WARN" | "FAIL" | "SKIPPED";
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

export interface PulseTechStackAnalysis {
  assessment: string;
  detectedStack: InfrastructureStack;
  recommendations: TechStackRecommendation[];
  missingForProduction: string[];
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
  shareToken: string | null;
  isShared: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  generatedProposalId: string | null;
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
  createdAt: string;
  updatedAt: string;
}

// ── Industry benchmarks (Wave E3) ─────────────────────────────────────────────
export interface IndustryBenchmark {
  projectType: string;   // the classification this scan was benchmarked within
  peerCount: number;     // other completed scans of the same type in the workspace
  yourScore: number;     // this scan's health score
  percentile: number;    // 0–100: % of peers this scan scores at or above
  median: number;        // median peer health score
  best: number;          // best peer health score
}

export interface PulseScanCheckInput {
  category: string;
  checkKey: string;
  label: string;
  status: PulseCheckStatus;
  detail?: string;
  evidence?: string;
  sortOrder?: number;
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
