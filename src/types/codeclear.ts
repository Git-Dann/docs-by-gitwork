export type PipelineStatus =
  | "SOURCED"
  | "INVITED"
  | "ASSESSMENT_IN_PROGRESS"
  | "CODECLEAR_COMPLETE"
  | "PLACED"
  | "RECHECK_DUE";

export type CodeClearTier = "TIER_1" | "TIER_2" | "TIER_3";

export type IdentityConfidence = "HIGH" | "MEDIUM" | "LOW" | "PENDING";

export type GitHubAnalysisStatus = "RUNNING" | "COMPLETED" | "FAILED";

export type GitHubAnalysisTriggerSource = "MANUAL";

export type CandidateAnalysisState =
  | "NEVER_RUN"
  | "RUNNING"
  | "DRAFT_UPDATED"
  | "COMPLETE"
  | "FAILED";

export type CandidateSortField =
  | "createdAt"
  | "updatedAt"
  | "name"
  | "status"
  | "recheckDueAt"
  | "overallScore";

export type CandidateSortDirection = "asc" | "desc";

export type RecheckFilter = "ANY" | "SOON" | "OVERDUE";

export interface CodeClearCandidateRecord {
  id: string;
  workspaceId: string;
  rateCardPersonId: string | null;
  name: string;
  githubHandle: string;
  email: string | null;
  primaryStack: string;
  location: string | null;
  bio: string | null;
  status: PipelineStatus;
  tier: CodeClearTier;
  avatarUrl: string | null;
  recheckDueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CodeClearScoreRecord {
  id: string;
  candidateId: string;
  technicalDepth: number;
  codeQuality: number;
  aiFluency: number;
  deliveryReadiness: number;
  identityConfidence: IdentityConfidence;
  overallScore: number;
  taskScore: number | null;
  taskTimeSeconds: number | null;
  taskAiReview: string | null;
  verifiedAt: string | null;
  validUntil: string | null;
  reminderSentAt: string | null;
  expiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CodeClearScoreDraftRecord {
  id: string;
  candidateId: string;
  technicalDepth: number | null;
  codeQuality: number | null;
  aiFluency: number | null;
  deliveryReadiness: number | null;
  identityConfidence: IdentityConfidence | null;
  overallScore: number | null;
  taskScore: number | null;
  taskTimeSeconds: number | null;
  taskAiReview: string | null;
  sourceRunId: string | null;
  lastAppliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubLanguageUsage {
  language: string;
  bytes: number;
}

export interface GitHubProfileSnapshot {
  login: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  htmlUrl: string;
  company: string | null;
  location: string | null;
  followers: number;
  following: number;
  publicRepos: number;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubRepoSnapshot {
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  size: number;
  recentCommitCount: number;
  recentActivity: boolean;
  hasReadme: boolean;
  hasDocs: boolean;
  hasTests: boolean;
  hasCi: boolean;
  hasLint: boolean;
  hasManifest: boolean;
  topics: string[];
  languages: GitHubLanguageUsage[];
  pushedAt: string;
  updatedAt: string;
  healthScore: number;
}

export interface GitHubAnalysisMetrics {
  publicRepoCount: number;
  selectedRepoCount: number;
  totalStars: number;
  averageStars: number;
  languageCount: number;
  topLanguages: GitHubLanguageUsage[];
  recentRepoRatio: number;
  docsCoverage: number;
  testsCoverage: number;
  ciCoverage: number;
  lintCoverage: number;
  manifestCoverage: number;
  averageRecentCommitCount: number;
  averageHealthScore: number;
}

export interface GitHubAnalysisRunRecord {
  id: string;
  candidateId: string;
  status: GitHubAnalysisStatus;
  triggerSource: GitHubAnalysisTriggerSource;
  analysisVersion: string;
  startedAt: string;
  completedAt: string | null;
  profileSnapshot: GitHubProfileSnapshot | null;
  repoSnapshot: GitHubRepoSnapshot[] | null;
  metrics: GitHubAnalysisMetrics | null;
  redFlags: string[] | null;
  recommendedTechnicalDepth: number | null;
  recommendedCodeQuality: number | null;
  recommendedDeliveryReadiness: number | null;
  llmSummary: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CodeClearPlacementRecord {
  id: string;
  candidateId: string;
  clientName: string;
  projectName: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
}

export interface CodeClearNoteRecord {
  id: string;
  candidateId: string;
  body: string;
  createdBy: string;
  createdAt: string;
}

export interface CodeClearActivityRecord {
  id: string;
  candidateId: string;
  eventType: string;
  metadata: unknown;
  createdAt: string;
  candidate?: {
    name: string;
    githubHandle: string;
  };
}

export interface CodeClearCandidateListItem extends CodeClearCandidateRecord {
  score: CodeClearScoreRecord | null;
  scoreDraft: CodeClearScoreDraftRecord | null;
  latestGitHubAnalysis: GitHubAnalysisRunRecord | null;
  analysisState: CandidateAnalysisState;
}

export interface CodeClearCandidateDetail extends CodeClearCandidateRecord {
  score: CodeClearScoreRecord | null;
  scoreDraft: CodeClearScoreDraftRecord | null;
  latestGitHubAnalysis: GitHubAnalysisRunRecord | null;
  githubAnalysisRuns: GitHubAnalysisRunRecord[];
  placements: CodeClearPlacementRecord[];
  notes: CodeClearNoteRecord[];
  activityLog: CodeClearActivityRecord[];
  analysisState: CandidateAnalysisState;
}

export interface CandidateListParams {
  q: string;
  page: number;
  pageSize: number;
  status?: PipelineStatus;
  tier?: CodeClearTier;
  identityConfidence?: IdentityConfidence;
  recheckDue?: RecheckFilter;
  sortBy: CandidateSortField;
  sortDir: CandidateSortDirection;
  stack: string;
  scoreMin?: number;
  scoreMax?: number;
}

export interface CandidateListResponse {
  items: CodeClearCandidateListItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    sortBy: CandidateSortField;
    sortDir: CandidateSortDirection;
  };
  facets: {
    stacks: string[];
  };
}

export interface CodeClearStatsResponse {
  total: number;
  byStatus: Array<{ status: PipelineStatus; count: number }>;
  avgThis: number | null;
  avgLast: number | null;
  passRateThis: number | null;
  recheckDue: number;
  recentActivity: CodeClearActivityRecord[];
}

export const PIPELINE_STATUSES: Array<{ value: PipelineStatus; label: string }> = [
  { value: "SOURCED", label: "Sourced" },
  { value: "INVITED", label: "Invited" },
  { value: "ASSESSMENT_IN_PROGRESS", label: "Assessment" },
  { value: "CODECLEAR_COMPLETE", label: "Verified" },
  { value: "PLACED", label: "Placed" },
  { value: "RECHECK_DUE", label: "Re-check Due" },
];

export const CODECLEAR_TIERS: Array<{ value: CodeClearTier; label: string }> = [
  { value: "TIER_1", label: "Tier 1" },
  { value: "TIER_2", label: "Tier 2" },
  { value: "TIER_3", label: "Tier 3" },
];

export const IDENTITY_CONFIDENCE_LEVELS: IdentityConfidence[] = [
  "HIGH",
  "MEDIUM",
  "LOW",
  "PENDING",
];

export function statusLabel(status: PipelineStatus | string) {
  return PIPELINE_STATUSES.find((entry) => entry.value === status)?.label ?? status;
}

export function tierLabel(tier: CodeClearTier | string) {
  return CODECLEAR_TIERS.find((entry) => entry.value === tier)?.label ?? tier;
}

export function deriveCandidateAnalysisState(
  latestGitHubAnalysis: Pick<GitHubAnalysisRunRecord, "id" | "status"> | null,
  scoreDraft: Pick<CodeClearScoreDraftRecord, "sourceRunId" | "updatedAt"> | null,
  score: Pick<CodeClearScoreRecord, "updatedAt"> | null,
): CandidateAnalysisState {
  if (!latestGitHubAnalysis) {
    return "NEVER_RUN";
  }

  if (latestGitHubAnalysis.status === "RUNNING") {
    return "RUNNING";
  }

  if (latestGitHubAnalysis.status === "FAILED") {
    return "FAILED";
  }

  if (scoreDraft?.sourceRunId === latestGitHubAnalysis.id) {
    const draftUpdatedAt = new Date(scoreDraft.updatedAt).getTime();
    const scoreUpdatedAt = score ? new Date(score.updatedAt).getTime() : 0;

    if (!score || draftUpdatedAt > scoreUpdatedAt) {
      return "DRAFT_UPDATED";
    }
  }

  return "COMPLETE";
}

export function analysisStateLabel(state: CandidateAnalysisState) {
  switch (state) {
    case "RUNNING":
      return "Running";
    case "DRAFT_UPDATED":
      return "Draft updated";
    case "COMPLETE":
      return "Complete";
    case "FAILED":
      return "Failed";
    default:
      return "Never run";
  }
}
