import type { CostingConfigResponse, PackageCostingInput, PackageCostingResult } from "@/types/costing";
import type {
  AuditLog,
  Connection,
  Conversation,
  DraftAction,
  Message,
  SupportClient,
  SupportReport,
  SupportReportPayload,
  Ticket,
  WorkflowRule,
} from "@/types/support";
import type {
  ClientBankReveal,
  ClientDesignRecord,
  ClientDocumentLinkRecord,
  ClientDetailRecord,
  ClientListItem,
  ClientPlatformRecord,
  ClientPlatformReveal,
  ClientPlatformLoginSummary,
  ClientTouchpoint,
  ClientEngagementType,
  LeadStage,
  TouchpointType,
  WorkspaceClientStatus,
} from "@/types/client";
import type {
  OnboardingFormRecord,
  OnboardingFormStructure,
  OnboardingFormSummary,
} from "@/types/onboarding";
import type { PulseScanRecord, PulseScanListItem, BrowserAgentInsights, DiscoveryKit, IndustryBenchmark } from "@/types/pulse";
import type {
  CandidateListParams,
  CandidateListResponse,
  CandidateSignalSource,
  CodeClearCandidateDetail,
  CodeClearCandidateListItem,
  CodeClearStatsResponse,
  CodeClearNoteRecord,
  GitHubAnalysisRunRecord,
  IdentityConfidence,
  PipelineStatus,
  CodeClearTier,
} from "@/types/codeclear";
import type {
  DevSignalAnalyticsDTO,
  DevSignalAssessmentDTO,
  DevSignalChallengeDTO,
  DevSignalPipelineConfigDTO,
} from "@/types/devsignal";
import type { CalibrationReport } from "@/lib/devsignal/calibration";
import type { NoticeContent } from "@/lib/devsignal/processing-notice";
import type { NotificationDTO } from "@/types/notifications";
import type {
  DeskActionItemDTO,
  DeskSlackResult,
  DeskHolidays,
  DeskReminderDTO,
  BroadcastDTO,
  BroadcastDuration,
  DeskMentionsResult,
} from "@/types/desk";
import type {
  ProofCreateDocumentInput,
  ProofDocumentRecord,
  ProofDocumentUpdateInput,
  ProofHealthResponse,
} from "@/lib/proof";
import type {
  CostingSectionData,
  DocumentType,
  ProposalDocument,
  ProposalListItem,
  TemplateSummary,
} from "@/types/proposal";
import type { RoleId, RoleMatrix } from "@/types/auth";
import type {
  RateBillingPeriod,
  RateCardPeopleResponse,
  RateCardPersonRecord,
} from "@/types/rate-card";
import type {
  DesignSystemDTO,
  DesignSystemShareInfo,
  DesignSystemStatus,
  DesignTokens,
} from "@/types/design-tokens";
import type {
  AutomationOnboardingLinkRequest,
  AutomationOnboardingLinkResult,
  AutomationNudgeUpdateRequest,
  AutomationNudgeUpdateResult,
  DraftProposalRequest,
  DraftProposalResult,
  FoundryAutomationResponse,
  ProposalDraftPreview,
  ProposalDraftPreviewRequest,
  ProjectPlanPreview,
  ProjectPlanRequest,
  SeedProjectPlanResult,
} from "@/types/foundry-automation";

export interface ProposalListResponse {
  proposals: ProposalListItem[];
}

export interface ClientListResponse {
  clients: ClientListItem[];
}

export interface CodeClearRunsResponse {
  runs: GitHubAnalysisRunRecord[];
}

export async function getFoundryAutomation(): Promise<FoundryAutomationResponse> {
  return apiFetch<FoundryAutomationResponse>("/api/foundry/automation");
}

export async function draftProposalFromMeeting(input: DraftProposalRequest): Promise<{ result: DraftProposalResult }> {
  return apiFetch<{ result: DraftProposalResult }>("/api/foundry/automation/draft-proposal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function previewProposalDraft(
  input: ProposalDraftPreviewRequest,
): Promise<{ preview: ProposalDraftPreview }> {
  return apiFetch<{ preview: ProposalDraftPreview }>("/api/foundry/automation/preview-proposal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function createAutomationOnboardingLink(
  input: AutomationOnboardingLinkRequest,
): Promise<{ result: AutomationOnboardingLinkResult }> {
  return apiFetch<{ result: AutomationOnboardingLinkResult }>("/api/foundry/automation/onboarding-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateAutomationNudge(
  input: AutomationNudgeUpdateRequest,
): Promise<{ result: AutomationNudgeUpdateResult }> {
  return apiFetch<{ result: AutomationNudgeUpdateResult }>("/api/foundry/automation/nudge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function previewProjectPlan(input: ProjectPlanRequest): Promise<{ preview: ProjectPlanPreview }> {
  return apiFetch<{ preview: ProjectPlanPreview }>("/api/foundry/automation/preview-project-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function seedProjectPlan(input: ProjectPlanRequest): Promise<{ result: SeedProjectPlanResult }> {
  return apiFetch<{ result: SeedProjectPlanResult }>("/api/foundry/automation/seed-project-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// "View as" preview: when a Super Admin is previewing as a specific teammate,
// tell the server whose data to scope this request to. Mirrors the localStorage
// keys in src/lib/view-as.ts (USER-mode preview stores the target's user id).
// The server only honours it for a real Super Admin caller (see effective-user.ts).
function viewAsHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const role = window.localStorage.getItem("foundry_view_as_role");
    if (role !== "USER" && role !== "ADMIN_USER") return {};
    const raw = window.localStorage.getItem("foundry_view_as_user");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { id?: unknown };
    return typeof parsed?.id === "string" && parsed.id ? { "x-view-as-user": parsed.id } : {};
  } catch {
    return {};
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...viewAsHeaders(),
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      typeof data?.error === "string" ? data.error : `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export async function listProposals(params: {
  search?: string;
  status?: string;
  sort?: string;
  documentType?: string;
}): Promise<ProposalListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.sort) query.set("sort", params.sort);
  if (params.documentType) query.set("documentType", params.documentType);
  const qs = query.toString();
  return apiFetch<ProposalListResponse>(`/api/proposals${qs ? `?${qs}` : ""}`);
}

export async function createProposal(input: {
  title: string;
  clientName?: string;
  clientId?: string;
  productName?: string;
  templateId?: string;
  /** Defaults to PROPOSAL server-side if omitted. */
  documentType?: DocumentType;
}): Promise<{ proposal: ProposalDocument }> {
  return apiFetch<{ proposal: ProposalDocument }>("/api/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getProposal(id: string): Promise<{ proposal: ProposalDocument }> {
  return apiFetch<{ proposal: ProposalDocument }>(`/api/proposals/${id}`);
}

export async function updateProposal(
  id: string,
  input: Partial<ProposalDocument>,
): Promise<{ proposal: ProposalDocument }> {
  return apiFetch<{ proposal: ProposalDocument }>(`/api/proposals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function duplicateProposal(id: string): Promise<{ proposal: ProposalDocument }> {
  return apiFetch<{ proposal: ProposalDocument }>(`/api/proposals/${id}/duplicate`, {
    method: "POST",
  });
}

export async function archiveProposal(
  id: string,
): Promise<{ proposal: { id: string; status: string } }> {
  return apiFetch<{ proposal: { id: string; status: string } }>(
    `/api/proposals/${id}/archive`,
    { method: "POST" },
  );
}

export async function deleteProposal(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/proposals/${id}/delete`, {
    method: "DELETE",
  });
}

export async function setProposalFavorite(
  id: string,
  isFavorite: boolean,
): Promise<{ proposal: { id: string; isFavorite: boolean } }> {
  return apiFetch<{ proposal: { id: string; isFavorite: boolean } }>(
    `/api/proposals/${id}/favorite`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite }),
    },
  );
}

export async function fetchTemplates(): Promise<{ templates: TemplateSummary[] }> {
  return apiFetch<{ templates: TemplateSummary[] }>("/api/templates");
}

/**
 * Capture the current document's sections + metadata into a new workspace-owned template,
 * selectable in the create-document gallery. Returns the created template's id + name.
 */
export async function createTemplateFromDocument(
  documentId: string,
  body: { name: string; description?: string },
): Promise<{ template: { id: string; name: string } }> {
  return apiFetch<{ template: { id: string; name: string } }>(
    `/api/templates/from-document/${documentId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function saveCosting(
  id: string,
  input: {
    costLineItems: ProposalDocument["costLineItems"];
    currency?: "GBP" | "USD" | "EUR";
    discount?: number;
    taxRate?: number;
    monthlyCostSummary?: string;
    durationSummary?: string;
    totalCostLabel?: string;
    supportingNarrative?: string;
    paymentScheduleIntro?: string;
    paymentTerms?: string;
    vatNotice?: string;
    ipTransferNotice?: string;
    teamAllocations?: CostingSectionData["teamAllocations"];
    paymentSchedule?: CostingSectionData["paymentSchedule"];
    additionalNotes?: string[];
    assignmentTimelineMode?: CostingSectionData["assignmentTimelineMode"];
  },
): Promise<{ proposal: ProposalDocument }> {
  return apiFetch<{ proposal: ProposalDocument }>(`/api/proposals/${id}/costing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function saveTimeline(
  id: string,
  input: {
    timelinePhases: ProposalDocument["timelinePhases"];
    viewMode?: "LIST" | "MILESTONE";
  },
): Promise<{ proposal: ProposalDocument }> {
  return apiFetch<{ proposal: ProposalDocument }>(`/api/proposals/${id}/timeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function saveEngagement(
  id: string,
  input: {
    ctas: ProposalDocument["ctas"];
    links: ProposalDocument["links"];
  },
): Promise<{ proposal: ProposalDocument }> {
  return apiFetch<{ proposal: ProposalDocument }>(`/api/proposals/${id}/engagement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function requestExport(
  id: string,
  input: {
    format: "PRINT" | "PDF" | "SHARE_LINK";
    settings?: Record<string, unknown>;
  },
): Promise<{ export: { id: string; format: string; status: string; url: string; requestedAt: string } }> {
  return apiFetch(`/api/proposals/${id}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listRateCardPeople(params?: {
  search?: string;
  includeArchived?: boolean;
}): Promise<RateCardPeopleResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.includeArchived) query.set("includeArchived", "true");
  const qs = query.toString();
  return apiFetch<RateCardPeopleResponse>(`/api/rate-card/people${qs ? `?${qs}` : ""}`);
}

export async function createRateCardPerson(input: {
  name: string;
  area: string;
  sourceRate: number;
  sourceCurrencyCode: string;
  billingPeriod: RateBillingPeriod;
}): Promise<{ person: RateCardPersonRecord }> {
  return apiFetch<{ person: RateCardPersonRecord }>("/api/rate-card/people", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateRateCardPerson(
  id: string,
  input: Partial<{
    name: string;
    area: string;
    sourceRate: number;
    sourceCurrencyCode: string;
    billingPeriod: RateBillingPeriod;
  }>,
): Promise<{ person: RateCardPersonRecord }> {
  return apiFetch<{ person: RateCardPersonRecord }>(`/api/rate-card/people/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteRateCardPerson(
  id: string,
): Promise<{ person: RateCardPersonRecord }> {
  return apiFetch<{ person: RateCardPersonRecord }>(`/api/rate-card/people/${id}`, {
    method: "DELETE",
  });
}

export async function listClients(params?: {
  search?: string;
  status?: WorkspaceClientStatus | "ALL";
}): Promise<ClientListResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.status) query.set("status", params.status);
  const qs = query.toString();
  return apiFetch<ClientListResponse>(`/api/clients${qs ? `?${qs}` : ""}`);
}

// ─── Client onboarding links + bank reveal ──────────────────────────────────

export interface OnboardingLinkRecord {
  id: string;
  accessToken: string;
  label: string | null;
  status: "IN_PROGRESS" | "SUBMITTED" | "LINKED";
  currentStep: number;
  /** Label of the furthest screen reached (e.g. "Company & billing"). */
  currentStepLabel: string;
  /** Total numbered steps in the flow (the "N" in "Step X of N"). */
  totalSteps: number;
  /** First time the public link was opened — null = never opened. */
  firstViewedAt: string | null;
  fields: Record<string, string | null>;
  bank: { onFile: boolean; currency: string | null; accountNumberLast4: string | null };
  workspaceClientId: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  linkedAt: string | null;
}

export async function listOnboardingLinks(): Promise<{ links: OnboardingLinkRecord[] }> {
  return apiFetch<{ links: OnboardingLinkRecord[] }>("/api/clients/onboarding-links");
}

export async function createOnboardingLink(
  input: { label?: string; formId?: string } = {},
): Promise<{ link: OnboardingLinkRecord }> {
  return apiFetch<{ link: OnboardingLinkRecord }>("/api/clients/onboarding-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteOnboardingLink(id: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/clients/onboarding-links/${id}`, {
    method: "DELETE",
  });
}

export async function moveOnboardingToWorkflow(
  id: string,
): Promise<{ slug: string }> {
  return apiFetch<{ slug: string }>(
    `/api/clients/onboarding-links/${id}/move-to-workflow`,
    { method: "POST" },
  );
}

// ─── Onboarding forms (templates) ───────────────────────────────────────────

export async function listOnboardingForms(
  includeArchived = false,
): Promise<{ forms: OnboardingFormSummary[] }> {
  const q = includeArchived ? "?includeArchived=true" : "";
  return apiFetch<{ forms: OnboardingFormSummary[] }>(`/api/onboarding-forms${q}`);
}

export async function getOnboardingForm(id: string): Promise<{ form: OnboardingFormRecord }> {
  return apiFetch<{ form: OnboardingFormRecord }>(`/api/onboarding-forms/${id}`);
}

export async function createOnboardingForm(input: {
  name: string;
  description?: string;
  cloneFromId?: string;
  structure?: OnboardingFormStructure;
}): Promise<{ form: OnboardingFormRecord }> {
  return apiFetch<{ form: OnboardingFormRecord }>("/api/onboarding-forms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateOnboardingForm(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    structure?: OnboardingFormStructure;
    isDefault?: boolean;
    isArchived?: boolean;
  },
): Promise<{ form: OnboardingFormRecord }> {
  return apiFetch<{ form: OnboardingFormRecord }>(`/api/onboarding-forms/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function duplicateOnboardingForm(id: string): Promise<{ form: OnboardingFormRecord }> {
  return apiFetch<{ form: OnboardingFormRecord }>(`/api/onboarding-forms/${id}/duplicate`, {
    method: "POST",
  });
}

export async function deleteOnboardingForm(
  id: string,
): Promise<{ deleted: boolean; archived?: boolean }> {
  return apiFetch<{ deleted: boolean; archived?: boolean }>(`/api/onboarding-forms/${id}`, {
    method: "DELETE",
  });
}

export async function setClientStatusApi(
  slug: string,
  status: WorkspaceClientStatus,
  options?: { resumeAt?: string | null; pauseNote?: string | null },
): Promise<{ client: ClientListItem }> {
  return apiFetch<{ client: ClientListItem }>(`/api/clients/${slug}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, ...options }),
  });
}

/** Lead fields accepted by create/update for a LEAD client. */
export interface LeadInput {
  leadSource?: string | null;
  leadStage?: LeadStage | null;
  leadFollowUpAt?: string | null;
  leadValue?: number | null;
  leadValueCurrency?: string | null;
}

export async function listClientTouchpoints(slug: string): Promise<{ touchpoints: ClientTouchpoint[] }> {
  return apiFetch<{ touchpoints: ClientTouchpoint[] }>(`/api/clients/${slug}/touchpoints`);
}

export async function createClientTouchpoint(
  slug: string,
  input: { type: TouchpointType; note?: string; occurredAt?: string },
): Promise<{ touchpoint: ClientTouchpoint }> {
  return apiFetch<{ touchpoint: ClientTouchpoint }>(`/api/clients/${slug}/touchpoints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function revealClientBankApi(
  slug: string,
): Promise<{ bank: ClientBankReveal }> {
  return apiFetch<{ bank: ClientBankReveal }>(`/api/clients/${slug}/bank`, {
    method: "POST",
  });
}

export async function createClient(
  input: {
    name: string;
    logoUrl?: string;
    /** Initial status — omit for ACTIVE; "LEAD" from the Add-lead flow. */
    status?: WorkspaceClientStatus;
    /** Phase 3 — optional Slack channel provisioning on create. Failure to
     *  provision is non-blocking (the client is created either way). */
    createInternalChannel?: boolean;
    createExternalChannel?: boolean;
    externalInviteeEmail?: string;
    customInternalName?: string;
    customExternalName?: string;
    // Optional contact + lead fields (used by "Add lead").
    primaryContactName?: string;
    primaryContactEmail?: string;
    primaryContactPhone?: string;
    website?: string;
    notes?: string;
  } & LeadInput,
): Promise<{ client: ClientListItem }> {
  return apiFetch<{ client: ClientListItem }>("/api/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/**
 * Retry / belated Slack channel provisioning for an existing client. Surfaces
 * Slack's verbatim error on failure so the UI can render it inline.
 */
export async function provisionClientSlackChannels(
  slug: string,
  input: {
    createInternal?: boolean;
    createExternal?: boolean;
    externalInviteeEmail?: string;
    customInternalName?: string;
    customExternalName?: string;
  },
): Promise<{ internal: { id: string; name: string } | null; external: { id: string; name: string } | null }> {
  return apiFetch(`/api/clients/${slug}/provision-slack-channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteClient(slug: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/clients/${slug}`, {
    method: "DELETE",
  });
}

export async function updateClient(
  slug: string,
  input: {
    name?: string;
    logoUrl?: string;
    website?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    postcode?: string;
    country?: string;
    notes?: string;
    primaryContactName?: string;
    primaryContactEmail?: string;
    primaryContactPhone?: string;
    googleDriveFolderUrl?: string;
    clickupUrl?: string;
    slackChannelId?: string;
    slackInternalChannelId?: string;
    slackExternalChannelId?: string;
    retainerDays?: number | null;
    retainerDaysUsed?: number | null;
    engagementType?: ClientEngagementType | null;
    endDate?: string | null;
  } & LeadInput,
): Promise<{ client: ClientListItem }> {
  return apiFetch<{ client: ClientListItem }>(`/api/clients/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getClientDetail(slug: string): Promise<ClientDetailRecord> {
  return apiFetch<ClientDetailRecord>(`/api/clients/${slug}`);
}

export async function updateClientProductTeam(
  slug: string,
  userIds: string[],
): Promise<{ productTeamUserIds: string[] }> {
  return apiFetch(`/api/clients/${slug}/product-team`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds }),
  });
}

export async function createClientPlatform(
  slug: string,
  input: {
    name: string;
    platformType?: string;
    url?: string;
    stagingUrl?: string;
    repoUrl?: string;
    username?: string;
    password?: string;
    notes?: string;
    featuredInWiki?: boolean;
  },
): Promise<{ platform: ClientPlatformRecord }> {
  return apiFetch<{ platform: ClientPlatformRecord }>(`/api/clients/${slug}/platforms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateClientPlatform(
  slug: string,
  platformId: string,
  input: {
    name?: string;
    platformType?: string;
    url?: string;
    stagingUrl?: string;
    repoUrl?: string;
    username?: string;
    password?: string;
    notes?: string;
    previewImageUrl?: string;
    featuredInWiki?: boolean;
  },
): Promise<{ platform: ClientPlatformRecord }> {
  return apiFetch<{ platform: ClientPlatformRecord }>(
    `/api/clients/${slug}/platforms/${platformId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function deleteClientPlatform(
  slug: string,
  platformId: string,
): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/clients/${slug}/platforms/${platformId}`, {
    method: "DELETE",
  });
}

/** Reveal a platform's decrypted credentials (server-side decrypt, gated). */
export async function revealClientPlatformApi(
  slug: string,
  platformId: string,
): Promise<{ credentials: ClientPlatformReveal }> {
  return apiFetch<{ credentials: ClientPlatformReveal }>(
    `/api/clients/${slug}/platforms/${platformId}/reveal`,
    { method: "POST" },
  );
}

// ── Platform logins (multiple credential sets) ──────────────────────────────

export async function createPlatformLogin(
  slug: string,
  platformId: string,
  body: { label?: string; username?: string; password?: string },
): Promise<{ login: ClientPlatformLoginSummary }> {
  return apiFetch<{ login: ClientPlatformLoginSummary }>(`/api/clients/${slug}/platforms/${platformId}/logins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updatePlatformLogin(
  slug: string,
  platformId: string,
  loginId: string,
  body: { label?: string | null; username?: string; password?: string },
): Promise<{ login: ClientPlatformLoginSummary }> {
  return apiFetch<{ login: ClientPlatformLoginSummary }>(
    `/api/clients/${slug}/platforms/${platformId}/logins/${loginId}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
}

export async function deletePlatformLogin(
  slug: string,
  platformId: string,
  loginId: string,
): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(
    `/api/clients/${slug}/platforms/${platformId}/logins/${loginId}`,
    { method: "DELETE" },
  );
}

export async function revealPlatformLogin(
  slug: string,
  platformId: string,
  loginId: string,
): Promise<{ credentials: ClientPlatformReveal }> {
  return apiFetch<{ credentials: ClientPlatformReveal }>(
    `/api/clients/${slug}/platforms/${platformId}/logins/${loginId}/reveal`,
    { method: "POST" },
  );
}

export async function createClientDesign(
  slug: string,
  input: { name: string; url?: string; notes?: string },
): Promise<{ design: ClientDesignRecord }> {
  return apiFetch<{ design: ClientDesignRecord }>(`/api/clients/${slug}/designs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateClientDesign(
  slug: string,
  designId: string,
  input: { name?: string; url?: string; notes?: string },
): Promise<{ design: ClientDesignRecord }> {
  return apiFetch<{ design: ClientDesignRecord }>(
    `/api/clients/${slug}/designs/${designId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function deleteClientDesign(
  slug: string,
  designId: string,
): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/clients/${slug}/designs/${designId}`, {
    method: "DELETE",
  });
}

export async function createClientDocumentLink(
  slug: string,
  input: { name: string; url: string; notes?: string },
): Promise<{ link: ClientDocumentLinkRecord }> {
  return apiFetch<{ link: ClientDocumentLinkRecord }>(`/api/clients/${slug}/document-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateClientDocumentLink(
  slug: string,
  linkId: string,
  input: { name?: string; url?: string; notes?: string },
): Promise<{ link: ClientDocumentLinkRecord }> {
  return apiFetch<{ link: ClientDocumentLinkRecord }>(
    `/api/clients/${slug}/document-links/${linkId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function deleteClientDocumentLink(
  slug: string,
  linkId: string,
): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/clients/${slug}/document-links/${linkId}`, {
    method: "DELETE",
  });
}

export async function getCodeClearStats(): Promise<CodeClearStatsResponse> {
  return apiFetch<CodeClearStatsResponse>("/api/codeclear/stats");
}

export async function listCodeClearCandidates(
  params: Partial<CandidateListParams> = {},
): Promise<CandidateListResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.status) query.set("status", params.status);
  if (params.tier) query.set("tier", params.tier);
  if (params.identityConfidence) query.set("identityConfidence", params.identityConfidence);
  if (params.recheckDue) query.set("recheckDue", params.recheckDue);
  if (params.stack) query.set("stack", params.stack);
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortDir) query.set("sortDir", params.sortDir);
  if (typeof params.scoreMin === "number") query.set("scoreMin", String(params.scoreMin));
  if (typeof params.scoreMax === "number") query.set("scoreMax", String(params.scoreMax));
  const qs = query.toString();
  return apiFetch<CandidateListResponse>(`/api/codeclear/candidates${qs ? `?${qs}` : ""}`);
}

export async function createCodeClearCandidate(input: {
  name: string;
  githubHandle: string;
  email?: string | null;
  primaryStack: string;
  techStacks?: string[];
  signalSources?: CandidateSignalSource[];
  location?: string | null;
  bio?: string | null;
  wikiBio?: string | null;
  tier?: CodeClearTier;
  rateCardPersonId?: string | null;
  linkedinUrl?: string | null;
  cvUrl?: string | null;
  portfolioUrl?: string | null;
  yearsExperience?: number | null;
  hourlyRate?: number | null;
  currency?: string | null;
  timezone?: string | null;
  availability?: "AVAILABLE" | "ENGAGED" | "UNAVAILABLE" | null;
  origin?: "INTERNAL" | "EXTERNAL";
  tierManualOverride?: CodeClearTier | null;
  published?: boolean;
}): Promise<{ candidate: CodeClearCandidateListItem }> {
  return apiFetch<{ candidate: CodeClearCandidateListItem }>("/api/codeclear/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function bulkUpdateCodeClearCandidates(input:
  | {
      action: "MOVE_STAGE";
      ids: string[];
      status: PipelineStatus;
    }
  | {
      action: "FLAG_RECHECK";
      ids: string[];
      recheckDueAt?: string | Date;
    }
  | {
      action: "SET_DEV_GROUP";
      ids: string[];
      devGroup: "BENCH" | "PRO_BONO";
    }): Promise<{ candidates: CodeClearCandidateListItem[] }> {
  return apiFetch<{ candidates: CodeClearCandidateListItem[] }>("/api/codeclear/candidates", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getCodeClearCandidate(
  id: string,
): Promise<{ candidate: CodeClearCandidateDetail }> {
  return apiFetch<{ candidate: CodeClearCandidateDetail }>(`/api/codeclear/candidates/${id}`);
}

export async function updateCodeClearCandidate(
  id: string,
  input: Partial<{
    name: string | null;
    githubHandle: string;
    email: string | null;
    primaryStack: string | null;
    techStacks: string[];
    signalSources: CandidateSignalSource[];
    location: string | null;
    bio: string | null;
    wikiBio: string | null;
    status: PipelineStatus;
    tier: CodeClearTier;
    tierManualOverride: CodeClearTier | null;
    origin: "INTERNAL" | "EXTERNAL";
    published: boolean;
    linkedinUrl: string | null;
    cvUrl: string | null;
    portfolioUrl: string | null;
    yearsExperience: number | null;
    hourlyRate: number | null;
    currency: string | null;
    timezone: string | null;
    availability: "AVAILABLE" | "ENGAGED" | "UNAVAILABLE" | null;
    rateCardPersonId: string | null;
    recheckDueAt: string | Date | null;
    requestSignalSource: CandidateSignalSource;
    scrapeSignalSource: CandidateSignalSource;
  }>,
): Promise<{ candidate: CodeClearCandidateDetail }> {
  return apiFetch<{ candidate: CodeClearCandidateDetail }>(`/api/codeclear/candidates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteCodeClearCandidate(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/codeclear/candidates/${id}`, {
    method: "DELETE",
  });
}

export async function addCodeClearCandidateNote(
  id: string,
  input: { body: string },
): Promise<{ note: CodeClearNoteRecord }> {
  return apiFetch<{ note: CodeClearNoteRecord }>(`/api/codeclear/candidates/${id}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function finalizeCodeClearCandidateScore(
  id: string,
  input: Partial<{
    technicalDepth: number;
    codeQuality: number;
    aiFluency: number;
    deliveryReadiness: number;
    identityConfidence: IdentityConfidence;
    taskScore: number | null;
    taskTimeSeconds: number | null;
    taskAiReview: string | null;
  }>,
): Promise<{ candidate: CodeClearCandidateDetail }> {
  return apiFetch<{ candidate: CodeClearCandidateDetail }>(`/api/codeclear/candidates/${id}/score`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listCodeClearGitHubRuns(id: string): Promise<CodeClearRunsResponse> {
  return apiFetch<CodeClearRunsResponse>(`/api/codeclear/candidates/${id}/github-analysis/runs`);
}

export async function runCodeClearGitHubAnalysis(
  id: string,
): Promise<{ run: GitHubAnalysisRunRecord; candidate: CodeClearCandidateDetail | null }> {
  return apiFetch<{ run: GitHubAnalysisRunRecord; candidate: CodeClearCandidateDetail | null }>(
    `/api/codeclear/candidates/${id}/github-analysis/runs`,
    {
      method: "POST",
    },
  );
}

export async function applyCodeClearGitHubRun(
  id: string,
  runId: string,
): Promise<{ candidate: CodeClearCandidateDetail; run: GitHubAnalysisRunRecord }> {
  return apiFetch<{ candidate: CodeClearCandidateDetail; run: GitHubAnalysisRunRecord }>(
    `/api/codeclear/candidates/${id}/github-analysis/runs/${runId}/apply`,
    {
      method: "POST",
    },
  );
}

export function getCodeClearScorecardUrl(id: string) {
  return `/api/codeclear/candidates/${id}/scorecard`;
}

export interface PlacementResponse {
  id: string;
  candidateId: string;
  clientId: string | null;
  clientName: string;
  projectName: string;
  startDate: string;
  endDate: string | null;
  allocationPercent: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createPlacement(
  candidateId: string,
  input: {
    clientId?: string;
    clientName: string;
    projectName: string;
    startDate: string | Date;
    endDate?: string | Date | null;
    allocationPercent?: number;
    notes?: string | null;
  },
): Promise<{ placement: PlacementResponse }> {
  return apiFetch(`/api/codeclear/candidates/${candidateId}/placements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updatePlacement(
  candidateId: string,
  placementId: string,
  input: {
    clientId?: string | null;
    clientName?: string;
    projectName?: string;
    startDate?: string | Date;
    endDate?: string | Date | null;
    allocationPercent?: number;
    notes?: string | null;
  },
): Promise<{ placement: PlacementResponse }> {
  return apiFetch(
    `/api/codeclear/candidates/${candidateId}/placements/${placementId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function deletePlacement(
  candidateId: string,
  placementId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(
    `/api/codeclear/candidates/${candidateId}/placements/${placementId}`,
    { method: "DELETE" },
  );
}

export interface PlacementValidationResponse {
  run: GitHubAnalysisRunRecord;
  analysis?: {
    commitCount: number;
    scopedCommitCount: number;
    uniqueFiles: number;
    additions: number;
    deletions: number;
    lastCommitAt: string | null;
  };
  checks?: Array<{
    category: string;
    checkKey: string;
    label: string;
    status: "PASS" | "WARN" | "FAIL" | "SKIPPED";
    detail: string | null;
    weight: number;
    sortOrder: number;
  }>;
}

/**
 * Trigger a scoped GitHub validation for a single placement. Server resolves
 * the placement's linked ClientPlatform.repoUrl and scans the dev's commits
 * within the placement's repoPaths (and optional repoBranch).
 */
export async function runPlacementValidation(
  candidateId: string,
  placementId: string,
): Promise<PlacementValidationResponse> {
  return apiFetch<PlacementValidationResponse>(
    `/api/codeclear/candidates/${candidateId}/placements/${placementId}/run-validation`,
    { method: "POST" },
  );
}

export interface ScheduleBlockResponse {
  id: string;
  candidate: {
    id: string;
    name: string;
    githubHandle: string;
    primaryStack: string;
    avatarUrl: string | null;
    tier: CodeClearTier;
    effectiveTier: CodeClearTier;
  };
  client: { id: string | null; name: string; slug: string | null };
  projectName: string;
  startDate: string;
  endDate: string | null;
  allocationPercent: number;
  notes: string | null;
}

export interface ScheduleRangeResponse {
  from: string;
  to: string;
  count: number;
  blocks: ScheduleBlockResponse[];
}

function withRangeQuery(input?: { from?: string | Date; to?: string | Date }): string {
  if (!input?.from && !input?.to) return "";
  const params = new URLSearchParams();
  if (input.from) {
    params.set(
      "from",
      input.from instanceof Date ? input.from.toISOString() : input.from,
    );
  }
  if (input.to) {
    params.set("to", input.to instanceof Date ? input.to.toISOString() : input.to);
  }
  return `?${params.toString()}`;
}

export async function getWorkspaceSchedule(input?: {
  from?: string | Date;
  to?: string | Date;
}): Promise<ScheduleRangeResponse> {
  return apiFetch<ScheduleRangeResponse>(
    `/api/codeclear/schedule${withRangeQuery(input)}`,
  );
}

export async function getClientSchedule(
  slug: string,
  input?: { from?: string | Date; to?: string | Date },
): Promise<
  ScheduleRangeResponse & {
    client: { id: string; name: string; slug: string };
  }
> {
  return apiFetch(`/api/clients/${slug}/schedule${withRangeQuery(input)}`);
}

export async function setCandidateCurrentClient(
  candidateId: string,
  clientId: string | null,
): Promise<{ clientId: string | null }> {
  return apiFetch(`/api/codeclear/candidates/${candidateId}/current-client`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId }),
  });
}

/**
 * Multi-client assignment. Replaces the dev's set of open Portal placements
 * with exactly the ones for clientIds. Empty array = unassigned.
 */
export async function setCandidateCurrentClients(
  candidateId: string,
  clientIds: string[],
): Promise<{ clientIds: string[] }> {
  return apiFetch(`/api/codeclear/candidates/${candidateId}/current-clients`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientIds }),
  });
}

export interface TechStackOption {
  id: string;
  name: string;
  category: string | null;
  color: string | null;
}

export async function listTechStacks(): Promise<{ stacks: TechStackOption[] }> {
  return apiFetch<{ stacks: TechStackOption[] }>("/api/codeclear/tech-stacks");
}

// Demo-data cleanup helpers were here; UI for that has been retired. The backend route
// at /api/codeclear/admin/cleanup-demo still exists if we ever need to wire a one-shot
// admin tool to it again.

export interface BulkImportCandidateRow {
  name: string;
  githubHandle: string;
  primaryStack: string;
  techStacks?: string[];
  email?: string;
  linkedinUrl?: string;
  cvUrl?: string;
  portfolioUrl?: string;
  yearsExperience?: number;
  hourlyRate?: number;
  currency?: string;
  timezone?: string;
  location?: string;
  bio?: string;
}

export interface BulkImportResult {
  total: number;
  created: Array<{ id: string; name: string; githubHandle: string }>;
  skipped: Array<{ githubHandle: string; reason: string }>;
  errors: Array<{ githubHandle: string; error: string }>;
}

export async function bulkImportCandidates(input: {
  candidates: BulkImportCandidateRow[];
  origin?: "INTERNAL" | "EXTERNAL";
}): Promise<BulkImportResult> {
  return apiFetch<BulkImportResult>("/api/codeclear/admin/bulk-import-candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getProofHealth(): Promise<ProofHealthResponse> {
  return apiFetch<ProofHealthResponse>("/api/proof/health");
}

export async function listProofDocuments(
  params?: { proposalId?: string | null },
): Promise<{ documents: ProofDocumentRecord[] }> {
  const query = new URLSearchParams();
  if (params?.proposalId) query.set("proposalId", params.proposalId);
  const qs = query.toString();
  return apiFetch<{ documents: ProofDocumentRecord[] }>(
    `/api/proof/documents${qs ? `?${qs}` : ""}`,
  );
}

export async function createProofDocument(
  input: ProofCreateDocumentInput,
): Promise<{ document: ProofDocumentRecord }> {
  return apiFetch<{ document: ProofDocumentRecord }>("/api/proof/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateProofDocument(
  id: string,
  input: ProofDocumentUpdateInput,
): Promise<{ document: ProofDocumentRecord }> {
  return apiFetch<{ document: ProofDocumentRecord }>(`/api/proof/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function listPulseScans(params?: {
  clientId?: string;
}): Promise<{ scans: PulseScanListItem[] }> {
  const query = new URLSearchParams();
  if (params?.clientId) query.set("clientId", params.clientId);
  const qs = query.toString();
  return apiFetch<{ scans: PulseScanListItem[] }>(`/api/pulse/scans${qs ? `?${qs}` : ""}`);
}

export async function getPulsePortfolio(): Promise<{ portfolio: import("@/types/pulse").PulsePortfolioEntry[] }> {
  return apiFetch<{ portfolio: import("@/types/pulse").PulsePortfolioEntry[] }>("/api/pulse/portfolio");
}

export async function createPulseScan(input: {
  projectName: string;
  inputType: "URL" | "GITHUB_REPO" | "FREE_TEXT";
  inputUrl?: string;
  inputGithubRepo?: string;
  inputDescription?: string;
  platform?: string;
  clientId?: string;
  aiProvider?: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";
  competitorUrls?: string[];
  targetMarkets?: string[];
  projectDescription?: string;
  testEmail?: string;
  testPassword?: string;
}): Promise<{ scan: PulseScanRecord }> {
  return apiFetch<{ scan: PulseScanRecord }>("/api/pulse/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getPulseScan(scanId: string): Promise<{ scan: PulseScanRecord }> {
  return apiFetch<{ scan: PulseScanRecord }>(`/api/pulse/scans/${scanId}`);
}

export interface PulseScanHistoryPoint { id: string; completedAt: string | null; healthScore: number | null }
export async function getPulseScanHistory(scanId: string): Promise<{ history: PulseScanHistoryPoint[] }> {
  return apiFetch<{ history: PulseScanHistoryPoint[] }>(`/api/pulse/scans/${scanId}/history`);
}

export async function getPulseScanDiff(scanId: string): Promise<{ diff: import("@/types/pulse").PulseScanDiff | null }> {
  return apiFetch<{ diff: import("@/types/pulse").PulseScanDiff | null }>(`/api/pulse/scans/${scanId}/diff`);
}

export async function emailPulseAudit(scanId: string, input: { to: string; message?: string }): Promise<{ sent: boolean; reportUrl: string }> {
  return apiFetch<{ sent: boolean; reportUrl: string }>(`/api/pulse/scans/${scanId}/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getPulseBenchmarks(scanId: string): Promise<{ benchmarks: IndustryBenchmark | null }> {
  return apiFetch<{ benchmarks: IndustryBenchmark | null }>(`/api/pulse/scans/${scanId}/benchmarks`);
}

export async function deletePulseScan(scanId: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/pulse/scans/${scanId}`, {
    method: "DELETE",
  });
}

export async function cancelPulseScan(scanId: string): Promise<{ cancelled: boolean }> {
  return apiFetch<{ cancelled: boolean }>(`/api/pulse/scans/${scanId}/cancel`, {
    method: "POST",
  });
}

export async function retryPulseScan(scanId: string): Promise<{ scan: import("@/types/pulse").PulseScanRecord }> {
  return apiFetch<{ scan: import("@/types/pulse").PulseScanRecord }>(`/api/pulse/scans/${scanId}/retry`, {
    method: "POST",
  });
}

export async function reanalysePulseScan(
  scanId: string,
  context?: string,
): Promise<{ scan: import("@/types/pulse").PulseScanRecord }> {
  return apiFetch<{ scan: import("@/types/pulse").PulseScanRecord }>(
    `/api/pulse/scans/${scanId}/reanalyse`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context }),
    },
  );
}

export async function generateProposalFromScan(
  scanId: string,
): Promise<{ proposalId: string }> {
  return apiFetch<{ proposalId: string }>(
    `/api/pulse/scans/${scanId}/generate-proposal`,
    { method: "POST" },
  );
}

export async function getPulseStats(): Promise<import("@/server/pulse").PulseStatsResponse> {
  return apiFetch<import("@/server/pulse").PulseStatsResponse>("/api/pulse/stats");
}

export async function sharePulseScan(scanId: string): Promise<{ shareToken: string; isShared: boolean }> {
  return apiFetch<{ shareToken: string; isShared: boolean }>(
    `/api/pulse/scans/${scanId}/share`,
    { method: "POST" },
  );
}

export async function unsharePulseScan(scanId: string): Promise<{ isShared: boolean }> {
  return apiFetch<{ isShared: boolean }>(
    `/api/pulse/scans/${scanId}/share`,
    { method: "DELETE" },
  );
}

export async function listPulseLeads(): Promise<{ leads: import("@/server/pulse-lite/leads-admin").PulseLeadView[] }> {
  return apiFetch<{ leads: import("@/server/pulse-lite/leads-admin").PulseLeadView[] }>("/api/pulse/leads");
}

export async function importPulseLead(leadId: string): Promise<{ scanId: string }> {
  return apiFetch<{ scanId: string }>(`/api/pulse/leads/${leadId}/import`, { method: "POST" });
}

export interface PulseEmbedConfig {
  enabled: boolean;
  checkKeys: string[];
  bookingUrl: string;
  turnstileSiteKey: string | null;
  turnstileConfigured: boolean;
}

export async function getPulseEmbedConfig(): Promise<PulseEmbedConfig> {
  return apiFetch<PulseEmbedConfig>("/api/workspace/pulse-embed");
}

export async function updatePulseEmbedConfig(patch: {
  enabled?: boolean;
  checkKeys?: string[];
  bookingUrl?: string;
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
}): Promise<PulseEmbedConfig> {
  return apiFetch<PulseEmbedConfig>("/api/workspace/pulse-embed", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export interface FixAgentResult {
  proposedFixes: Array<{ checkKey: string; filePath: string; newContent: string; explanation: string }>;
  prUrl: string | null;
  manualActions: Array<{ checkKey: string; label: string; why: string }>;
  summary: string;
}

export async function triggerFixAgent(scanId: string): Promise<FixAgentResult> {
  return apiFetch<FixAgentResult>(
    `/api/pulse/scans/${scanId}/fix-agent`,
    { method: "POST" },
  );
}

export async function triggerBrowserAgent(scanId: string): Promise<{ insights: BrowserAgentInsights; checksAdded: number }> {
  return apiFetch<{ insights: BrowserAgentInsights; checksAdded: number }>(
    `/api/pulse/scans/${scanId}/run-browser`,
    { method: "POST" },
  );
}

export async function triggerDiscoveryKit(scanId: string): Promise<{ kit: DiscoveryKit }> {
  return apiFetch<{ kit: DiscoveryKit }>(
    `/api/pulse/scans/${scanId}/run-discovery`,
    { method: "POST" },
  );
}

export async function loadDemoScan(): Promise<{ scanId: string }> {
  return apiFetch<{ scanId: string }>("/api/dev/seed-demo", { method: "POST" });
}

export interface MonitorRecord {
  id: string;
  projectName: string;
  inputType: string;
  inputUrl: string | null;
  inputGithubRepo: string | null;
  webhookSecret: string;
  lastScanId: string | null;
  lastHealthScore: number | null;
  alertThreshold: number;
  isActive: boolean;
  frequency: "DAILY" | "WEEKLY" | "OFF";
  lastRunAt: string | null;
  createdAt: string;
  webhookUrl: string;
}

export async function listMonitors(): Promise<{ monitors: MonitorRecord[] }> {
  return apiFetch<{ monitors: MonitorRecord[] }>("/api/pulse/monitors");
}

export async function createMonitor(input: {
  projectName: string;
  inputType: string;
  inputUrl?: string;
  inputGithubRepo?: string;
  clientId?: string;
  alertThreshold?: number;
  frequency?: "DAILY" | "WEEKLY" | "OFF";
}): Promise<{ monitor: MonitorRecord }> {
  return apiFetch<{ monitor: MonitorRecord }>("/api/pulse/monitors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateMonitor(monitorId: string, input: { frequency?: "DAILY" | "WEEKLY" | "OFF"; isActive?: boolean; alertThreshold?: number }): Promise<{ monitor: MonitorRecord }> {
  return apiFetch<{ monitor: MonitorRecord }>(`/api/pulse/monitors/${monitorId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteMonitor(monitorId: string): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/api/pulse/monitors/${monitorId}`, {
    method: "DELETE",
  });
}

export interface IntegrationsResponse {
  aiProvider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";
  anthropicKeyMasked: string | null;
  anthropicKeySource: "env" | "database" | null;
  anthropicModel: string;
  openaiKeyMasked: string | null;
  openaiKeySource: "env" | "database" | null;
  openaiModel: string;
  geminiKeyMasked: string | null;
  geminiKeySource: "env" | "database" | null;
  geminiModel: string;
  localLlmUrl: string;
  localLlmModel: string;
  externalApiKeyMasked: string | null;
  externalApiKeySource: "env" | "database" | null;
  googleServiceAccountJsonSet: boolean;
  googleSubjectEmail: string | null;
  googleCalendarId: string | null;
  /** Whether the *signed-in user* has connected their personal Google. Drives Calendar/Gmail widgets. */
  googleOAuthConnected: boolean;
  /** Email the current user is connected as (null when not connected). */
  googleOAuthConnectedAs: string | null;
  /** Whether the workspace-shared sync Google account is configured (admin-managed, cron only). */
  workspaceGoogleOAuthConnected: boolean;
  slackBotTokenMasked: string | null;
  /** True once a Slack signing secret has been pasted + encrypted on the workspace. */
  slackSigningSecretSet: boolean;
  /** Slack app id, e.g. "A012ABC". Display-only, not a secret. */
  slackAppId: string | null;
  /** Slack team id, written by `auth.test` after a successful Save & verify. */
  slackTeamId: string | null;
  /** Slack team / workspace name, written by `auth.test`. Display-only. */
  slackTeamName: string | null;
  /** Bot user id, written by `auth.test`. Display-only. */
  slackBotUserId: string | null;
  /** ISO timestamp of the most recent successful Slack post — diagnostics only. */
  lastSlackPostAt: string | null;
  slackSummaryChannelId: string | null; // legacy
  slackChannels: SlackChannel[];
  channelRoutes: Record<string, string>;
  emailProvider: "RESEND" | "SMTP" | null;
  emailFromAddress: string | null;
  emailFromName: string | null;
  emailReplyTo: string | null;
  emailApiKeyMasked: string | null;
  emailSmtpHost: string | null;
  emailSmtpPort: number | null;
  emailSmtpUser: string | null;
  emailSmtpPasswordSet: boolean;
}

export interface SlackChannel {
  id: string;
  name: string;
}

export interface SlackAvailableChannel {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
  memberCount: number;
}

export async function fetchSlackChannels(): Promise<SlackAvailableChannel[]> {
  const data = await apiFetch<{ channels: SlackAvailableChannel[] }>(
    "/api/integrations/slack/channels",
  );
  return data.channels;
}

export interface ModelOption {
  id: string;
  name: string;
}

export async function fetchProviderModels(
  provider: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL",
): Promise<ModelOption[]> {
  const data = await apiFetch<{ models: ModelOption[] }>(
    `/api/settings/models?provider=${provider}`,
  );
  return data.models;
}

export async function getIntegrations(): Promise<IntegrationsResponse> {
  return apiFetch("/api/settings/integrations");
}

export async function saveIntegrations(data: {
  aiProvider?: "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";
  anthropicApiKey?: string;
  anthropicModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  localLlmUrl?: string;
  localLlmModel?: string;
  externalApiKey?: string;
  googleServiceAccountJson?: string;
  googleSubjectEmail?: string;
  googleCalendarId?: string;
  slackBotToken?: string;
  slackSigningSecret?: string;
  slackAppId?: string;
  /** Run `auth.test` against the (newly) pasted bot token; persist team / user fields on success. */
  slackVerify?: boolean;
  /** Clear every Slack credential + cached channels. */
  slackDisconnect?: boolean;
  slackSummaryChannelId?: string;
  slackChannels?: SlackChannel[];
  channelRoutes?: Record<string, string>;
  emailProvider?: "RESEND" | "SMTP" | null;
  emailApiKey?: string;
  emailFromAddress?: string;
  emailFromName?: string;
  emailReplyTo?: string;
  emailSmtpHost?: string;
  emailSmtpPort?: number;
  emailSmtpUser?: string;
  emailSmtpPassword?: string;
}): Promise<{ saved: boolean }> {
  return apiFetch("/api/settings/integrations", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// Keep for backwards compat
export async function saveAnthropicKey(anthropicApiKey: string): Promise<{ saved: boolean }> {
  return saveIntegrations({ anthropicApiKey });
}

// ─── Support API ──────────────────────────────────────────────────────────────

export async function listSupportClients(): Promise<{ clients: SupportClient[] }> {
  return apiFetch("/api/support/clients");
}

export async function getSupportClient(clientId: string): Promise<{ client: SupportClient }> {
  return apiFetch(`/api/support/clients/${clientId}`);
}

export async function createSupportClient(
  data: Partial<SupportClient>,
): Promise<{ client: SupportClient }> {
  return apiFetch("/api/support/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateSupportClient(
  clientId: string,
  data: Partial<SupportClient>,
): Promise<{ client: SupportClient }> {
  return apiFetch(`/api/support/clients/${clientId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function listSupportReports(
  clientId: string,
): Promise<{ reports: SupportReport[] }> {
  return apiFetch(`/api/support/clients/${clientId}/reports`);
}

export async function createSupportReport(
  clientId: string,
  data: { period: string; payload: SupportReportPayload; createdBy?: string },
): Promise<{ report: SupportReport }> {
  return apiFetch(`/api/support/clients/${clientId}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function generateSupportReportDoc(
  clientId: string,
  data: { periodStart: string; periodEnd: string; periodLabel: string; author?: string; force?: boolean },
): Promise<{ documentId: string }> {
  return apiFetch(`/api/support/clients/${clientId}/reports/generate-doc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateSupportReport(
  clientId: string,
  reportId: string,
  data: { period?: string; payload?: SupportReportPayload },
): Promise<{ report: SupportReport }> {
  return apiFetch(`/api/support/clients/${clientId}/reports/${reportId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteSupportReport(
  clientId: string,
  reportId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/support/clients/${clientId}/reports/${reportId}`, {
    method: "DELETE",
  });
}

export async function getSupportReport(reportId: string): Promise<{ report: SupportReport }> {
  return apiFetch(`/api/support/reports/${reportId}`);
}

export interface ConversationListParams {
  status?: string | string[];
  assigneeId?: string;
  priority?: string;
  issueType?: string;
  source?: string;
  includeSnoozedDue?: boolean;
  limit?: number;
  cursor?: string;
}

export async function listSupportConversations(
  clientId: string,
  params?: ConversationListParams,
): Promise<{ conversations: Conversation[]; nextCursor: string | null }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", Array.isArray(params.status) ? params.status.join(",") : params.status);
  if (params?.assigneeId) qs.set("assigneeId", params.assigneeId);
  if (params?.priority) qs.set("priority", params.priority);
  if (params?.issueType) qs.set("issueType", params.issueType);
  if (params?.source) qs.set("source", params.source);
  if (params?.includeSnoozedDue) qs.set("includeSnoozedDue", "1");
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.cursor) qs.set("cursor", params.cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch(`/api/support/clients/${clientId}/conversations${suffix}`);
}

// ── Conversation triage (monitor + route; never reply in-app) ──

export type TriageData = Partial<{
  status: Conversation["status"];
  priority: Conversation["priority"];
  issueType: string | null;
  assigneeId: string | null;
}>;

export async function triageConversation(
  clientId: string,
  convId: string,
  data: TriageData,
): Promise<{ conversation: Conversation }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations/${convId}/triage`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function assignConversation(
  clientId: string,
  convId: string,
  assigneeId: string | null,
): Promise<{ conversation: Conversation }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations/${convId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assigneeId }),
  });
}

export async function snoozeConversation(
  clientId: string,
  convId: string,
  until: string,
): Promise<{ conversation: Conversation }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations/${convId}/snooze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ until }),
  });
}

export async function closeConversation(
  clientId: string,
  convId: string,
  opts: { ignored?: boolean; reopen?: boolean } = {},
): Promise<{ conversation: Conversation }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations/${convId}/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
}

export async function batchTriageConversations(
  clientId: string,
  conversationIds: string[],
  data: Partial<{ status: string; priority: string; assigneeId: string | null }>,
): Promise<{ updated: number }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations/batch`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationIds, data }),
  });
}

export async function listConversationNotes(
  clientId: string,
  convId: string,
): Promise<{ notes: import("@/types/support").ConversationNote[] }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations/${convId}/notes`);
}

export async function addConversationNote(
  clientId: string,
  convId: string,
  body: string,
): Promise<{ note: import("@/types/support").ConversationNote }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations/${convId}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export async function syncSupportClient(
  clientId: string,
): Promise<{ total: number; ingested: number; filtered: number; errors: string[] }> {
  return apiFetch(`/api/support/clients/${clientId}/sync`, { method: "POST" });
}

export async function searchConversationsSemantic(
  clientId: string,
  query: string,
  limit = 10,
): Promise<{ results: Array<{ id: string; subject: string; preview: string | null; source: string; customerLabel: string; receivedAt: string; score: number }> }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
  });
}

export async function generateReportNarrative(
  clientId: string,
  data: { periodStart?: string; periodEnd?: string; periodLabel?: string },
): Promise<{ overviewText: string; performanceText: string; summaryText: string; ticketCount: number }> {
  return apiFetch(`/api/support/clients/${clientId}/reports/generate-narrative`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateSupportConversation(
  clientId: string,
  convId: string,
  data: Partial<Conversation>,
): Promise<{ conversation: Conversation }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations/${convId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function listSupportMessages(
  clientId: string,
  convId: string,
): Promise<{ messages: Message[] }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations/${convId}/messages`);
}

export async function sendSupportMessage(
  clientId: string,
  convId: string,
  data: { direction: "inbound" | "outbound"; authorLabel: string; body: string },
): Promise<{ message: Message }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations/${convId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function listSupportTickets(clientId: string): Promise<{ tickets: Ticket[]; nextCursor: string | null }> {
  return apiFetch(`/api/support/clients/${clientId}/tickets`);
}

export async function updateSupportTicket(
  clientId: string,
  ticketId: string,
  data: Partial<Ticket>,
): Promise<{ ticket: Ticket }> {
  return apiFetch(`/api/support/clients/${clientId}/tickets/${ticketId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteSupportTicket(
  clientId: string,
  ticketId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/support/clients/${clientId}/tickets/${ticketId}`, {
    method: "DELETE",
  });
}

export async function batchUpdateSupportTickets(
  clientId: string,
  ticketIds: string[],
  data: Partial<{ status: string; priority: string; assignedTo: string }>,
): Promise<{ updated: number }> {
  return apiFetch(`/api/support/clients/${clientId}/tickets/batch`, {
    method: "PATCH",
    body: JSON.stringify({ ticketIds, data }),
  });
}

export async function getTicketStats(
  clientId: string,
  start: string,
  end: string,
): Promise<{ stats: {
  totalTickets: number;
  catCancellations: number;
  catAccountQueries: number;
  catRefunds: number;
  catTechIssues: number;
  catOther: number;
  prioUrgent: number;
  prioHigh: number;
  prioMedium: number;
  prioLow: number;
} }> {
  return apiFetch(`/api/support/clients/${clientId}/tickets/stats?start=${start}&end=${end}`);
}

export async function getClientHealthScore(
  clientId: string,
): Promise<{ health: import("@/types/support").ClientHealthScore }> {
  return apiFetch(`/api/support/clients/${clientId}/health`);
}

export async function getTicketPerformance(
  clientId: string,
  start: string,
  end: string,
): Promise<{ metrics: import("@/types/support").SupportPerformanceMetrics }> {
  return apiFetch(`/api/support/clients/${clientId}/tickets/performance?start=${start}&end=${end}`);
}

export async function listSupportConnections(
  clientId: string,
): Promise<{ connections: Connection[] }> {
  return apiFetch(`/api/support/clients/${clientId}/connections`);
}

export async function createSupportConnection(
  clientId: string,
  data: {
    source: Connection["source"];
    label: string;
    authMode: Connection["authMode"];
    health?: Connection["health"];
    secretRef?: string;
    nextStep?: string;
    scraperConfig?: Connection["scraperConfig"];
  },
): Promise<{ connection: Connection }> {
  return apiFetch(`/api/support/clients/${clientId}/connections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateSupportConnection(
  clientId: string,
  connId: string,
  data: Partial<Connection>,
): Promise<{ connection: Connection }> {
  return apiFetch(`/api/support/clients/${clientId}/connections/${connId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteSupportConnection(
  clientId: string,
  connId: string,
): Promise<void> {
  return apiFetch(`/api/support/clients/${clientId}/connections/${connId}`, {
    method: "DELETE",
  });
}

export async function purgeConnectionConversations(
  clientId: string,
  connId: string,
): Promise<{ deleted: number }> {
  return apiFetch(`/api/support/clients/${clientId}/connections/${connId}/purge`, {
    method: "DELETE",
  });
}

export async function syncSupportConnection(
  clientId: string,
  connId: string,
  options?: { resync?: boolean },
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const qs = options?.resync ? "?resync=1" : "";
  return apiFetch(`/api/support/clients/${clientId}/connections/${connId}/sync${qs}`, {
    method: "POST",
  });
}

export async function generateAiDraft(
  clientId: string,
  convId: string,
): Promise<{ draft: string }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations/${convId}/ai-draft`, {
    method: "POST",
  });
}

export async function listSupportDraftActions(
  clientId: string,
): Promise<{ draftActions: DraftAction[] }> {
  return apiFetch(`/api/support/clients/${clientId}/draft-actions`);
}

export async function updateSupportDraftAction(
  clientId: string,
  draftId: string,
  data: Partial<DraftAction>,
): Promise<{ draftAction: DraftAction }> {
  return apiFetch(`/api/support/clients/${clientId}/draft-actions/${draftId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function listSupportWorkflowRules(
  clientId: string,
): Promise<{ rules: WorkflowRule[] }> {
  return apiFetch(`/api/support/clients/${clientId}/workflow-rules`);
}

export async function createSupportWorkflowRule(
  clientId: string,
  data: Partial<WorkflowRule>,
): Promise<{ rule: WorkflowRule }> {
  return apiFetch(`/api/support/clients/${clientId}/workflow-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateSupportWorkflowRule(
  clientId: string,
  ruleId: string,
  data: Partial<WorkflowRule>,
): Promise<{ rule: WorkflowRule }> {
  return apiFetch(`/api/support/clients/${clientId}/workflow-rules/${ruleId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteSupportWorkflowRule(
  clientId: string,
  ruleId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/support/clients/${clientId}/workflow-rules/${ruleId}`, {
    method: "DELETE",
  });
}

export async function listSupportAuditLogs(clientId: string): Promise<{ logs: AuditLog[] }> {
  return apiFetch(`/api/support/clients/${clientId}/audit-logs`);
}

export async function listSupportMembers(
  clientId: string,
): Promise<{ members: { id: string; name: string; email: string; role: string }[] }> {
  return apiFetch(`/api/support/clients/${clientId}/members`);
}

export async function seedSupportDefaultRules(clientId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/support/clients/${clientId}/seed-rules`, { method: "POST" });
}

// ── Team management ───────────────────────────────────────────────────────────

export interface TeamMember {
  userId: string;
  memberId: string;
  name: string | null;
  email: string;
  role: RoleId;
  permissions: string[];
  createdAt?: string;
}

export async function listTeamMembers(): Promise<{ members: TeamMember[] }> {
  return apiFetch("/api/team");
}

export async function createTeamMember(data: {
  name: string;
  email: string;
  password: string;
  role: RoleId;
  permissions: string[];
}): Promise<TeamMember> {
  return apiFetch("/api/team", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateTeamMember(
  userId: string,
  data: { name?: string; role?: RoleId; permissions?: string[] },
): Promise<TeamMember> {
  return apiFetch(`/api/team/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteTeamMember(userId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/team/${userId}`, { method: "DELETE" });
}

export async function resetTeamMemberPassword(
  userId: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/team/${userId}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newPassword }),
  });
}

// ─── Integrations (Gmail / Calendar / Meetings) ───────────────────────────────

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  unread: boolean;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendees: string[];
  location: string | null;
  meetLink: string | null;
}

export async function getGmailMessages(
  query?: string,
): Promise<{ connected: boolean; messages: GmailMessage[] }> {
  const qs = query ? `?q=${encodeURIComponent(query)}` : "";
  return apiFetch(`/api/integrations/gmail${qs}`);
}

export async function getCalendarEvents(): Promise<{ connected: boolean; events: CalendarEvent[] }> {
  return apiFetch("/api/integrations/calendar");
}

// ─── The Desk (internal aggregator drawer) ────────────────────────────────────

export async function getDeskActionItems(): Promise<{ items: DeskActionItemDTO[] }> {
  return apiFetch("/api/desk/action-items");
}

export async function getDeskSlack(): Promise<DeskSlackResult> {
  return apiFetch("/api/desk/slack");
}

export async function getDeskMentions(): Promise<DeskMentionsResult> {
  return apiFetch("/api/desk/mentions");
}

// ─── Data lifecycle: client Drive archive + retention purge review ───────────

export interface ClientDriveArchiveStatus {
  archivedToDriveAt: string | null;
  folderUrl: string | null;
  /** Whether Drive backup is actually configured (master switch on + a connected Google
   *  account). When false the export would silently no-op, so the UI blocks it. */
  ready: boolean;
  /** Why it's not ready, when `ready` is false. */
  reason: "backup_disabled" | "no_backup_account" | null;
}

/** Read the client's Google Drive archive status. */
export async function getClientDriveArchiveStatus(slug: string): Promise<ClientDriveArchiveStatus> {
  return apiFetch<ClientDriveArchiveStatus>(`/api/clients/${slug}/archive-to-drive`);
}

/** Manually (re-)run the client's Google Drive archive — enqueues a durable, deduped job. */
export async function archiveClientToDrive(
  slug: string,
): Promise<{ jobId: string; queued: boolean; alreadyRunning: boolean }> {
  return apiFetch(`/api/clients/${slug}/archive-to-drive`, { method: "POST" });
}

export interface DeskAttention {
  purgeReview: { count: number; reclaimableBytes: number };
}

export async function getDeskAttention(): Promise<DeskAttention> {
  return apiFetch("/api/desk/attention");
}

export interface PurgeCandidateDTO {
  id: string;
  policyKey: string;
  entity: string;
  scopeId: string | null;
  rowCount: number;
  byteSize: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  purgeEligibleAt: string | null;
}

export async function getPurgeCandidates(): Promise<{ candidates: PurgeCandidateDTO[] }> {
  return apiFetch("/api/retention/purge-candidates");
}

export async function approvePurge(ids: string[]): Promise<{ purged: number; errors: string[] }> {
  return apiFetch("/api/retention/purge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

// ─── Desk reminders (temporary personal list) ────────────────────────────────

export async function getDeskReminders(): Promise<{ reminders: DeskReminderDTO[] }> {
  return apiFetch("/api/desk/reminders");
}

export async function createDeskReminder(body: string): Promise<{ reminder: DeskReminderDTO }> {
  return apiFetch("/api/desk/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export async function updateDeskReminder(
  id: string,
  input: { done?: boolean; body?: string },
): Promise<{ reminder: DeskReminderDTO }> {
  return apiFetch(`/api/desk/reminders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteDeskReminder(id: string): Promise<{ ok: true }> {
  return apiFetch(`/api/desk/reminders/${id}`, { method: "DELETE" });
}

// ─── Desk broadcast (workspace-wide banner) ──────────────────────────────────

export async function getActiveBroadcast(): Promise<{ broadcast: BroadcastDTO | null }> {
  return apiFetch("/api/desk/broadcast");
}

export async function postBroadcast(input: {
  message: string;
  durationDays: BroadcastDuration;
}): Promise<{ broadcast: BroadcastDTO }> {
  return apiFetch("/api/desk/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function dismissBroadcast(): Promise<{ ok: true }> {
  return apiFetch("/api/desk/broadcast", { method: "DELETE" });
}

export async function getDeskHolidays(): Promise<DeskHolidays> {
  return apiFetch("/api/desk/holidays");
}

export interface MeetingSummaryResponse {
  summary: string;
  cached: boolean;
  cachedAt?: string;
  generatedBy?: string | null;
}

export async function generateMeetingSummary(data: {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  attendees: string[];
  channelIds?: string[];
  /** Bypass the workspace cache and regenerate. */
  force?: boolean;
}): Promise<MeetingSummaryResponse> {
  return apiFetch("/api/integrations/meeting-summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ─── Scribe (client meeting notes) ─────────────────────────────────────────

export type ScribeMeetingStatus =
  | "AWAITING_TRANSCRIPT"
  | "TRANSCRIBED"
  | "SUMMARISED"
  | "NO_TRANSCRIPT"
  | "ERROR";

export interface ScribeActionItem {
  id: string;
  title: string | null;
  text: string;
  owner: string | null;
  done: boolean;
  taskId: string | null;
}

export interface ScribeMeeting {
  id: string;
  clientId: string | null;
  calendarEventId: string | null;
  meetingCode: string | null;
  conferenceRecordName?: string | null;
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  attendees: string[];
  status: ScribeMeetingStatus;
  summary: string | null;
  decisions: string[] | null;
  modelUsed: string | null;
  createdAt: string;
  updatedAt: string;
  actionItems: ScribeActionItem[];
  // Present only on the detail endpoint.
  transcriptText?: string | null;
}

export interface ScribeCandidate {
  calendarEventId: string;
  title: string;
  start: string;
  end: string;
  meetingCode: string | null;
  attendees: string[];
}

export interface ClientMeetingsResponse {
  meetings: ScribeMeeting[];
  candidates: ScribeCandidate[];
  calendarConnected: boolean;
  query?: string | null;
}

export async function getClientMeetings(slug: string, q?: string, all?: boolean): Promise<ClientMeetingsResponse> {
  // `all` = the manual "grab a note" picker: every recent Meet call, unfiltered by name/domain.
  const qs = all ? "?all=1" : q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return apiFetch(`/api/clients/${slug}/meetings${qs}`);
}

export async function ingestClientMeeting(
  slug: string,
  body: {
    calendarEventId: string;
    meetingCode: string;
    title: string;
    start?: string;
    end?: string;
    attendees?: string[];
  },
): Promise<{ meeting: ScribeMeeting }> {
  return apiFetch(`/api/clients/${slug}/meetings/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getClientMeeting(slug: string, id: string): Promise<{ meeting: ScribeMeeting }> {
  return apiFetch(`/api/clients/${slug}/meetings/${id}`);
}

export async function updateMeetingActionItem(
  slug: string,
  meetingId: string,
  body: { actionItemId: string; done: boolean },
): Promise<{ meeting: ScribeMeeting }> {
  return apiFetch(`/api/clients/${slug}/meetings/${meetingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function addMeetingDecisionApi(
  slug: string,
  meetingId: string,
  decisionText: string,
): Promise<{ meeting: ScribeMeeting }> {
  return apiFetch(`/api/clients/${slug}/meetings/${meetingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decisionText }),
  });
}

export async function removeMeetingDecisionApi(
  slug: string,
  meetingId: string,
  removeDecisionIndex: number,
): Promise<{ meeting: ScribeMeeting }> {
  return apiFetch(`/api/clients/${slug}/meetings/${meetingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removeDecisionIndex }),
  });
}

/** Link (taskId set) or unlink (taskId null) the board Task created from an action item. */
export async function linkMeetingActionItemTask(
  slug: string,
  meetingId: string,
  body: { actionItemId: string; taskId: string | null },
): Promise<{ meeting: ScribeMeeting }> {
  return apiFetch(`/api/clients/${slug}/meetings/${meetingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}


// ─── Backstage (internal ops) ──────────────────────────────────────────────

import type {
  AbsenceDTO,
  AbsenceKind,
  AvailabilitySettings,
  BackstageMember,
  CalendarConnectionMember,
  CalendarMonth,
  CalendarTimeline,
  CoverableClient,
  CoverAssignmentDTO,
  ExpenseDTO,
  SlackChannelOption,
  LeaveAllowanceDTO,
  LeaveRequestDTO,
  StaffingAlertsResponse,
  TeamCalendarEvent,
} from "@/types/backstage";

export type BackstageScope = "me" | "team" | "all";

export function listBackstageLeave(opts: {
  scope?: BackstageScope;
  status?: string;
  limit?: number;
}): Promise<LeaveRequestDTO[]> {
  const params = new URLSearchParams();
  if (opts.scope) params.set("scope", opts.scope);
  if (opts.status) params.set("status", opts.status);
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiFetch(`/api/backstage/leave${qs ? `?${qs}` : ""}`);
}

export function createBackstageLeave(data: {
  type: string;
  startDate: string;
  endDate: string;
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
  reason?: string;
  userId?: string;
}): Promise<LeaveRequestDTO> {
  return apiFetch("/api/backstage/leave", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function cancelBackstageLeave(id: string): Promise<LeaveRequestDTO> {
  return apiFetch(`/api/backstage/leave/${id}`, { method: "DELETE" });
}

export function updateBackstageLeave(
  id: string,
  data: {
    type?: string;
    startDate?: string;
    endDate?: string;
    halfDayStart?: boolean;
    halfDayEnd?: boolean;
    reason?: string;
  },
): Promise<LeaveRequestDTO> {
  return apiFetch(`/api/backstage/leave/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function approveBackstageLeave(id: string, note?: string): Promise<LeaveRequestDTO> {
  return apiFetch(`/api/backstage/leave/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: note ?? undefined }),
  });
}

export function rejectBackstageLeave(id: string, note?: string): Promise<LeaveRequestDTO> {
  return apiFetch(`/api/backstage/leave/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note: note ?? undefined }),
  });
}

export function listBackstageExpenses(opts: {
  scope?: BackstageScope;
  status?: string;
  limit?: number;
}): Promise<ExpenseDTO[]> {
  const params = new URLSearchParams();
  if (opts.scope) params.set("scope", opts.scope);
  if (opts.status) params.set("status", opts.status);
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiFetch(`/api/backstage/expenses${qs ? `?${qs}` : ""}`);
}

export function createBackstageExpense(data: {
  amount: number;
  currency: string;
  category: string;
  vendor?: string;
  occurredOn: string;
  notes?: string;
  userId?: string;
}): Promise<ExpenseDTO> {
  return apiFetch("/api/backstage/expenses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function uploadBackstageReceipt(
  expenseId: string,
  file: File,
): Promise<ExpenseDTO> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/backstage/expenses/${expenseId}/receipt`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : `Upload failed: ${res.status}`;
    throw new Error(msg);
  }
  return data as ExpenseDTO;
}

export function reviewBackstageExpense(
  id: string,
  status: "APPROVED" | "REJECTED" | "REIMBURSED",
  note?: string,
): Promise<ExpenseDTO> {
  return apiFetch(`/api/backstage/expenses/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note: note ?? undefined }),
  });
}

export function getBackstageAllowance(userId?: string): Promise<LeaveAllowanceDTO> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return apiFetch(`/api/backstage/allowance${qs}`);
}

export function getBackstageAlerts(windowDays?: number): Promise<StaffingAlertsResponse> {
  const qs = windowDays ? `?window=${windowDays}` : "";
  return apiFetch(`/api/backstage/alerts${qs}`);
}

export function listBackstageTeam(): Promise<BackstageMember[]> {
  return apiFetch("/api/backstage/team");
}

export async function setBackstageMemberPermission(
  userId: string,
  canApprove: boolean,
): Promise<void> {
  const res = await fetch(`/api/backstage/members/${userId}/permission`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ canApprove }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed: ${res.status}`);
  }
}

export function getBackstageCalendar(year: number, month: number): Promise<CalendarMonth> {
  return apiFetch(`/api/backstage/calendar?year=${year}&month=${month}`);
}

export function listBackstageCalendarConnections(): Promise<{
  selfConnected: boolean;
  members: CalendarConnectionMember[];
}> {
  return apiFetch("/api/backstage/calendar/connections");
}

export function getBackstageTeamCalendarEvents(
  year: number,
  month: number,
  userIds: string[],
): Promise<{ events: TeamCalendarEvent[] }> {
  const qs = new URLSearchParams({ year: String(year), month: String(month) });
  if (userIds.length) qs.set("userIds", userIds.join(","));
  return apiFetch(`/api/backstage/calendar/team-events?${qs.toString()}`);
}

export function getBackstageCalendarTimeline(
  year: number,
  month: number,
): Promise<CalendarTimeline> {
  return apiFetch(`/api/backstage/calendar/timeline?year=${year}&month=${month}`);
}

// ─── Absences ──────────────────────────────────────────────────────────────

export function listTodayAbsences(): Promise<AbsenceDTO[]> {
  return apiFetch("/api/backstage/absences");
}

export function listMonthAbsences(year: number, month: number): Promise<AbsenceDTO[]> {
  return apiFetch(`/api/backstage/absences?year=${year}&month=${month}`);
}

export function markAbsence(input: {
  userId: string;
  kind: AbsenceKind;
  note?: string;
  date?: string;
  endDate?: string;
  channelId?: string;
  channelName?: string;
  coverUserId?: string;
  coverClientId?: string;
}): Promise<AbsenceDTO> {
  return apiFetch("/api/backstage/absences", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteAbsence(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/backstage/absences/${id}`, { method: "DELETE" });
}

export function endAbsenceCover(id: string): Promise<AbsenceDTO> {
  return apiFetch(`/api/backstage/absences/${id}/end-cover`, { method: "POST" });
}

export function listCoverableClients(userId: string): Promise<CoverableClient[]> {
  return apiFetch(`/api/backstage/absences/coverable?userId=${encodeURIComponent(userId)}`);
}

export function listClientActiveCovers(clientId: string): Promise<CoverAssignmentDTO[]> {
  return apiFetch(`/api/backstage/absences/covers?clientId=${encodeURIComponent(clientId)}`);
}

export function listSlackChannels(): Promise<{ channels: SlackChannelOption[] }> {
  return apiFetch("/api/integrations/slack/channels");
}

export function getAvailabilitySettings(): Promise<AvailabilitySettings> {
  return apiFetch("/api/backstage/availability-settings");
}

export function setAvailabilityDigestChannel(
  channelId: string | null,
  channelName: string | null,
): Promise<AvailabilitySettings> {
  return apiFetch("/api/backstage/availability-settings", {
    method: "PATCH",
    body: JSON.stringify({ channelId, channelName }),
  });
}

// ─── Tasks (Portal task tracker + standups) ────────────────────────────────
import type {
  TaskDTO,
  TaskDetailDTO,
  TaskCommentDTO,
  TaskAttachmentDTO,
  TaskStatus,
  TaskPriority,
  TaskLabel,
  ClientTaskSummary,
  TaskCounts,
  TaskAttentionDTO,
  MyDayDTO,
  DailyUpdateDTO,
  RollupRosterDTO,
  ClientAssignmentDTO,
  FeatureBlockDTO,
  TimelineShareDTO,
  MilestoneDTO,
  SlackPushPrefs,
  ProjectUpdateInput,
  ProjectUpdateResult,
  BroadcastInput,
  BroadcastResult,
  SlackUpdateLogDTO,
} from "@/types/tasks";

export function listTasks(opts: {
  clientId?: string;
  status?: TaskStatus;
  assigneeId?: string;
  sourceMeetingId?: string;
  archived?: boolean;
  limit?: number;
  doneWithinDays?: number | "all";
} = {}): Promise<TaskDTO[]> {
  const q = new URLSearchParams();
  if (opts.clientId) q.set("clientId", opts.clientId);
  if (opts.status) q.set("status", opts.status);
  if (opts.assigneeId) q.set("assigneeId", opts.assigneeId);
  if (opts.sourceMeetingId) q.set("sourceMeetingId", opts.sourceMeetingId);
  if (opts.archived) q.set("archived", "true");
  if (opts.limit) q.set("limit", String(opts.limit));
  if (opts.doneWithinDays !== undefined) q.set("doneWithinDays", String(opts.doneWithinDays));
  const qs = q.toString();
  return apiFetch(`/api/tasks${qs ? `?${qs}` : ""}`);
}

export function getTask(id: string): Promise<TaskDetailDTO> {
  return apiFetch(`/api/tasks/${id}`);
}

export function getTaskCounts(): Promise<TaskCounts> {
  return apiFetch("/api/tasks/counts");
}

export function createTask(input: {
  clientId: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  label?: TaskLabel | null;
  assigneeIds?: string[];
  featureBlockId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<TaskDTO> {
  return apiFetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateTask(
  id: string,
  input: {
    title?: string;
    description?: string | null;
    acceptanceCriteria?: string | null;
    status?: TaskStatus;
    priority?: TaskPriority;
    label?: TaskLabel | null;
    assigneeIds?: string[];
    featureBlockId?: string | null;
    dueDate?: string | null;
    metadata?: Record<string, unknown> | null;
    archived?: boolean;
    blockedReason?: string | null;
  },
): Promise<TaskDTO> {
  return apiFetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function uploadTaskAttachment(taskId: string, file: File): Promise<TaskAttachmentDTO> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/tasks/${taskId}/attachments`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : `Upload failed: ${res.status}`;
    throw new Error(msg);
  }
  return data as TaskAttachmentDTO;
}

export function deleteTaskAttachment(taskId: string, attachmentId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/tasks/${taskId}/attachments/${attachmentId}`, { method: "DELETE" });
}

export function moveTask(
  id: string,
  input: { status: TaskStatus; orderKey: number },
): Promise<TaskDTO> {
  return apiFetch(`/api/tasks/${id}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteTask(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/tasks/${id}`, { method: "DELETE" });
}

export interface TaskBatchPatch {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeIds?: string[];
  featureBlockId?: string | null;
  dueDate?: string | null;
  archived?: boolean;
}

export function batchUpdateTasks(ids: string[], patch: TaskBatchPatch): Promise<{ updated: number }> {
  return apiFetch("/api/tasks/batch", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, patch }),
  });
}

export function batchDeleteTasks(ids: string[]): Promise<{ deleted: number }> {
  return apiFetch("/api/tasks/batch", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

export interface BatchCreateTaskRow {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  metadata?: Record<string, unknown> | null;
}

export function batchCreateTasks(
  clientId: string,
  tasks: BatchCreateTaskRow[],
): Promise<{ created: number; skipped: number; tasks: TaskDTO[] }> {
  return apiFetch("/api/tasks/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, tasks }),
  });
}

export type TaskImportRow = {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeIds?: string[];
  featureBlockId?: string | null;
  dueDate?: string | null;
};

export function importTasks(
  slug: string,
  tasks: TaskImportRow[],
): Promise<{ created: number; skipped: number }> {
  return apiFetch(`/api/clients/${slug}/tasks/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tasks }),
  });
}

export function listTaskComments(id: string): Promise<TaskCommentDTO[]> {
  return apiFetch(`/api/tasks/${id}/comments`);
}

export function addTaskComment(id: string, body: string): Promise<TaskCommentDTO> {
  return apiFetch(`/api/tasks/${id}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export function getClientTaskSummary(clientId: string): Promise<ClientTaskSummary> {
  return apiFetch(`/api/tasks/summary?clientId=${encodeURIComponent(clientId)}`);
}

export function getTaskAttention(opts: { mine?: boolean } = {}): Promise<TaskAttentionDTO> {
  return apiFetch(`/api/tasks/attention${opts.mine ? "?mine=1" : ""}`);
}

/**
 * Push a single task as a Block Kit card to its client's linked Slack channel.
 * Used by the per-task "Push" test buttons on HQ — does NOT count as the
 * daily standup (its SlackMessageRef carries kind "TEST_PUSH").
 */
export function pushTaskToSlack(
  taskId: string,
): Promise<{ posted: boolean; channelId: string; messageTs: string }> {
  return apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/push-to-slack`, {
    method: "POST",
  });
}

export function getMyDay(date?: string): Promise<MyDayDTO> {
  return apiFetch(`/api/tasks/standup${date ? `?date=${encodeURIComponent(date)}` : ""}`);
}

export function pushDailyUpdate(input: {
  phase: "AM" | "PM";
  weekPlan?: string;
  note?: string;
}): Promise<DailyUpdateDTO> {
  return apiFetch("/api/tasks/standup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Retract a sent standup — deletes today's posted Slack messages for the phase
 *  and resets the pushed state. */
export function deleteStandupUpdate(phase: "AM" | "PM"): Promise<DailyUpdateDTO> {
  return apiFetch(`/api/tasks/standup?phase=${phase}`, { method: "DELETE" });
}

export function getRollupRoster(): Promise<RollupRosterDTO> {
  return apiFetch("/api/tasks/rollup");
}

export function publishRollup(
  override = false,
): Promise<{ ok: boolean; channel: string | null; clientCount: number; taskCount: number }> {
  return apiFetch(`/api/tasks/rollup${override ? "?override=true" : ""}`, { method: "POST" });
}

export type DailyUpdatePhase = "AM" | "PM";

/** Compile every dev's daily update (done-today for PM, in-progress for AM),
 *  grouped by project then developer, and post it to the dedicated #updates
 *  channel. `configured` is false when no "Daily PM updates" channel route is
 *  set in Settings → Integrations. */
export function pushPmUpdates(phase: DailyUpdatePhase = "PM"): Promise<{
  ok: boolean;
  phase: DailyUpdatePhase;
  channel: string | null;
  configured: boolean;
  devCount: number;
  taskCount: number;
}> {
  return apiFetch(`/api/tasks/pm-updates?phase=${phase}`, { method: "POST" });
}

export interface PmUpdatePreviewDev {
  /** Developer display name (rendered as `@name`). */
  name: string;
  tasks: Array<{ title: string; taskId: string }>;
  note?: string | null;
}

export interface PmUpdatePreviewProject {
  clientName: string;
  clientSlug: string;
  devs: PmUpdatePreviewDev[];
}

export interface PmUpdatesPreview {
  ok: boolean;
  phase: DailyUpdatePhase;
  channel: string | null;
  configured: boolean;
  devCount: number;
  taskCount: number;
  dateLabel: string;
  projects: PmUpdatePreviewProject[];
  otherDevs: Array<{ name: string; note: string | null }>;
}

/** Preview the daily updates without posting — feeds the review modal so the
 *  admin can confirm before it goes to #updates. */
export function previewPmUpdates(phase: DailyUpdatePhase = "PM"): Promise<PmUpdatesPreview> {
  return apiFetch(`/api/tasks/pm-updates?phase=${phase}`);
}

// ─── Ad-hoc Slack pushes (Tasks-page composer + DevOps broadcast) ────────────

export function getSlackPushPrefs(): Promise<SlackPushPrefs> {
  return apiFetch("/api/tasks/push-prefs");
}

export function saveSlackPushPrefs(prefs: SlackPushPrefs): Promise<SlackPushPrefs> {
  return apiFetch("/api/tasks/push-prefs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
  });
}

export function pushProjectUpdate(input: ProjectUpdateInput): Promise<ProjectUpdateResult> {
  return apiFetch("/api/tasks/project-update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function broadcastUpdate(input: BroadcastInput): Promise<BroadcastResult> {
  return apiFetch("/api/tasks/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function listRecentSlackUpdates(): Promise<SlackUpdateLogDTO[]> {
  return apiFetch("/api/tasks/broadcast");
}

export function listMemberClients(memberId: string): Promise<ClientAssignmentDTO[]> {
  return apiFetch(`/api/team/members/${memberId}/clients`);
}

export function setMemberClients(
  memberId: string,
  clientIds: string[],
): Promise<ClientAssignmentDTO[]> {
  return apiFetch(`/api/team/members/${memberId}/clients`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientIds }),
  });
}

// ─── Roles & Permissions matrix ─────────────────────────────────────────────
export function getRolePermissions(): Promise<{ matrix: RoleMatrix }> {
  return apiFetch("/api/roles/permissions");
}

export function updateRolePermissions(matrix: RoleMatrix): Promise<{ matrix: RoleMatrix }> {
  return apiFetch("/api/roles/permissions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(matrix),
  });
}

// ─── Feature blocks ("lists") + timeline share ─────────────────────────────

export function listFeatureBlocks(clientId: string): Promise<FeatureBlockDTO[]> {
  return apiFetch(`/api/feature-blocks?clientId=${encodeURIComponent(clientId)}`);
}

export function createFeatureBlock(input: {
  clientId: string;
  name: string;
  description?: string;
  startDate?: string | null;
  endDate?: string | null;
  color?: string;
}): Promise<FeatureBlockDTO> {
  return apiFetch("/api/feature-blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateFeatureBlock(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    color?: string | null;
    orderKey?: number;
  },
): Promise<FeatureBlockDTO> {
  return apiFetch(`/api/feature-blocks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteFeatureBlock(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/feature-blocks/${id}`, { method: "DELETE" });
}

export function getTimelineShare(slug: string): Promise<TimelineShareDTO> {
  return apiFetch(`/api/clients/${encodeURIComponent(slug)}/timeline-share`);
}

export function setTimelineShare(slug: string, enabled: boolean): Promise<TimelineShareDTO> {
  return apiFetch(`/api/clients/${encodeURIComponent(slug)}/timeline-share`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

// ─── Milestones ────────────────────────────────────────────────────────────

export function listMilestones(clientId: string): Promise<MilestoneDTO[]> {
  return apiFetch(`/api/milestones?clientId=${encodeURIComponent(clientId)}`);
}

export function createMilestone(input: {
  clientId: string;
  name: string;
  date: string;
  description?: string;
  color?: string;
}): Promise<MilestoneDTO> {
  return apiFetch("/api/milestones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateMilestone(
  id: string,
  input: { name?: string; date?: string; description?: string | null; color?: string | null },
): Promise<MilestoneDTO> {
  return apiFetch(`/api/milestones/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteMilestone(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/milestones/${id}`, { method: "DELETE" });
}

// ── Per-client design system (brand tokens) ──────────────────────────────────

export interface DesignSystemClient {
  slug: string;
  name: string;
  logoUrl: string | null;
  primary: string | null;
}

/** Only clients that HAVE a design system — for the Studio brand picker. */
export async function listDesignSystemClients(): Promise<{ clients: DesignSystemClient[] }> {
  return apiFetch<{ clients: DesignSystemClient[] }>(`/api/design-systems`);
}

export async function getClientDesignSystem(slug: string): Promise<DesignSystemDTO> {
  return apiFetch<DesignSystemDTO>(`/api/clients/${slug}/design-system`);
}

export async function saveClientDesignSystem(
  slug: string,
  input: { tokens: DesignTokens; status?: DesignSystemStatus },
): Promise<DesignSystemDTO> {
  return apiFetch<DesignSystemDTO>(`/api/clients/${slug}/design-system`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function setClientDesignSystemShare(
  slug: string,
  enabled: boolean,
): Promise<DesignSystemShareInfo> {
  return apiFetch<DesignSystemShareInfo>(`/api/clients/${slug}/design-system/share`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export async function setClientDesignSystemEnabled(
  slug: string,
  enabled: boolean,
): Promise<DesignSystemDTO> {
  return apiFetch<DesignSystemDTO>(`/api/clients/${slug}/design-system/enabled`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export async function setClientDesignSystemFoundryBranding(
  slug: string,
  enabled: boolean,
): Promise<DesignSystemDTO> {
  return apiFetch<DesignSystemDTO>(`/api/clients/${slug}/design-system/foundry-branding`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export async function setClientDesignSystemGuidelinesEnabled(
  slug: string,
  enabled: boolean,
): Promise<DesignSystemDTO> {
  return apiFetch<DesignSystemDTO>(`/api/clients/${slug}/design-system/guidelines-enabled`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

// ─── Client Wiki ──────────────────────────────────────────────────────────────

import type { WikiDTO, WikiPageRecord, ChangelogEntryRecord, CourseRequestRecord, WikiIntakeItemRecord, WikiBlockerRecord, WikiUserSummary } from "@/server/wiki";
export type { WikiDTO, WikiPageRecord, ChangelogEntryRecord, CourseRequestRecord, WikiIntakeItemRecord, WikiBlockerRecord, WikiUserSummary };
import type {
  WikiCodeHandoverSection,
  WikiCodeModuleRecord,
  WikiCodeVersionRecord,
  WikiCodeFileRecord,
  CodeFileInput,
} from "@/server/wiki-code";
export type { WikiCodeHandoverSection, WikiCodeModuleRecord, WikiCodeVersionRecord, WikiCodeFileRecord, CodeFileInput };

// ─── Wiki code handover ─────────────────────────────────────────────────────
export async function setWikiCodeEnabledApi(slug: string, enabled: boolean): Promise<{ enabled: boolean }> {
  return apiFetch(`/api/clients/${slug}/wiki/code`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export async function createWikiCodeModuleApi(
  slug: string,
  input: { name: string; description?: string | null },
): Promise<WikiCodeModuleRecord> {
  return apiFetch(`/api/clients/${slug}/wiki/code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateWikiCodeModuleApi(
  slug: string,
  moduleId: string,
  input: { name?: string; description?: string | null },
): Promise<WikiCodeModuleRecord> {
  return apiFetch(`/api/clients/${slug}/wiki/code/${moduleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteWikiCodeModuleApi(slug: string, moduleId: string): Promise<{ deleted: boolean }> {
  return apiFetch(`/api/clients/${slug}/wiki/code/${moduleId}`, { method: "DELETE" });
}

export async function createWikiCodeVersionApi(
  slug: string,
  moduleId: string,
  input: { label: string; notes?: string | null; files: CodeFileInput[]; makeCurrent?: boolean },
): Promise<WikiCodeVersionRecord> {
  return apiFetch(`/api/clients/${slug}/wiki/code/${moduleId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateWikiCodeVersionApi(
  slug: string,
  versionId: string,
  input: { label?: string; notes?: string | null; files?: CodeFileInput[]; makeCurrent?: boolean },
): Promise<WikiCodeVersionRecord> {
  return apiFetch(`/api/clients/${slug}/wiki/code/versions/${versionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteWikiCodeVersionApi(slug: string, versionId: string): Promise<{ deleted: boolean }> {
  return apiFetch(`/api/clients/${slug}/wiki/code/versions/${versionId}`, { method: "DELETE" });
}


export interface WikiIntakeItemPayload {
  type?: "BUG" | "FEEDBACK" | "TASK";
  title: string;
  description?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  requestedBy?: string | null;
  externalRef?: string | null;
}

export async function createWikiIntakeItem(
  slug: string,
  input: WikiIntakeItemPayload,
): Promise<WikiIntakeItemRecord> {
  return apiFetch<WikiIntakeItemRecord>(`/api/clients/${slug}/wiki/intake-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function createPublicWikiIntakeItem(
  token: string,
  input: WikiIntakeItemPayload,
): Promise<WikiIntakeItemRecord> {
  return apiFetch<WikiIntakeItemRecord>(`/api/wiki/${token}/intake-items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Public: client replies to a blocked-task "Action needed" item from their wiki. */
export async function respondToWikiBlocker(
  token: string,
  taskId: string,
  response: string | null,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/wiki/${token}/blockers/${taskId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response }),
  });
}

export async function updateWikiIntakeItemApi(
  slug: string,
  id: string,
  input: Partial<WikiIntakeItemPayload> & { status?: "NEW" | "TRIAGED" | "PROMOTED" | "CLOSED" },
): Promise<WikiIntakeItemRecord> {
  return apiFetch<WikiIntakeItemRecord>(`/api/clients/${slug}/wiki/intake-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteWikiIntakeItemApi(slug: string, id: string): Promise<void> {
  await apiFetch(`/api/clients/${slug}/wiki/intake-items/${id}`, { method: "DELETE" });
}

export async function promoteWikiIntakeItemApi(
  slug: string,
  id: string,
  input: { assigneeIds?: string[] } = {},
): Promise<{ item: WikiIntakeItemRecord; taskId: string }> {
  return apiFetch<{ item: WikiIntakeItemRecord; taskId: string }>(
    `/api/clients/${slug}/wiki/intake-items/${id}/promote`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

async function postImageFile<T>(url: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(url, { method: "POST", body: form });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : `Upload failed: ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

export function uploadWikiIntakeItemImage(
  slug: string,
  id: string,
  file: File,
): Promise<WikiIntakeItemRecord> {
  return postImageFile(`/api/clients/${slug}/wiki/intake-items/${id}/image`, file);
}

export function uploadPublicWikiIntakeItemImage(
  token: string,
  id: string,
  file: File,
): Promise<WikiIntakeItemRecord> {
  return postImageFile(`/api/wiki/${token}/intake-items/${id}/image`, file);
}

export async function getClientWiki(slug: string): Promise<WikiDTO> {
  return apiFetch<WikiDTO>(`/api/clients/${slug}/wiki`);
}

export async function upsertWikiPage(
  slug: string,
  payload: { type: string; title: string; content?: unknown },
): Promise<WikiPageRecord> {
  return apiFetch<WikiPageRecord>(`/api/clients/${slug}/wiki/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteWikiPage(
  slug: string,
  payload: { type: string },
): Promise<{ deleted: boolean; hiddenSections: string[] }> {
  return apiFetch<{ deleted: boolean; hiddenSections: string[] }>(`/api/clients/${slug}/wiki/pages`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function setWikiShareApi(
  slug: string,
  enabled: boolean,
): Promise<{ shareToken: string | null; shareEnabled: boolean }> {
  return apiFetch<{ shareToken: string | null; shareEnabled: boolean }>(
    `/api/clients/${slug}/wiki/share`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
  );
}

export async function setWikiSectionShareApi(
  slug: string,
  section: string,
  enabled: boolean,
): Promise<Record<string, string>> {
  return apiFetch<Record<string, string>>(`/api/clients/${slug}/wiki/share`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, section }),
  });
}

export async function addWikiChangelogEntry(
  slug: string,
  payload: {
    platform: string;
    version: string;
    title: string;
    body?: string;
    releasedAt?: string;
  },
): Promise<ChangelogEntryRecord> {
  return apiFetch<ChangelogEntryRecord>(`/api/clients/${slug}/wiki/changelog`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteWikiChangelogEntry(slug: string, id: string): Promise<void> {
  await apiFetch(`/api/clients/${slug}/wiki/changelog/${id}`, { method: "DELETE" });
}

export async function updateWikiEntryStatusApi(
  slug: string,
  id: string,
  status: string,
): Promise<ChangelogEntryRecord> {
  return apiFetch<ChangelogEntryRecord>(`/api/clients/${slug}/wiki/changelog/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function updateWikiChangelogEntryApi(
  slug: string,
  id: string,
  data: { version?: string; title?: string; body?: string | null; releasedAt?: string | null; status?: string },
): Promise<ChangelogEntryRecord> {
  return apiFetch<ChangelogEntryRecord>(`/api/clients/${slug}/wiki/changelog/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function updateWikiPlatformsApi(slug: string, platforms: string[]): Promise<WikiDTO> {
  return apiFetch<WikiDTO>(`/api/clients/${slug}/wiki`, {
    method: "PATCH",
    body: JSON.stringify({ platforms }),
  });
}

// ─── Wiki monitors (uptime) ─────────────────────────────────────────────────
import type { WikiMonitorDTO, MonitorInput } from "@/server/wiki-monitors";
export type { WikiMonitorDTO, WikiMonitorsSection, MonitorInput } from "@/server/wiki-monitors";

export async function createWikiMonitorApi(slug: string, input: MonitorInput): Promise<WikiMonitorDTO> {
  return apiFetch<WikiMonitorDTO>(`/api/clients/${slug}/wiki/monitors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateWikiMonitorApi(
  slug: string,
  id: string,
  input: Partial<MonitorInput>,
): Promise<WikiMonitorDTO> {
  return apiFetch<WikiMonitorDTO>(`/api/clients/${slug}/wiki/monitors/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteWikiMonitorApi(slug: string, id: string): Promise<void> {
  await apiFetch(`/api/clients/${slug}/wiki/monitors/${id}`, { method: "DELETE" });
}

export async function runWikiMonitorApi(slug: string, id: string): Promise<WikiMonitorDTO> {
  return apiFetch<WikiMonitorDTO>(`/api/clients/${slug}/wiki/monitors/${id}/run`, { method: "POST" });
}

export async function setWikiMonitorsEnabledApi(slug: string, enabled: boolean): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>(`/api/clients/${slug}/wiki/monitors`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export async function setWikiIntakeEnabledApi(slug: string, enabled: boolean): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>(`/api/clients/${slug}/wiki/intake-items`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

// ─── Wiki documents ─────────────────────────────────────────────────────────
import type { WikiDocumentDTO } from "@/server/wiki-documents";
export type { WikiDocumentDTO, WikiDocumentsSection } from "@/server/wiki-documents";

export async function createWikiLinkDocApi(
  slug: string,
  input: { title: string; url: string },
): Promise<WikiDocumentDTO> {
  return apiFetch<WikiDocumentDTO>(`/api/clients/${slug}/wiki/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function uploadWikiFileDocApi(slug: string, form: FormData): Promise<WikiDocumentDTO> {
  // No Content-Type header — the browser sets the multipart boundary.
  return apiFetch<WikiDocumentDTO>(`/api/clients/${slug}/wiki/documents`, {
    method: "POST",
    body: form,
  });
}

export async function updateWikiDocApi(
  slug: string,
  id: string,
  input: { title?: string; url?: string },
): Promise<WikiDocumentDTO> {
  return apiFetch<WikiDocumentDTO>(`/api/clients/${slug}/wiki/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteWikiDocApi(slug: string, id: string): Promise<void> {
  await apiFetch(`/api/clients/${slug}/wiki/documents/${id}`, { method: "DELETE" });
}

export async function setWikiDocumentsEnabledApi(
  slug: string,
  enabled: boolean,
): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>(`/api/clients/${slug}/wiki/documents`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export async function getPublicWikiApi(token: string): Promise<WikiDTO> {
  return apiFetch<WikiDTO>(`/api/wiki/${token}`);
}

// ─── Client wiki users (public-link login accounts) ─────────────────────────
export async function createWikiUserApi(
  slug: string,
  body: { email: string; password: string; name?: string },
): Promise<WikiUserSummary> {
  return apiFetch<WikiUserSummary>(`/api/clients/${slug}/wiki/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateWikiUserApi(
  slug: string,
  userId: string,
  body: { email?: string; password?: string; name?: string },
): Promise<WikiUserSummary> {
  return apiFetch<WikiUserSummary>(`/api/clients/${slug}/wiki/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteWikiUserApi(slug: string, userId: string): Promise<void> {
  await apiFetch(`/api/clients/${slug}/wiki/users/${userId}`, { method: "DELETE" });
}

// ─── Golf Data Console (Wedge wiki) ─────────────────────────────────────────

import type { GolfDataConsole } from "@/server/golf-data-console";
export type { GolfDataConsole } from "@/server/golf-data-console";
import type { CourseBackendData, CourseIntegrationsData, RunJobResult } from "@/server/bigwedge-course-api";
export type { CourseBackendData, CourseIntegrationsData, CourseIntegration, RunJobResult } from "@/server/bigwedge-course-api";
import type { GolfClubDTO } from "@/server/golf-clubs";
export type { GolfClubDTO } from "@/server/golf-clubs";

const gdUrl = (slug: string, sub = "", refresh = false) =>
  `/api/clients/${slug}/wiki/golf-data${sub}${refresh ? "?refresh=1" : ""}`;

export async function getGolfDataConsole(slug: string, refresh = false): Promise<GolfDataConsole> {
  return apiFetch<GolfDataConsole>(gdUrl(slug, "", refresh));
}

export async function getGolfCourseBackend(slug: string, refresh = false): Promise<CourseBackendData> {
  return apiFetch<CourseBackendData>(gdUrl(slug, "/course-backend", refresh));
}

export async function getGolfIntegrations(slug: string, refresh = false): Promise<CourseIntegrationsData> {
  return apiFetch<CourseIntegrationsData>(gdUrl(slug, "/integrations", refresh));
}

export async function runGolfJob(slug: string, job: string, batch?: number): Promise<RunJobResult> {
  return apiFetch<RunJobResult>(`/api/clients/${slug}/wiki/golf-data/run-job`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ job, ...(batch ? { batch } : {}) }),
  });
}

export async function getGolfClubsList(slug: string): Promise<{ clubs: GolfClubDTO[]; total: number }> {
  return apiFetch<{ clubs: GolfClubDTO[]; total: number }>(`/api/clients/${slug}/wiki/golf-data/clubs`);
}

import type { UserDataSnapshot } from "@/server/bigwedge-user-data";
export type { UserDataSnapshot } from "@/server/bigwedge-user-data";

export async function getGolfUserData(slug: string, refresh = false): Promise<UserDataSnapshot> {
  return apiFetch<UserDataSnapshot>(gdUrl(slug, "/user-data", refresh));
}

// ─── Course requests (Wedge wiki) ───────────────────────────────────────────

export interface CourseFeedbackCandidate {
  conversationId: string;
  username: string;
  subject: string;
  preview: string;
  receivedAt: string;
  alreadyImported: boolean;
}

export async function addWikiCourseRequest(
  slug: string,
  payload: { courseName: string; country?: string | null; notes?: string | null; status?: string },
): Promise<CourseRequestRecord> {
  return apiFetch<CourseRequestRecord>(`/api/clients/${slug}/wiki/course-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateWikiCourseRequestApi(
  slug: string,
  id: string,
  data: { courseName?: string; country?: string | null; notes?: string | null; status?: string },
): Promise<CourseRequestRecord> {
  return apiFetch<CourseRequestRecord>(`/api/clients/${slug}/wiki/course-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteWikiCourseRequest(slug: string, id: string): Promise<void> {
  await apiFetch(`/api/clients/${slug}/wiki/course-requests/${id}`, { method: "DELETE" });
}

export async function listWikiCourseFeedback(
  slug: string,
): Promise<{ candidates: CourseFeedbackCandidate[] }> {
  return apiFetch<{ candidates: CourseFeedbackCandidate[] }>(
    `/api/clients/${slug}/wiki/course-requests/feedback`,
  );
}

export interface CourseImportInput {
  conversationIds?: string[];
  keywords?: string[];
  /** Run AI to pre-fill course name + country. Default true server-side. */
  aiExtract?: boolean;
  /** Skip feedback AI judges not to be a course request. */
  onlyCourseRequests?: boolean;
}

export async function importWikiCourseFeedback(
  slug: string,
  input: CourseImportInput,
): Promise<{ created: CourseRequestRecord[]; count: number; skipped: number; scanned: number; aiUsed: boolean }> {
  return apiFetch<{ created: CourseRequestRecord[]; count: number; skipped: number; scanned: number; aiUsed: boolean }>(
    `/api/clients/${slug}/wiki/course-requests/import`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function getWikiCourseIngest(slug: string): Promise<{ token: string | null }> {
  return apiFetch<{ token: string | null }>(
    `/api/clients/${slug}/wiki/course-requests/ingest-token`,
  );
}

export interface BigWedgeSyncResult {
  baseUrl: string;
  totalFetched: number;
  actionTakenCount: number;
  toMarkCount: number;
  markedCount: number;
  sample: Array<{ courseName: string; country: string | null }>;
  dryRun: boolean;
  errors: string[];
}

export async function syncBigWedgeStatusApi(
  dryRun: boolean,
): Promise<BigWedgeSyncResult> {
  return apiFetch<BigWedgeSyncResult>("/api/dev/sync-bigwedge-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dryRun, clientSlug: "wedge" }),
  });
}

export async function setWikiCourseIngest(
  slug: string,
  input: { enabled: boolean; rotate?: boolean },
): Promise<{ token: string | null }> {
  return apiFetch<{ token: string | null }>(
    `/api/clients/${slug}/wiki/course-requests/ingest-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

// ─── Notifications (in-app feed) ────────────────────────────────────────────

export async function listNotifications(params?: {
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationDTO[]> {
  const query = new URLSearchParams();
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.unreadOnly) query.set("unreadOnly", "true");
  const qs = query.toString();
  return apiFetch<NotificationDTO[]>(`/api/notifications${qs ? `?${qs}` : ""}`);
}

export async function getUnreadNotificationCount(): Promise<{ unread: number }> {
  return apiFetch<{ unread: number }>("/api/notifications/unread-count");
}

export async function markNotificationsRead(
  input: { ids: string[] } | { all: true },
): Promise<{ updated: number; unread: number }> {
  return apiFetch<{ updated: number; unread: number }>("/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// ─── DevSignal (developer vetting engine) ────────────────────────────────────

const jsonPost = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function listDevSignalAssessments(filters: { status?: string; decision?: string } = {}) {
  const qs = new URLSearchParams();
  if (filters.status) qs.set("status", filters.status);
  if (filters.decision) qs.set("decision", filters.decision);
  const s = qs.toString();
  return apiFetch<{ items: DevSignalAssessmentDTO[] }>(`/api/devsignal/assessments${s ? `?${s}` : ""}`);
}

export async function getDevSignalAssessment(id: string) {
  return apiFetch<{ assessment: DevSignalAssessmentDTO }>(`/api/devsignal/assessments/${id}`);
}

export async function createDevSignalAssessment(input: {
  candidateId?: string;
  candidate?: { name: string; githubHandle: string; email?: string; primaryStack?: string };
  clientId?: string;
}) {
  return apiFetch<{ assessment: DevSignalAssessmentDTO }>("/api/devsignal/assessments", jsonPost(input));
}

export async function runDevSignalAssessment(id: string) {
  return apiFetch<{ assessment: DevSignalAssessmentDTO }>(`/api/devsignal/assessments/${id}/run`, jsonPost({}));
}

export async function recordDevSignalDecision(
  id: string,
  input: { decision: "APPROVED_FOR_STAGING" | "REJECTED" | "NEEDS_MORE_INFO" | "NONE"; reason?: string },
) {
  return apiFetch<{ assessment: DevSignalAssessmentDTO }>(`/api/devsignal/assessments/${id}/decision`, jsonPost(input));
}

export async function recordDevSignalInterview(
  id: string,
  input: {
    dimensions: Array<{ key: string; label: string; score: number }>;
    verdict: "PASS" | "WARN" | "FAIL" | "NEEDS_SECOND_REVIEW";
    notes?: string;
  },
) {
  return apiFetch<{ assessment: DevSignalAssessmentDTO }>(`/api/devsignal/assessments/${id}/interview`, jsonPost(input));
}

export async function promoteDevSignalToCode(id: string, input: { reason?: string } = {}) {
  return apiFetch<{ assessment: DevSignalAssessmentDTO }>(
    `/api/devsignal/assessments/${id}/promote-to-code`,
    jsonPost(input),
  );
}

export async function listDevSignalConfigs() {
  return apiFetch<{ items: DevSignalPipelineConfigDTO[] }>("/api/devsignal/pipeline-configs");
}

export async function getDevSignalAnalytics() {
  return apiFetch<{ analytics: DevSignalAnalyticsDTO }>("/api/devsignal/analytics/assessments");
}

export async function createDevSignalOutcomeLink(input: {
  assessmentId: string;
  placementId?: string;
  source?: string;
  notes?: string;
  retained?: boolean;
  tenureDays?: number;
  clientRating?: number;
  churned?: boolean;
}) {
  return apiFetch<{ link: { id: string } }>("/api/devsignal/outcome-links", jsonPost(input));
}

export async function getDevSignalCalibration() {
  return apiFetch<{ report: CalibrationReport }>("/api/devsignal/calibration");
}

export async function getDevSignalNotice() {
  return apiFetch<{ notice: { version: string; content: NoticeContent } }>("/api/devsignal/notice");
}

export async function updateDevSignalNotice(content: NoticeContent) {
  return apiFetch<{ notice: { version: string; content: NoticeContent } }>("/api/devsignal/notice", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(content),
  });
}

export async function seedDevSignalDemo() {
  return apiFetch<{ created: number; skipped: number }>("/api/dev/seed-devsignal-demo", { method: "POST" });
}

export async function clearDevSignalDemo() {
  return apiFetch<{ removed: number }>("/api/dev/seed-devsignal-demo", { method: "DELETE" });
}

export async function createDevSignalPipelineConfig(input: {
  name: string;
  version: string;
  isDefault?: boolean;
  enabledStages: string[];
  stageOrder: string[];
  stageWeights: Record<string, number>;
  blockingRules?: Record<string, boolean>;
}) {
  return apiFetch<{ config: DevSignalPipelineConfigDTO }>("/api/devsignal/pipeline-configs", jsonPost(input));
}

// ─── DevSignal challenge bank ────────────────────────────────────────────────

export async function listDevSignalChallenges() {
  return apiFetch<{ items: DevSignalChallengeDTO[] }>("/api/devsignal/challenges");
}

export type DevSignalChallengeInput = {
  slug: string;
  title: string;
  language: "javascript" | "typescript";
  difficulty: "junior" | "mid" | "senior" | "staff";
  roles: string[];
  stacks: string[];
  competencies: string[];
  promptMarkdown: string;
  functionName: string;
  starterCode: string;
  timeLimitSec: number;
  tests: Array<{ name: string; args: unknown[]; expected: unknown; hidden?: boolean }>;
  isActive: boolean;
};

export async function createDevSignalChallenge(input: DevSignalChallengeInput) {
  return apiFetch<{ challenge: DevSignalChallengeDTO }>("/api/devsignal/challenges", jsonPost(input));
}

export async function updateDevSignalChallenge(
  slug: string,
  input: Partial<Omit<DevSignalChallengeInput, "slug">>,
) {
  return apiFetch<{ challenge: DevSignalChallengeDTO }>(`/api/devsignal/challenges/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateDevSignalDataRequest(
  id: string,
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED",
) {
  return apiFetch<{ ok: boolean }>(`/api/devsignal/data-requests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

// ── Costing & Quote (Super-Admin) ────────────────────────────────────────────
export function getCostingConfig() {
  return apiFetch<CostingConfigResponse>("/api/costing/config");
}

export function previewCosting(payload: PackageCostingInput) {
  return apiFetch<PackageCostingResult>("/api/costing/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
