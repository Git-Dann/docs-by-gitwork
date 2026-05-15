export type PulseScanStatus = "RUNNING" | "COMPLETED" | "FAILED";
export type PulseScanInputType = "URL" | "GITHUB_REPO" | "FREE_TEXT";
export type PulseCheckStatus = "PASS" | "WARN" | "FAIL" | "SKIPPED";
export type PulseUrgency = "CRITICAL" | "HIGH" | "MEDIUM";
export type PulseEffort = "S" | "M" | "L" | "XL";
export type PulseBusinessValue = "HIGH" | "MEDIUM" | "LOW";
export type PulseSeverity = "HIGH" | "MEDIUM" | "LOW";

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

export interface PulseAnalysisOutput {
  executiveSummary: string;
  healthNarrative: string;
  strengths: PulseStrength[];
  criticalGaps: PulseCriticalGap[];
  buildOpportunities: PulseBuildOpportunity[];
  scalingRoadmap: PulseScalingPhase[];
  techDebt: PulseTechDebt[];
  proposalHook: string;
  productionReadinessChecklist: ProductionReadinessItem[];
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
  status: PulseScanStatus;
  scanVersion: string;
  startedAt: string;
  completedAt: string | null;
  healthScore: number | null;
  previousHealthScore: number | null;
  techStack: string[] | null;
  llmAnalysis: PulseAnalysisOutput | null;
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

export interface PulseScanCheckInput {
  category: string;
  checkKey: string;
  label: string;
  status: PulseCheckStatus;
  detail?: string;
  evidence?: string;
  sortOrder?: number;
}
