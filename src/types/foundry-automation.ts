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

export type AutomationActionKind =
  | "link"
  | "draft_proposal"
  | "send_onboarding"
  | "seed_project_plan"
  | "none";

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

export type AutomationActivityKind =
  | "proposal_preview"
  | "proposal_draft"
  | "onboarding_link"
  | "signature_completed"
  | "onboarding_submitted"
  | "client_activated"
  | "delivery_plan_seeded"
  | "nudge_updated";

export type AutomationActivityRef = {
  id: string;
  kind: AutomationActivityKind;
  label: string;
  detail: string;
  at: string;
  actorName: string | null;
};

export type AutomationNudgeKind =
  | "signature_stale"
  | "onboarding_stale"
  | "active_plan_gap";

export type AutomationNudge = {
  kind: AutomationNudgeKind;
  label: string;
  detail: string;
  since: string | null;
  state: {
    assignedToName: string | null;
    snoozedUntil: string | null;
    note: string | null;
    updatedAt: string | null;
    updatedByName: string | null;
  } | null;
};

export type AutomationRunHistoryItem = {
  id: string;
  clientId: string;
  clientName: string | null;
  action: string;
  label: string;
  status: "PREVIEWED" | "APPROVED" | "UPDATED";
  inputSummary: string;
  outputSummary: string;
  at: string;
  actorName: string | null;
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
  createdAt: string;
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
  activity: AutomationActivityRef[];
  nudges: AutomationNudge[];
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
  completedItems: FoundryAutomationItem[];
  runHistory: AutomationRunHistoryItem[];
};

export type ProjectPlanRequest = {
  clientId: string;
  documentId?: string;
  startDate?: string;
};

export type DraftProposalRequest = {
  clientId: string;
  meetingId?: string;
  draft?: ProposalDraftEdits;
};

export type ProposalDraftEdits = {
  title?: string;
  summary?: string;
  objectives?: string[];
  touchpoints?: string[];
  assumptions?: string[];
  outOfScope?: string[];
  nextSteps?: string;
};

export type ProposalDraftPreviewRequest = {
  clientId: string;
  meetingId?: string;
};

export type ProposalDraftPreview = {
  clientId: string;
  clientSlug: string;
  clientName: string;
  meetingId: string;
  meetingTitle: string;
  meetingStartedAt: string | null;
  existingDraft: {
    id: string;
    title: string;
    href: string;
  } | null;
  draft: Required<ProposalDraftEdits>;
  sections: Array<{
    key: keyof Required<ProposalDraftEdits>;
    label: string;
    detail: string;
    items: string[];
  }>;
};

export type DraftProposalResult = {
  clientId: string;
  clientSlug: string;
  meetingId: string;
  meetingTitle: string;
  proposalId: string;
  proposalTitle: string;
  href: string;
  created: boolean;
};

export type AutomationOnboardingLinkRequest = {
  clientId: string;
};

export type AutomationNudgeUpdateRequest = {
  clientId: string;
  kind: AutomationNudgeKind;
  assignedToName?: string | null;
  snoozedUntil?: string | null;
  note?: string | null;
};

export type AutomationNudgeUpdateResult = {
  clientId: string;
  kind: AutomationNudgeKind;
  assignedToName: string | null;
  snoozedUntil: string | null;
  note: string | null;
  updatedAt: string;
  updatedByName: string | null;
};

export type AutomationOnboardingLinkResult = {
  clientId: string;
  clientSlug: string;
  clientName: string;
  contactEmail: string | null;
  linkId: string;
  accessToken: string;
  path: string;
  label: string | null;
  status: "IN_PROGRESS" | "SUBMITTED" | "LINKED";
  created: boolean;
};

export type ProjectPlanPreviewTask = {
  key: string;
  title: string;
  description: string;
  dueDate: string;
  existing: boolean;
};

export type ProjectPlanPreviewBlock = {
  key: string;
  phaseId: string;
  name: string;
  summary: string;
  startDate: string;
  endDate: string;
  color: string;
  existing: boolean;
  tasks: ProjectPlanPreviewTask[];
};

export type ProjectPlanPreviewMilestone = {
  key: string;
  phaseId: string;
  name: string;
  description: string;
  date: string;
  color: string;
  existing: boolean;
};

export type ProjectPlanPreview = {
  clientId: string;
  clientSlug: string;
  sourceDocumentId: string;
  sourceDocumentTitle: string;
  startDate: string;
  totals: {
    featureBlocks: number;
    milestones: number;
    tasks: number;
    newFeatureBlocks: number;
    newMilestones: number;
    newTasks: number;
    existingFeatureBlocks: number;
    existingMilestones: number;
    existingTasks: number;
  };
  blocks: ProjectPlanPreviewBlock[];
  milestones: ProjectPlanPreviewMilestone[];
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
