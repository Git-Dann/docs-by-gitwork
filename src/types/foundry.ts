export const FOUNDRY_MODULE_KEYS = [
  "hq",
  "pulse",
  "code",
  "docs",
  "portal",
  "care",
  "study",
] as const;

export type FoundryModuleKey = (typeof FOUNDRY_MODULE_KEYS)[number];

export type DeliveryStage =
  | "Study"
  | "Scoping"
  | "Delivery"
  | "Launch"
  | "Care";

export type HealthStatus = "on_track" | "watch" | "at_risk";

export type EntityStatus = "active" | "paused" | "done";

export type RiskSeverity = "low" | "medium" | "high";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type UpdateType = "internal" | "client" | "system";

export type UpdateQuality = "clear" | "vague";

export type ProgressState = "progress" | "no_progress";

export type IntegrationSource =
  | "slack"
  | "github"
  | "google_drive"
  | "email";

export type DocumentTemplateKey =
  | "client_update"
  | "project_scope"
  | "sprint_plan"
  | "handover_note";

export type DocumentStatus = "draft" | "ready" | "shared" | "approved";

export interface ClientRecord {
  id: string;
  name: string;
  slug: string;
  status: EntityStatus;
  primaryContact: string;
}

export interface RoleRecord {
  id: string;
  name: string;
  discipline: string;
}

export interface PersonRecord {
  id: string;
  name: string;
  roleId: string;
  allocationPercent: number;
}

export interface ProjectRecord {
  id: string;
  slug: string;
  name: string;
  clientId: string;
  summary: string;
  stage: DeliveryStage;
  ownerId: string;
  teamIds: string[];
  moduleKeys: FoundryModuleKey[];
  startDate: string;
  targetDate: string;
  nextMilestone: string;
  nextMilestoneDate: string;
  updateCadenceDays: number;
  confidenceScore: number;
}

export interface WorkstreamRecord {
  id: string;
  projectId: string;
  name: string;
  ownerId: string;
  status: EntityStatus;
  nextMilestone: string;
  nextMilestoneDate: string;
}

export interface TaskRecord {
  id: string;
  projectId: string;
  workstreamId: string;
  title: string;
  status: EntityStatus;
  ownerId?: string;
  source: IntegrationSource;
  externalRef: string;
}

export interface UpdateRecord {
  id: string;
  projectId: string;
  authorId: string;
  type: UpdateType;
  quality: UpdateQuality;
  progress: ProgressState;
  body: string;
  createdAt: string;
  source: IntegrationSource;
  visibleToClient: boolean;
}

export interface RiskRecord {
  id: string;
  projectId: string;
  title: string;
  detail: string;
  severity: RiskSeverity;
  ownerId?: string;
  status: "open" | "mitigated";
}

export interface BlockerRecord {
  id: string;
  projectId: string;
  title: string;
  detail: string;
  ownerId?: string;
  status: "open" | "resolved";
  repeatedCount: number;
  clientInputRequired: boolean;
}

export interface DecisionRecord {
  id: string;
  projectId: string;
  title: string;
  outcome: string;
  decidedAt: string;
}

export interface DocumentRecord {
  id: string;
  projectId: string;
  title: string;
  template: DocumentTemplateKey;
  status: DocumentStatus;
  updatedAt: string;
  summary: string;
  generatedByAi: boolean;
}

export interface ApprovalRecord {
  id: string;
  projectId: string;
  title: string;
  requestedFrom: "client" | "internal";
  status: ApprovalStatus;
  dueAt: string;
}

export interface SupportTicketRecord {
  id: string;
  projectId: string;
  title: string;
  status: "open" | "triaged" | "resolved";
}

export interface ReleaseRecord {
  id: string;
  projectId: string;
  name: string;
  targetDate: string;
  status: "planned" | "ready" | "shipped";
}

export interface CodeReviewRecord {
  id: string;
  projectId: string;
  title: string;
  status: "pass" | "needs_review" | "fail";
  updatedAt: string;
}

export interface ResearchInsightRecord {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  source: string;
}

export interface IntegrationSignalRecord {
  id: string;
  projectId: string;
  source: IntegrationSource;
  label: string;
  detail: string;
  capturedAt: string;
}

export interface AIGeneratedOutputRecord {
  id: string;
  projectId: string;
  moduleKey: FoundryModuleKey;
  title: string;
  updatedAt: string;
}

export interface DocumentTemplateRecord {
  key: DocumentTemplateKey;
  name: string;
  description: string;
  outputLabel: string;
}

export interface FoundryWorkspaceRecord {
  clients: ClientRecord[];
  projects: ProjectRecord[];
  workstreams: WorkstreamRecord[];
  tasks: TaskRecord[];
  people: PersonRecord[];
  roles: RoleRecord[];
  updates: UpdateRecord[];
  risks: RiskRecord[];
  blockers: BlockerRecord[];
  decisions: DecisionRecord[];
  documents: DocumentRecord[];
  approvals: ApprovalRecord[];
  supportTickets: SupportTicketRecord[];
  releases: ReleaseRecord[];
  codeReviews: CodeReviewRecord[];
  researchInsights: ResearchInsightRecord[];
  integrationSignals: IntegrationSignalRecord[];
  aiOutputs: AIGeneratedOutputRecord[];
  documentTemplates: DocumentTemplateRecord[];
}
