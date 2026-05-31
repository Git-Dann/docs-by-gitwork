import type {
  AuditLog,
  Connection,
  Conversation,
  DraftAction,
  Message,
  SupportClient,
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
import type {
  RateBillingPeriod,
  RateCardPeopleResponse,
  RateCardPersonRecord,
} from "@/types/rate-card";

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
  documentType?: "PROPOSAL" | "SLA" | "SOW" | "MSA" | "NDA" | "CO" | "OTHER";
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
  input: { label?: string } = {},
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

export interface DemoCleanupPreviewResponse {
  candidates: Array<{ id: string; name: string; githubHandle: string }>;
  ratePeople: Array<{ id: string; name: string; seedIdentifier: string | null }>;
  total: number;
}

export interface DemoCleanupApplyResponse {
  deletedCandidates: number;
  deletedRatePeople: number;
  candidates: Array<{ id: string; name: string; githubHandle: string }>;
  ratePeople: Array<{ id: string; name: string; seedIdentifier: string | null }>;
}

export async function previewDemoCleanup(): Promise<DemoCleanupPreviewResponse> {
  return apiFetch<DemoCleanupPreviewResponse>("/api/codeclear/admin/cleanup-demo");
}

export async function applyDemoCleanup(): Promise<DemoCleanupApplyResponse> {
  return apiFetch<DemoCleanupApplyResponse>("/api/codeclear/admin/cleanup-demo", {
    method: "POST",
  });
}

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

export async function listSupportConversations(
  clientId: string,
): Promise<{ conversations: Conversation[] }> {
  return apiFetch(`/api/support/clients/${clientId}/conversations`);
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
  role: "ADMIN" | "STAFF";
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
  role: "ADMIN" | "STAFF";
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
  data: { name?: string; role?: "ADMIN" | "STAFF"; permissions?: string[] },
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

