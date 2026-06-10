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
  ClientDetailRecord,
  ClientListItem,
  ClientPlatformRecord,
  WorkspaceClientStatus,
} from "@/types/client";
import type {
  OnboardingFormRecord,
  OnboardingFormStructure,
  OnboardingFormSummary,
} from "@/types/onboarding";
import type { PulseScanRecord, PulseScanListItem, BrowserAgentInsights, DiscoveryKit } from "@/types/pulse";
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
  ProofCreateDocumentInput,
  ProofDocumentRecord,
  ProofDocumentUpdateInput,
  ProofHealthResponse,
} from "@/lib/proof";
import type {
  CostingSectionData,
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

export interface ProposalListResponse {
  proposals: ProposalListItem[];
}

export interface ClientListResponse {
  clients: ClientListItem[];
}

export interface CodeClearRunsResponse {
  runs: GitHubAnalysisRunRecord[];
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
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
}): Promise<ProposalListResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.sort) query.set("sort", params.sort);
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
  documentType?: "PROPOSAL" | "SLA" | "SOW" | "MSA" | "NDA" | "CO" | "DSA" | "OTHER";
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

export async function fetchTemplates(): Promise<{ templates: TemplateSummary[] }> {
  return apiFetch<{ templates: TemplateSummary[] }>("/api/templates");
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
): Promise<{ client: ClientListItem }> {
  return apiFetch<{ client: ClientListItem }>(`/api/clients/${slug}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
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
  input: { name: string; logoUrl?: string },
): Promise<{ client: ClientListItem }> {
  return apiFetch<{ client: ClientListItem }>("/api/clients", {
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
  },
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

export async function createClientPlatform(
  slug: string,
  input: {
    name: string;
    platformType?: string;
    url?: string;
    stagingUrl?: string;
    repoUrl?: string;
    credentials?: string;
    notes?: string;
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
    credentials?: string;
    notes?: string;
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

export interface FixAgentResult {
  proposedFixes: Array<{ checkKey: string; filePath: string; newContent: string; explanation: string }>;
  prUrl: string | null;
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
}): Promise<{ monitor: MonitorRecord }> {
  return apiFetch<{ monitor: MonitorRecord }>("/api/pulse/monitors", {
    method: "POST",
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

export async function listSupportConversations(
  clientId: string,
): Promise<{ conversations: Conversation[] }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations`);
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

export async function listSupportTickets(clientId: string): Promise<{ tickets: Ticket[] }> {
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

export async function getGmailMessages(): Promise<{ connected: boolean; messages: GmailMessage[] }> {
  return apiFetch("/api/integrations/gmail");
}

export async function getCalendarEvents(): Promise<{ connected: boolean; events: CalendarEvent[] }> {
  return apiFetch("/api/integrations/calendar");
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
  text: string;
  owner: string | null;
  done: boolean;
}

export interface ScribeMeeting {
  id: string;
  clientId: string | null;
  calendarEventId: string | null;
  meetingCode: string | null;
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

export async function getClientMeetings(slug: string, q?: string): Promise<ClientMeetingsResponse> {
  const qs = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
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


// ─── Backstage (internal ops) ──────────────────────────────────────────────

import type {
  BackstageMember,
  CalendarConnectionMember,
  CalendarMonth,
  ExpenseDTO,
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

// ─── Tasks (Portal task tracker + standups) ────────────────────────────────
import type {
  TaskDTO,
  TaskDetailDTO,
  TaskCommentDTO,
  TaskStatus,
  TaskPriority,
  ClientTaskSummary,
  TaskAttentionDTO,
  MyDayDTO,
  DailyUpdateDTO,
  RollupRosterDTO,
  ClientAssignmentDTO,
  FeatureBlockDTO,
  TimelineShareDTO,
  MilestoneDTO,
} from "@/types/tasks";

export function listTasks(opts: {
  clientId?: string;
  status?: TaskStatus;
  assigneeId?: string;
} = {}): Promise<TaskDTO[]> {
  const q = new URLSearchParams();
  if (opts.clientId) q.set("clientId", opts.clientId);
  if (opts.status) q.set("status", opts.status);
  if (opts.assigneeId) q.set("assigneeId", opts.assigneeId);
  const qs = q.toString();
  return apiFetch(`/api/tasks${qs ? `?${qs}` : ""}`);
}

export function getTask(id: string): Promise<TaskDetailDTO> {
  return apiFetch(`/api/tasks/${id}`);
}

export function createTask(input: {
  clientId: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeIds?: string[];
  featureBlockId?: string | null;
  parentId?: string | null;
  dueDate?: string | null;
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
    assigneeIds?: string[];
    featureBlockId?: string | null;
    dueDate?: string | null;
  },
): Promise<TaskDTO> {
  return apiFetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
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

export function getTaskAttention(): Promise<TaskAttentionDTO> {
  return apiFetch("/api/tasks/attention");
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

export function getRollupRoster(): Promise<RollupRosterDTO> {
  return apiFetch("/api/tasks/rollup");
}

export function publishRollup(
  override = false,
): Promise<{ ok: boolean; channel: string | null; clientCount: number; taskCount: number }> {
  return apiFetch(`/api/tasks/rollup${override ? "?override=true" : ""}`, { method: "POST" });
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

// ─── Client Wiki ──────────────────────────────────────────────────────────────

import type { WikiDTO, WikiPageRecord, ChangelogEntryRecord, CourseRequestRecord } from "@/server/wiki";
export type { WikiDTO, WikiPageRecord, ChangelogEntryRecord, CourseRequestRecord };

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

export async function getPublicWikiApi(token: string): Promise<WikiDTO> {
  return apiFetch<WikiDTO>(`/api/wiki/${token}`);
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

export async function importWikiCourseFeedback(
  slug: string,
  conversationIds: string[],
): Promise<{ created: CourseRequestRecord[]; count: number }> {
  return apiFetch<{ created: CourseRequestRecord[]; count: number }>(
    `/api/clients/${slug}/wiki/course-requests/import`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationIds }),
    },
  );
}

