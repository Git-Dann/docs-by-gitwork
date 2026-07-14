import type {
  AIGeneratedOutputRecord,
  ApprovalRecord,
  BlockerRecord,
  ClientRecord,
  CodeReviewRecord,
  DecisionRecord,
  DocumentRecord,
  DocumentTemplateRecord,
  FoundryWorkspaceRecord,
  HealthStatus,
  IntegrationSignalRecord,
  PersonRecord,
  ProjectRecord,
  ResearchInsightRecord,
  ReleaseRecord,
  RiskRecord,
  RoleRecord,
  SupportTicketRecord,
  TaskRecord,
  UpdateRecord,
  WorkstreamRecord,
} from "@/types/foundry";

const REFERENCE_DATE = new Date("2026-05-20T09:00:00.000Z");

const roles: RoleRecord[] = [
  { id: "role_delivery", name: "Delivery Lead", discipline: "Delivery" },
  { id: "role_pm", name: "Product Lead", discipline: "Product" },
  { id: "role_eng", name: "Technical Lead", discipline: "Engineering" },
  { id: "role_research", name: "Research Lead", discipline: "Research" },
];

const people: PersonRecord[] = [
  { id: "person_daniel", name: "Daniel Lindsay", roleId: "role_delivery", allocationPercent: 80 },
  { id: "person_maya", name: "Maya Patel", roleId: "role_pm", allocationPercent: 90 },
  { id: "person_owen", name: "Owen Hughes", roleId: "role_eng", allocationPercent: 85 },
  { id: "person_ivy", name: "Ivy Chen", roleId: "role_research", allocationPercent: 60 },
];

const clients: ClientRecord[] = [
  { id: "client_gitwork", name: "Gitwork", slug: "gitwork", status: "active", primaryContact: "Daniel Lindsay" },
  { id: "client_acme", name: "Acme Health", slug: "acme-health", status: "active", primaryContact: "Rachel Morgan" },
  { id: "client_pollen", name: "PollenIQ", slug: "polleniq", status: "active", primaryContact: "Geoff Nolan" },
];

const projects: ProjectRecord[] = [
  {
    id: "project_foundry",
    slug: "foundry-platform",
    name: "Foundry Platform",
    clientId: "client_gitwork",
    summary: "Internal product suite for taking prompt-to-production work from discovery through delivery and care.",
    stage: "Scoping",
    ownerId: "person_daniel",
    teamIds: ["person_daniel", "person_maya", "person_owen"],
    moduleKeys: ["hq", "pulse", "docs", "code", "portal", "care", "study"],
    startDate: "2026-05-01",
    targetDate: "2026-06-14",
    nextMilestone: "HQ + Pulse MVP review",
    nextMilestoneDate: "2026-05-23",
    updateCadenceDays: 3,
    confidenceScore: 76,
  },
  {
    id: "project_acme",
    slug: "acme-patient-portal",
    name: "Acme Patient Portal",
    clientId: "client_acme",
    summary: "Patient onboarding and support portal moving from prototype hardening into launch planning.",
    stage: "Delivery",
    ownerId: "person_maya",
    teamIds: ["person_maya", "person_owen", "person_ivy"],
    moduleKeys: ["docs", "pulse", "code", "portal", "care", "study"],
    startDate: "2026-04-08",
    targetDate: "2026-06-05",
    nextMilestone: "Beta handover",
    nextMilestoneDate: "2026-05-27",
    updateCadenceDays: 2,
    confidenceScore: 63,
  },
  {
    id: "project_pollen",
    slug: "polleniq-launch",
    name: "PollenIQ Launch",
    clientId: "client_pollen",
    summary: "Launch readiness, release comms, and support setup for the analytics rollout.",
    stage: "Launch",
    ownerId: "person_owen",
    teamIds: ["person_owen", "person_daniel"],
    moduleKeys: ["hq", "pulse", "docs", "portal", "care"],
    startDate: "2026-04-28",
    targetDate: "2026-05-30",
    nextMilestone: "Release readiness sign-off",
    nextMilestoneDate: "2026-05-24",
    updateCadenceDays: 4,
    confidenceScore: 88,
  },
];

const workstreams: WorkstreamRecord[] = [
  {
    id: "ws_foundry_model",
    projectId: "project_foundry",
    name: "Shared delivery model",
    ownerId: "person_maya",
    status: "active",
    nextMilestone: "Typed object review",
    nextMilestoneDate: "2026-05-22",
  },
  {
    id: "ws_foundry_ui",
    projectId: "project_foundry",
    name: "Suite shell and routing",
    ownerId: "person_owen",
    status: "active",
    nextMilestone: "Sidebar and project detail pass",
    nextMilestoneDate: "2026-05-23",
  },
  {
    id: "ws_acme_docs",
    projectId: "project_acme",
    name: "Launch pack",
    ownerId: "person_maya",
    status: "active",
    nextMilestone: "Client beta update",
    nextMilestoneDate: "2026-05-21",
  },
  {
    id: "ws_acme_quality",
    projectId: "project_acme",
    name: "Prototype hardening",
    ownerId: "person_owen",
    status: "active",
    nextMilestone: "Security checklist",
    nextMilestoneDate: "2026-05-22",
  },
  {
    id: "ws_pollen_release",
    projectId: "project_pollen",
    name: "Release prep",
    ownerId: "person_owen",
    status: "active",
    nextMilestone: "Release note review",
    nextMilestoneDate: "2026-05-24",
  },
];

const tasks: TaskRecord[] = [
  {
    id: "task_foundry_hq",
    projectId: "project_foundry",
    workstreamId: "ws_foundry_ui",
    title: "Model project detail layout",
    status: "active",
    ownerId: "person_owen",
    source: "github",
    externalRef: "GH-182",
  },
  {
    id: "task_acme_followup",
    projectId: "project_acme",
    workstreamId: "ws_acme_docs",
    title: "Confirm client access copy",
    status: "active",
    source: "google_drive",
    externalRef: "Drive access doc",
  },
  {
    id: "task_pollen_release",
    projectId: "project_pollen",
    workstreamId: "ws_pollen_release",
    title: "Approve release note draft",
    status: "active",
    ownerId: "person_daniel",
    source: "google_drive",
    externalRef: "Drive release notes",
  },
];

const updates: UpdateRecord[] = [
  {
    id: "update_foundry_1",
    projectId: "project_foundry",
    authorId: "person_daniel",
    type: "internal",
    quality: "clear",
    progress: "progress",
    body: "Aligned the suite around Foundry HQ, Pulse, and Docs first; next up is a shared project object and project detail page.",
    createdAt: "2026-05-19T16:20:00.000Z",
    source: "slack",
    visibleToClient: false,
  },
  {
    id: "update_foundry_2",
    projectId: "project_foundry",
    authorId: "person_maya",
    type: "internal",
    quality: "clear",
    progress: "progress",
    body: "Mapped the first document templates to project data: client update, scope, sprint plan, and handover.",
    createdAt: "2026-05-18T11:45:00.000Z",
    source: "google_drive",
    visibleToClient: false,
  },
  {
    id: "update_acme_1",
    projectId: "project_acme",
    authorId: "person_maya",
    type: "client",
    quality: "vague",
    progress: "no_progress",
    body: "Waiting on a few things before we can move the beta pack forward.",
    createdAt: "2026-05-17T14:00:00.000Z",
    source: "email",
    visibleToClient: true,
  },
  {
    id: "update_acme_2",
    projectId: "project_acme",
    authorId: "person_owen",
    type: "internal",
    quality: "clear",
    progress: "progress",
    body: "Security pass found two auth edge cases and an unreviewed environment variable path in staging.",
    createdAt: "2026-05-16T09:30:00.000Z",
    source: "github",
    visibleToClient: false,
  },
  {
    id: "update_pollen_1",
    projectId: "project_pollen",
    authorId: "person_owen",
    type: "client",
    quality: "clear",
    progress: "progress",
    body: "Release notes are drafted, analytics events are verified, and support handover is ready for review.",
    createdAt: "2026-05-19T10:10:00.000Z",
    source: "slack",
    visibleToClient: true,
  },
];

const risks: RiskRecord[] = [
  {
    id: "risk_foundry_1",
    projectId: "project_foundry",
    title: "Objects are still split across proposals, proof docs, and candidate records",
    detail: "Without a shared project model, module pages will keep duplicating context.",
    severity: "medium",
    ownerId: "person_maya",
    status: "open",
  },
  {
    id: "risk_acme_1",
    projectId: "project_acme",
    title: "Prototype permissions are not fully audited",
    detail: "Portal access still needs explicit role checks before client exposure.",
    severity: "high",
    ownerId: "person_owen",
    status: "open",
  },
  {
    id: "risk_pollen_1",
    projectId: "project_pollen",
    title: "Support summary process is still manual",
    detail: "Care reporting depends on team-written notes rather than structured signals.",
    severity: "low",
    ownerId: "person_daniel",
    status: "open",
  },
];

const blockers: BlockerRecord[] = [
  {
    id: "blocker_foundry_1",
    projectId: "project_foundry",
    title: "Final object naming still needs agreement",
    detail: "We need a clean distinction between project, workstream, and external task before wiring a backend schema.",
    ownerId: "person_daniel",
    status: "open",
    repeatedCount: 1,
    clientInputRequired: false,
  },
  {
    id: "blocker_acme_1",
    projectId: "project_acme",
    title: "Client has not confirmed access request flow",
    detail: "Portal copy and approval steps are blocked until Acme confirms the final support handoff path.",
    status: "open",
    repeatedCount: 2,
    clientInputRequired: true,
  },
];

const decisions: DecisionRecord[] = [
  {
    id: "decision_foundry_1",
    projectId: "project_foundry",
    title: "Use existing modules rather than add more top-level products",
    outcome: "Build the suite on Foundry HQ, Pulse, Code, Docs, Portal, Care, and Study.",
    decidedAt: "2026-05-19T09:00:00.000Z",
  },
  {
    id: "decision_acme_1",
    projectId: "project_acme",
    title: "Keep GitHub as the system-of-record tool",
    outcome: "Foundry will read its signals rather than replace it.",
    decidedAt: "2026-05-15T13:00:00.000Z",
  },
];

const documents: DocumentRecord[] = [
  {
    id: "doc_foundry_scope",
    projectId: "project_foundry",
    title: "Foundry MVP scope",
    template: "project_scope",
    status: "ready",
    updatedAt: "2026-05-19T15:40:00.000Z",
    summary: "Defines the first shared objects, routes, and module priorities for HQ, Pulse, and Docs.",
    generatedByAi: true,
  },
  {
    id: "doc_foundry_plan",
    projectId: "project_foundry",
    title: "Foundry sprint plan",
    template: "sprint_plan",
    status: "draft",
    updatedAt: "2026-05-20T08:30:00.000Z",
    summary: "Breaks the MVP into data model, route shell, project detail, and document generation slices.",
    generatedByAi: true,
  },
  {
    id: "doc_acme_update",
    projectId: "project_acme",
    title: "Acme beta update",
    template: "client_update",
    status: "draft",
    updatedAt: "2026-05-17T14:05:00.000Z",
    summary: "Client-safe delivery update drafted from blockers, milestone status, and recent engineering notes.",
    generatedByAi: true,
  },
  {
    id: "doc_pollen_handover",
    projectId: "project_pollen",
    title: "PollenIQ launch handover",
    template: "handover_note",
    status: "ready",
    updatedAt: "2026-05-19T11:15:00.000Z",
    summary: "Support contacts, monitoring notes, release checklist, and next-step ownership for launch week.",
    generatedByAi: false,
  },
];

const approvals: ApprovalRecord[] = [
  {
    id: "approval_foundry_1",
    projectId: "project_foundry",
    title: "Agree shared project object",
    requestedFrom: "internal",
    status: "pending",
    dueAt: "2026-05-22",
  },
  {
    id: "approval_acme_1",
    projectId: "project_acme",
    title: "Approve beta access messaging",
    requestedFrom: "client",
    status: "pending",
    dueAt: "2026-05-21",
  },
  {
    id: "approval_pollen_1",
    projectId: "project_pollen",
    title: "Approve release note deck",
    requestedFrom: "client",
    status: "pending",
    dueAt: "2026-05-24",
  },
];

const supportTickets: SupportTicketRecord[] = [
  { id: "ticket_pollen_1", projectId: "project_pollen", title: "Post-launch alert routing", status: "triaged" },
];

const releases: ReleaseRecord[] = [
  { id: "release_acme_1", projectId: "project_acme", name: "Beta handover", targetDate: "2026-05-27", status: "planned" },
  { id: "release_pollen_1", projectId: "project_pollen", name: "Launch week release", targetDate: "2026-05-30", status: "ready" },
];

const codeReviews: CodeReviewRecord[] = [
  {
    id: "review_acme_1",
    projectId: "project_acme",
    title: "Prototype production-readiness pass",
    status: "needs_review",
    updatedAt: "2026-05-16T09:45:00.000Z",
  },
  {
    id: "review_pollen_1",
    projectId: "project_pollen",
    title: "Release checklist review",
    status: "pass",
    updatedAt: "2026-05-19T10:30:00.000Z",
  },
];

const researchInsights: ResearchInsightRecord[] = [
  {
    id: "insight_foundry_1",
    projectId: "project_foundry",
    title: "Teams want one place that explains risk in plain English",
    summary: "Internal interviews suggest GitHub, tasks, docs, and support context are all visible, but not stitched together.",
    source: "Study interviews",
  },
  {
    id: "insight_acme_1",
    projectId: "project_acme",
    title: "Client-facing updates need less engineering detail and clearer asks",
    summary: "Beta stakeholders respond best to short updates with explicit actions and dates.",
    source: "Beta feedback",
  },
];

const integrationSignals: IntegrationSignalRecord[] = [
  {
    id: "signal_foundry_1",
    projectId: "project_foundry",
    source: "github",
    label: "Routing work resumed",
    detail: "Recent file changes show new shell styling and Pulse positioning.",
    capturedAt: "2026-05-20T08:15:00.000Z",
  },
  {
    id: "signal_acme_1",
    projectId: "project_acme",
    source: "google_drive",
    label: "Task movement stalled",
    detail: "No status change on the beta access tasks for three working days.",
    capturedAt: "2026-05-20T07:50:00.000Z",
  },
  {
    id: "signal_pollen_1",
    projectId: "project_pollen",
    source: "slack",
    label: "Support handover shared",
    detail: "Client-safe update and release notes were posted to the launch channel.",
    capturedAt: "2026-05-19T10:20:00.000Z",
  },
];

const aiOutputs: AIGeneratedOutputRecord[] = [
  {
    id: "ai_foundry_1",
    projectId: "project_foundry",
    moduleKey: "docs",
    title: "MVP scope synthesis",
    updatedAt: "2026-05-19T15:40:00.000Z",
  },
  {
    id: "ai_acme_1",
    projectId: "project_acme",
    moduleKey: "pulse",
    title: "Client update draft suggestion",
    updatedAt: "2026-05-17T14:05:00.000Z",
  },
  {
    id: "ai_pollen_1",
    projectId: "project_pollen",
    moduleKey: "care",
    title: "Launch support summary",
    updatedAt: "2026-05-19T11:20:00.000Z",
  },
];

const documentTemplates: DocumentTemplateRecord[] = [
  {
    key: "client_update",
    name: "Client update",
    description: "Short client-safe progress summary with status, blockers, dates, and asks.",
    outputLabel: "Status note",
  },
  {
    key: "project_scope",
    name: "Project scope",
    description: "Turns raw notes and validation into a crisp scope, assumptions, and out-of-scope list.",
    outputLabel: "Scope brief",
  },
  {
    key: "sprint_plan",
    name: "Sprint plan",
    description: "Builds a delivery-ready sprint plan from workstreams, milestones, and dependencies.",
    outputLabel: "Plan",
  },
  {
    key: "handover_note",
    name: "Handover note",
    description: "Summarises release state, support ownership, monitoring notes, and follow-up actions.",
    outputLabel: "Handover",
  },
];

export const foundryWorkspace: FoundryWorkspaceRecord = {
  clients,
  projects,
  workstreams,
  tasks,
  people,
  roles,
  updates,
  risks,
  blockers,
  decisions,
  documents,
  approvals,
  supportTickets,
  releases,
  codeReviews,
  researchInsights,
  integrationSignals,
  aiOutputs,
  documentTemplates,
};

export interface ProjectSnapshot {
  project: ProjectRecord;
  client: ClientRecord;
  owner: PersonRecord;
  team: PersonRecord[];
  workstreams: WorkstreamRecord[];
  tasks: TaskRecord[];
  updates: UpdateRecord[];
  risks: RiskRecord[];
  blockers: BlockerRecord[];
  documents: DocumentRecord[];
  approvals: ApprovalRecord[];
  codeReviews: CodeReviewRecord[];
  researchInsights: ResearchInsightRecord[];
  integrationSignals: IntegrationSignalRecord[];
  missedUpdate: boolean;
  healthScore: number;
  health: HealthStatus;
  vagueUpdateCount: number;
  noProgressCount: number;
  repeatedBlockerCount: number;
  suggestedFollowUp: string;
}

function daysSince(value: string) {
  const diff = REFERENCE_DATE.getTime() - new Date(value).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getHealthFromScore(score: number): HealthStatus {
  if (score >= 80) {
    return "on_track";
  }
  if (score >= 60) {
    return "watch";
  }
  return "at_risk";
}

export function getProjectSnapshots(): ProjectSnapshot[] {
  return projects.map((project) => {
    const client = clients.find((entry) => entry.id === project.clientId)!;
    const owner = people.find((entry) => entry.id === project.ownerId)!;
    const team = people.filter((entry) => project.teamIds.includes(entry.id));
    const projectWorkstreams = workstreams.filter((entry) => entry.projectId === project.id);
    const projectTasks = tasks.filter((entry) => entry.projectId === project.id);
    const projectUpdates = updates
      .filter((entry) => entry.projectId === project.id)
      .sort((left, right) => +new Date(right.createdAt) - +new Date(left.createdAt));
    const projectRisks = risks.filter((entry) => entry.projectId === project.id && entry.status === "open");
    const projectBlockers = blockers.filter(
      (entry) => entry.projectId === project.id && entry.status === "open",
    );
    const projectDocuments = documents
      .filter((entry) => entry.projectId === project.id)
      .sort((left, right) => +new Date(right.updatedAt) - +new Date(left.updatedAt));
    const projectApprovals = approvals.filter(
      (entry) => entry.projectId === project.id && entry.status === "pending",
    );
    const projectCodeReviews = codeReviews.filter((entry) => entry.projectId === project.id);
    const projectInsights = researchInsights.filter((entry) => entry.projectId === project.id);
    const projectSignals = integrationSignals.filter((entry) => entry.projectId === project.id);
    const latestUpdate = projectUpdates[0];
    const missedUpdate = latestUpdate
      ? daysSince(latestUpdate.createdAt) > project.updateCadenceDays
      : true;
    const vagueUpdateCount = projectUpdates.filter((entry) => entry.quality === "vague").length;
    const noProgressCount = projectUpdates.filter((entry) => entry.progress === "no_progress").length;
    const repeatedBlockerCount = projectBlockers.reduce(
      (total, blocker) => total + Math.max(0, blocker.repeatedCount - 1),
      0,
    );

    const healthScore = clamp(
      project.confidenceScore -
        (missedUpdate ? 10 : 0) -
        vagueUpdateCount * 6 -
        noProgressCount * 8 -
        repeatedBlockerCount * 5 -
        projectRisks.filter((entry) => entry.severity === "high").length * 8,
      0,
      100,
    );

    const clientBlocker = projectBlockers.find((entry) => entry.clientInputRequired);
    const suggestedFollowUp = missedUpdate
      ? `Ask ${owner.name} for a fresh delivery update and milestone confidence.`
      : clientBlocker
        ? `Get client input on "${clientBlocker.title}" before the next milestone.`
        : noProgressCount > 0
          ? "Clarify what moved this week and who owns the unblock."
          : `Draft the next ${client.name} update from the latest project signals.`;

    return {
      project,
      client,
      owner,
      team,
      workstreams: projectWorkstreams,
      tasks: projectTasks,
      updates: projectUpdates,
      risks: projectRisks,
      blockers: projectBlockers,
      documents: projectDocuments,
      approvals: projectApprovals,
      codeReviews: projectCodeReviews,
      researchInsights: projectInsights,
      integrationSignals: projectSignals,
      missedUpdate,
      healthScore,
      health: getHealthFromScore(healthScore),
      vagueUpdateCount,
      noProgressCount,
      repeatedBlockerCount,
      suggestedFollowUp,
    };
  });
}

export function getProjectSnapshotBySlug(slug: string) {
  return getProjectSnapshots().find((entry) => entry.project.slug === slug) ?? null;
}

export function getWorkspaceMetrics() {
  const snapshots = getProjectSnapshots();
  return {
    activeProjects: snapshots.length,
    atRiskProjects: snapshots.filter((entry) => entry.health === "at_risk").length,
    openBlockers: snapshots.reduce((total, entry) => total + entry.blockers.length, 0),
    pendingApprovals: snapshots.reduce((total, entry) => total + entry.approvals.length, 0),
    missedUpdates: snapshots.filter((entry) => entry.missedUpdate).length,
  };
}

export function getWeeklyProjectSummaries() {
  return getProjectSnapshots().map((entry) => ({
    projectId: entry.project.id,
    projectName: entry.project.name,
    summary:
      entry.health === "at_risk"
        ? `${entry.project.name} needs attention: ${entry.blockers.length} blocker(s), ${entry.risks.length} open risk(s), and a follow-up on ${entry.project.nextMilestone}.`
        : `${entry.project.name} is moving: focus on ${entry.project.nextMilestone} by ${entry.project.nextMilestoneDate}.`,
  }));
}

export function getWeeklyPersonSummaries() {
  return people.map((person) => {
    const ownedProjects = getProjectSnapshots().filter((entry) => entry.project.ownerId === person.id);
    const focus = ownedProjects[0];
    return {
      personId: person.id,
      name: person.name,
      summary: focus
        ? `${person.name} is currently fronting ${focus.project.name} and should keep the team aligned on ${focus.project.nextMilestone}.`
        : `${person.name} has no named project ownership in the current MVP dataset.`,
    };
  });
}

export function getDocumentTemplates() {
  return documentTemplates;
}
