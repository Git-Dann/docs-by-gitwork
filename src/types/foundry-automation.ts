import type { WorkspaceClientStatus } from "@/types/client";

export type AutomationGateKey =
  | "notes"
  | "proposal"
  | "sent"
  | "signature"
  | "onboarding"
  | "activation"
  | "plan";

export type AutomationGateState = "done" | "ready" | "waiting" | "blocked";

export type AutomationStageKey =
  | "INTAKE_NEEDED"
  | "DRAFT_PROPOSAL"
  | "REVIEW_PROPOSAL"
  | "WAITING_SIGNATURE"
  | "SEND_ONBOARDING"
  | "READY_TO_ACTIVATE"
  | "READY_TO_SEED_PLAN"
  | "DELIVERY_ACTIVE";

export type AutomationActionKind = "link" | "seed_project_plan" | "none";

export type AutomationGate = {
  key: AutomationGateKey;
  label: string;
  state: AutomationGateState;
  detail: string;
};

export type AutomationAction = {
  kind: AutomationActionKind;
  label: string;
  href?: string;
  disabled?: boolean;
  reason?: string;
};

export type AutomationClientRef = {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceClientStatus;
};

export type AutomationDocumentRef = {
  id: string;
  title: string;
  status: string;
  documentType: string;
  updatedAt: string;
};

export type AutomationMeetingRef = {
  id: string;
  title: string;
  status: string;
  startedAt: string | null;
  summary: string | null;
  actionItemCount: number;
};

export type AutomationOnboardingRef = {
  id: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "LINKED" | string;
  submittedAt: string | null;
  linkedAt: string | null;
};

export type AutomationProjectPlanRef = {
  featureBlockCount: number;
  milestoneCount: number;
  taskCount: number;
};

export type FoundryAutomationItem = {
  client: AutomationClientRef;
  stage: AutomationStageKey;
  stageLabel: string;
  confidence: number;
  gates: AutomationGate[];
  nextAction: AutomationAction;
  latestMeeting: AutomationMeetingRef | null;
  sourceProposal: AutomationDocumentRef | null;
  contractDocument: AutomationDocumentRef | null;
  onboarding: AutomationOnboardingRef | null;
  projectPlan: AutomationProjectPlanRef;
};

export type FoundryAutomationSummary = {
  total: number;
  humanGates: number;
  agentReady: number;
  waitingOnClient: number;
  activePlanGaps: number;
};

export type FoundryAutomationResponse = {
  summary: FoundryAutomationSummary;
  items: FoundryAutomationItem[];
};

export type SeedProjectPlanResult = {
  clientId: string;
  clientSlug: string;
  sourceDocumentId: string;
  sourceDocumentTitle: string;
  created: {
    featureBlocks: number;
    milestones: number;
    tasks: number;
  };
  skipped: {
    featureBlocks: number;
    milestones: number;
    tasks: number;
  };
};
