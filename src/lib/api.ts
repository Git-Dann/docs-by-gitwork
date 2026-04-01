import type { ClientDetailRecord, ClientListItem } from "@/types/client";
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

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
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
  productName?: string;
  templateId?: string;
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

export async function listClients(params?: { search?: string }): Promise<ClientListResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  const qs = query.toString();
  return apiFetch<ClientListResponse>(`/api/clients${qs ? `?${qs}` : ""}`);
}

export async function createClient(
  input: { name: string; logoUrl?: string },
): Promise<{ client: ClientListItem }> {
  void input;
  throw new Error(
    "Clients are suggested automatically from proposal names. Saved client records are not enabled yet.",
  );
}

export async function updateClient(
  slug: string,
  input: { logoUrl?: string },
): Promise<{ client: ClientListItem }> {
  void slug;
  void input;
  throw new Error(
    "Clients are suggested automatically from proposal names. Saved client records are not enabled yet.",
  );
}

export async function getClientDetail(slug: string): Promise<ClientDetailRecord> {
  return apiFetch<ClientDetailRecord>(`/api/clients/${slug}`);
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
