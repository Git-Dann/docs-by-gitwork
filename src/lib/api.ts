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
import {
  archivePocProposal,
  createPocProofDocument,
  createPocProposal,
  deletePocProposal,
  duplicatePocProposal,
  getPocProposal,
  listPocProofDocuments,
  listPocProposals,
  listPocTemplates,
  requestPocExport,
  savePocCosting,
  savePocEngagement,
  savePocTimeline,
  updatePocProofDocument,
  updatePocProposal,
} from "@/lib/poc-store";

export interface ProposalListResponse {
  proposals: ProposalListItem[];
}

export async function listProposals(params: {
  search?: string;
  status?: string;
  sort?: string;
}) {
  return listPocProposals(params);
}

export async function createProposal(input: {
  title: string;
  clientName?: string;
  productName?: string;
  templateId?: string;
}) {
  return createPocProposal(input);
}

export async function getProposal(id: string) {
  const proposal = getPocProposal(id);
  if (!proposal) {
    throw new Error("Proposal not found.");
  }

  return { proposal };
}

export async function updateProposal(id: string, input: Partial<ProposalDocument>) {
  return updatePocProposal(id, input);
}

export async function duplicateProposal(id: string) {
  return duplicatePocProposal(id);
}

export async function archiveProposal(id: string) {
  return archivePocProposal(id);
}

export async function deleteProposal(id: string) {
  return deletePocProposal(id);
}

export async function fetchTemplates() {
  return listPocTemplates();
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
  return savePocCosting(id, input);
}

export async function saveTimeline(
  id: string,
  input: {
    timelinePhases: ProposalDocument["timelinePhases"];
    viewMode?: "LIST" | "MILESTONE";
  },
) {
  return savePocTimeline(id, input);
}

export async function saveEngagement(
  id: string,
  input: {
    ctas: ProposalDocument["ctas"];
    links: ProposalDocument["links"];
  },
) {
  return savePocEngagement(id, input);
}

export async function requestExport(
  id: string,
  input: {
    format: "PRINT" | "PDF" | "SHARE_LINK";
    settings?: Record<string, unknown>;
  },
) {
  return requestPocExport(id, input);
}

export async function getProofHealth(): Promise<ProofHealthResponse> {
  throw new Error("Proof service is disabled in POC mode.");
}

export async function listProofDocuments(params?: { proposalId?: string | null }) {
  return listPocProofDocuments(params);
}

export async function createProofDocument(input: ProofCreateDocumentInput) {
  return createPocProofDocument(input);
}

export async function updateProofDocument(id: string, input: ProofDocumentUpdateInput) {
  return updatePocProofDocument(id, input);
}
