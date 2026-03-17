import type {
  CostingSectionData,
  ProposalDocument,
  ProposalListItem,
  TemplateSummary,
} from "@/types/proposal";
import type {
  ProofCreateDocumentInput,
  ProofDocumentRecord,
  ProofDocumentUpdateInput,
  ProofHealthResponse,
} from "@/lib/proof";

interface ApiErrorPayload {
  error: string;
  details?: unknown;
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as T | ApiErrorPayload;
  if (!response.ok) {
    const message = (payload as ApiErrorPayload).error ?? "Request failed";
    throw new Error(message);
  }

  return payload as T;
}

export interface ProposalListResponse {
  proposals: ProposalListItem[];
}

export async function listProposals(params: {
  search?: string;
  status?: string;
  sort?: string;
}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.sort) query.set("sort", params.sort);

  return request<ProposalListResponse>(`/api/proposals?${query.toString()}`);
}

export async function createProposal(input: {
  title: string;
  clientName?: string;
  productName?: string;
  templateId?: string;
}) {
  return request<{ proposal: ProposalDocument }>("/api/proposals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getProposal(id: string) {
  return request<{ proposal: ProposalDocument }>(`/api/proposals/${id}`);
}

export async function updateProposal(id: string, input: Partial<ProposalDocument>) {
  return request<{ proposal: ProposalDocument }>(`/api/proposals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function duplicateProposal(id: string) {
  return request<{ proposal: ProposalDocument }>(`/api/proposals/${id}/duplicate`, {
    method: "POST",
  });
}

export async function archiveProposal(id: string) {
  return request<{ proposal: { id: string; status: string } }>(
    `/api/proposals/${id}/archive`,
    {
      method: "POST",
    },
  );
}

export async function deleteProposal(id: string) {
  return request<{ ok: true }>(`/api/proposals/${id}/delete`, {
    method: "DELETE",
  });
}

export async function fetchTemplates() {
  return request<{ templates: TemplateSummary[] }>("/api/templates");
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
  },
) {
  return request<{ proposal: ProposalDocument }>(`/api/proposals/${id}/costing`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function saveTimeline(
  id: string,
  input: {
    timelinePhases: ProposalDocument["timelinePhases"];
    viewMode?: "LIST" | "MILESTONE";
  },
) {
  return request<{ proposal: ProposalDocument }>(`/api/proposals/${id}/timeline`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function saveEngagement(
  id: string,
  input: {
    ctas: ProposalDocument["ctas"];
    links: ProposalDocument["links"];
  },
) {
  return request<{ proposal: ProposalDocument }>(`/api/proposals/${id}/engagement`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function requestExport(
  id: string,
  input: {
    format: "PRINT" | "PDF" | "SHARE_LINK";
    settings?: Record<string, unknown>;
  },
) {
  return request<{
    export: {
      id: string;
      format: "PRINT" | "PDF" | "SHARE_LINK";
      status: "PENDING" | "READY" | "FAILED";
      url: string | null;
      requestedAt: string;
    };
  }>(`/api/proposals/${id}/export`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getProofHealth() {
  return request<ProofHealthResponse>("/api/proof/health");
}

export async function listProofDocuments(params?: { proposalId?: string | null }) {
  const query = new URLSearchParams();
  if (params?.proposalId) {
    query.set("proposalId", params.proposalId);
  }

  const suffix = query.size ? `?${query.toString()}` : "";
  return request<{ documents: ProofDocumentRecord[] }>(`/api/proof/documents${suffix}`);
}

export async function createProofDocument(input: ProofCreateDocumentInput) {
  return request<{ document: ProofDocumentRecord }>("/api/proof/documents", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProofDocument(id: string, input: ProofDocumentUpdateInput) {
  return request<{ document: ProofDocumentRecord }>(`/api/proof/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
