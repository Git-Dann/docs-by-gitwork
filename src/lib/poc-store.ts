import {
  DEFAULT_PROPOSAL_METADATA,
  EMPTY_PROPOSAL_METADATA,
  defaultAssets,
  defaultCostLineItems,
  defaultCtas,
  defaultLinks,
  defaultTimelinePhases,
  getDefaultProposalSections,
  getEmptyProposalSections,
} from "@/lib/default-template";
import type {
  CostingSectionData,
  CTAInput,
  ProposalDocument,
  ProposalListItem,
  ProposalSection,
  ProposalLinkInput,
  TemplateSummary,
  TimelinePhaseInput,
} from "@/types/proposal";
import type { ClientListItem, ClientRecord } from "@/types/client";
import type {
  ProofCreateDocumentInput,
  ProofDocumentRecord,
  ProofDocumentUpdateInput,
} from "@/lib/proof";

const STORAGE_KEY = "gitwork.poc.state.v1";

export const DEFAULT_TEMPLATE_ID = "tmpl_gitwork_proposal";
export const DEFAULT_WORKSPACE_ID = "wrk_gitwork";
export const DEFAULT_OWNER_ID = "usr_gitwork_owner";
export const DEFAULT_OWNER_NAME = "Gitwork Owner";
export const DEFAULT_PRIMARY_PROPOSAL_ID = "cmmmpv3ty000pul84ulax0fan";
export const DEFAULT_SECONDARY_PROPOSAL_ID = "cmmmptd5r0007ul7mpqdpymtd";

interface PocState {
  proposals: ProposalDocument[];
  templates: TemplateSummary[];
  proofDocuments: ProofDocumentRecord[];
  clients: ClientRecord[];
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function ensureClientInState(state: PocState, clientName?: string | null) {
  const name = clientName?.trim();
  if (!name) {
    return;
  }

  const existing = state.clients.find((client) => client.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.updatedAt = nowIso();
    if (!existing.slug) {
      existing.slug = slugify(name);
    }
    return;
  }

  const timestamp = nowIso();
  state.clients.push({
    id: createId("client"),
    name,
    slug: slugify(name),
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function getSeedClients(): ClientRecord[] {
  const state = getSeedProposals().reduce(
    (seedState, proposal) => {
      ensureClientInState(seedState, proposal.clientName);
      return seedState;
    },
    {
      proposals: [],
      templates: [],
      proofDocuments: [],
      clients: [],
    } as PocState,
  );

  return state.clients;
}

function createSections(proposalId: string, title: string, clientName: string, productName: string) {
  return deepClone(getDefaultProposalSections()).map((section, index) => {
    const nextSection: ProposalSection = {
      ...section,
      id: `${proposalId}_section_${section.key}_${index}`,
      sortOrder: index,
    };

    if (section.key === "cover") {
      nextSection.data = {
        ...(section.data as ProposalSection["data"] & {
          proposalTitle: string;
          clientName: string;
          productName: string;
        }),
        proposalTitle: title,
        clientName,
        productName,
      };
    }

    return nextSection;
  });
}

function createEmptySections(proposalId: string, title: string, clientName: string) {
  return deepClone(getEmptyProposalSections()).map((section, index) => {
    const nextSection: ProposalSection = {
      ...section,
      id: `${proposalId}_section_${section.key}_${index}`,
      sortOrder: index,
    };

    if (section.key === "cover") {
      nextSection.data = {
        ...(section.data as ProposalSection["data"] & {
          proposalTitle: string;
          clientName: string;
        }),
        proposalTitle: title,
        clientName,
      };
    }

    return nextSection;
  });
}

function withIndexedIds<T extends { id?: string; sortOrder: number }>(
  items: T[],
  proposalId: string,
  prefix: string,
) {
  return deepClone(items).map((item, index) => ({
    ...item,
    id: item.id ?? `${proposalId}_${prefix}_${index}`,
    sortOrder: index,
  }));
}

function createSeedProposal({
  id,
  title,
  clientName,
  productName,
  status,
  summary,
  version,
  updatedAt,
  approvalChecked,
}: {
  id: string;
  title: string;
  clientName: string;
  productName: string;
  status: ProposalDocument["status"];
  summary: string;
  version: string;
  updatedAt: string;
  approvalChecked: boolean;
}): ProposalDocument {
  const createdAt = updatedAt;

  return {
    id,
    workspaceId: DEFAULT_WORKSPACE_ID,
    ownerId: DEFAULT_OWNER_ID,
    templateId: DEFAULT_TEMPLATE_ID,
    documentType: "PROPOSAL",
    status,
    title,
    productName,
    clientName,
    summary,
    version,
    expiresAt: null,
    metadata: {
      ...DEFAULT_PROPOSAL_METADATA,
      client: clientName,
      owner: DEFAULT_OWNER_NAME,
      version,
      approvalChecked,
    },
    exportSettings: {},
    updatedAt,
    createdAt,
    sections: createSections(id, title, clientName, productName),
    costLineItems: withIndexedIds(defaultCostLineItems, id, "cost"),
    timelinePhases: withIndexedIds(defaultTimelinePhases, id, "phase"),
    assets: withIndexedIds(defaultAssets, id, "asset"),
    links: withIndexedIds(defaultLinks, id, "link"),
    ctas: withIndexedIds(defaultCtas, id, "cta"),
  };
}

function getSeedTemplates(): TemplateSummary[] {
  return [
    {
      id: DEFAULT_TEMPLATE_ID,
      name: "Gitwork Proposal Template",
      slug: "gitwork-proposal-template",
      description: "Default structured proposal template for Docs by Gitwork.",
      documentType: "PROPOSAL",
      isDefault: true,
      sections: deepClone(getDefaultProposalSections()),
      metadata: DEFAULT_PROPOSAL_METADATA,
    },
  ];
}

function getSeedProposals(): ProposalDocument[] {
  return [
    createSeedProposal({
      id: DEFAULT_PRIMARY_PROPOSAL_ID,
      title: "Test Gitwork",
      clientName: "Dan's Garden",
      productName: "Docs by Gitwork",
      status: "APPROVED",
      summary: "Structured proposal builder with live preview, costing, timeline, and export-ready output.",
      version: "v1.0",
      updatedAt: "2026-03-12T13:51:13.961Z",
      approvalChecked: true,
    }),
    createSeedProposal({
      id: DEFAULT_SECONDARY_PROPOSAL_ID,
      title: "Docs by Gitwork - Proposal Builder MVP",
      clientName: "Acme Health",
      productName: "Docs by Gitwork",
      status: "DRAFT",
      summary: "Template-driven proposal builder for internal commercial teams.",
      version: "v1.0",
      updatedAt: "2026-03-12T00:13:57.855Z",
      approvalChecked: false,
    }),
  ];
}

function getSeedState(): PocState {
  return {
    proposals: getSeedProposals(),
    templates: getSeedTemplates(),
    proofDocuments: [],
    clients: getSeedClients(),
  };
}

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readState(): PocState {
  const seed = getSeedState();

  if (!hasStorage()) {
    return seed;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PocState>;
    return {
      proposals: Array.isArray(parsed.proposals) && parsed.proposals.length ? parsed.proposals : seed.proposals,
      templates: Array.isArray(parsed.templates) && parsed.templates.length ? parsed.templates : seed.templates,
      proofDocuments: Array.isArray(parsed.proofDocuments) ? parsed.proofDocuments : [],
      clients:
        Array.isArray(parsed.clients) && parsed.clients.length
          ? parsed.clients
          : seed.proposals.reduce(
              (clientsState, proposal) => {
                ensureClientInState(clientsState, proposal.clientName);
                return clientsState.clients;
              },
              {
                proposals: [],
                templates: [],
                proofDocuments: [],
                clients: [...seed.clients],
              } as PocState,
            ),
    };
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
}

function writeState(state: PocState) {
  if (!hasStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function sortProposals(
  proposals: ProposalDocument[],
  sort: string | undefined,
): ProposalDocument[] {
  const next = [...proposals];
  const [field, directionRaw] = (sort ?? "updatedAt:desc").split(":");
  const direction = directionRaw === "asc" ? 1 : -1;

  if (field === "title") {
    next.sort((a, b) => a.title.localeCompare(b.title) * direction);
    return next;
  }

  next.sort(
    (a, b) =>
      (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * direction,
  );
  return next;
}

function toListItem(proposal: ProposalDocument, templateName?: string): ProposalListItem {
  return {
    id: proposal.id,
    title: proposal.title,
    clientName: proposal.clientName,
    productName: proposal.productName,
    status: proposal.status,
    updatedAt: proposal.updatedAt,
    templateName: templateName ?? "Gitwork Proposal Template",
    ownerName: DEFAULT_OWNER_NAME,
  };
}

function patchProposal(
  existing: ProposalDocument,
  input: Partial<ProposalDocument>,
): ProposalDocument {
  const nextProposal: ProposalDocument = {
    ...existing,
    ...input,
    metadata: input.metadata ?? existing.metadata,
    exportSettings: input.exportSettings ?? existing.exportSettings,
    sections: input.sections ?? existing.sections,
    costLineItems: input.costLineItems ?? existing.costLineItems,
    timelinePhases: input.timelinePhases ?? existing.timelinePhases,
    assets: input.assets ?? existing.assets,
    links: input.links ?? existing.links,
    ctas: input.ctas ?? existing.ctas,
    updatedAt: nowIso(),
  };

  const coverSection = nextProposal.sections.find((section) => section.key === "cover");
  const coverData = coverSection?.data as
    | {
        proposalTitle?: string;
        clientName?: string;
        productName?: string;
      }
    | undefined;

  if (coverData) {
    nextProposal.title = coverData.proposalTitle ?? nextProposal.title;
    nextProposal.clientName = coverData.clientName ?? nextProposal.clientName;
    nextProposal.productName = coverData.productName ?? nextProposal.productName;
    nextProposal.metadata = {
      ...nextProposal.metadata,
      client: coverData.clientName ?? nextProposal.metadata.client,
    };
  }

  return nextProposal;
}

function toClientListItem(client: ClientRecord, proposals: ProposalDocument[]): ClientListItem {
  const proposalCount = proposals.filter(
    (proposal) => proposal.clientName?.trim().toLowerCase() === client.name.trim().toLowerCase(),
  ).length;

  return {
    ...client,
    proposalCount,
  };
}

export function listPocProposals(filters: {
  search?: string;
  status?: string;
  sort?: string;
}) {
  const state = readState();
  const templatesById = new Map(state.templates.map((template) => [template.id, template.name]));
  const search = filters.search?.trim().toLowerCase() ?? "";

  const proposals = sortProposals(state.proposals, filters.sort).filter((proposal) => {
    if (filters.status && filters.status !== "ALL" && proposal.status !== filters.status) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [proposal.title, proposal.clientName, proposal.productName]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(search));
  });

  return {
    proposals: proposals.map((proposal) =>
      toListItem(proposal, templatesById.get(proposal.templateId ?? DEFAULT_TEMPLATE_ID)),
    ),
  };
}

export function getPocProposal(id: string) {
  const state = readState();
  return state.proposals.find((proposal) => proposal.id === id) ?? null;
}

export function createPocProposal(input: {
  title: string;
  clientName?: string;
  productName?: string;
  templateId?: string;
}) {
  const state = readState();
  const templateId = input.templateId ?? state.templates.find((template) => template.isDefault)?.id ?? DEFAULT_TEMPLATE_ID;
  const id = createId("proposal");
  const createdAt = nowIso();
  const clientName = input.clientName?.trim() || "";
  const title = input.title.trim() || "Untitled Proposal";
  const proposal: ProposalDocument = {
    id,
    workspaceId: DEFAULT_WORKSPACE_ID,
    ownerId: DEFAULT_OWNER_ID,
    templateId,
    documentType: "PROPOSAL",
    status: "DRAFT",
    title,
    productName: "",
    clientName,
    summary: "",
    version: "",
    expiresAt: null,
    metadata: {
      ...EMPTY_PROPOSAL_METADATA,
      client: clientName,
    },
    exportSettings: {},
    updatedAt: createdAt,
    createdAt,
    sections: createEmptySections(id, title, clientName),
    costLineItems: [],
    timelinePhases: [],
    assets: [],
    links: [],
    ctas: [],
  };

  state.proposals.unshift(proposal);
  ensureClientInState(state, clientName);
  writeState(state);
  return { proposal };
}

export function updatePocProposal(id: string, input: Partial<ProposalDocument>) {
  const state = readState();
  const index = state.proposals.findIndex((proposal) => proposal.id === id);
  if (index < 0) {
    throw new Error("Proposal not found.");
  }

  const updated = patchProposal(state.proposals[index], input);
  state.proposals[index] = updated;
  ensureClientInState(state, updated.clientName);
  writeState(state);
  return { proposal: updated };
}

export function duplicatePocProposal(id: string) {
  const state = readState();
  const existing = state.proposals.find((proposal) => proposal.id === id);
  if (!existing) {
    throw new Error("Proposal not found.");
  }

  const nextId = createId("proposal");
  const duplicate = deepClone(existing);
  duplicate.id = nextId;
  duplicate.title = `${existing.title} Copy`;
  duplicate.status = "DRAFT";
  duplicate.createdAt = nowIso();
  duplicate.updatedAt = duplicate.createdAt;
  duplicate.sections = duplicate.sections.map((section, index) => ({
    ...section,
    id: `${nextId}_section_${section.key}_${index}`,
  }));
  duplicate.costLineItems = duplicate.costLineItems.map((item, index) => ({
    ...item,
    id: `${nextId}_cost_${index}`,
  }));
  duplicate.timelinePhases = duplicate.timelinePhases.map((phase, index) => ({
    ...phase,
    id: `${nextId}_phase_${index}`,
  }));
  duplicate.assets = duplicate.assets.map((asset, index) => ({
    ...asset,
    id: `${nextId}_asset_${index}`,
  }));
  duplicate.links = duplicate.links.map((link, index) => ({
    ...link,
    id: `${nextId}_link_${index}`,
  }));
  duplicate.ctas = duplicate.ctas.map((cta, index) => ({
    ...cta,
    id: `${nextId}_cta_${index}`,
  }));

  state.proposals.unshift(duplicate);
  ensureClientInState(state, duplicate.clientName);
  writeState(state);
  return { proposal: duplicate };
}

export function archivePocProposal(id: string) {
  return updatePocProposal(id, { status: "ARCHIVED" });
}

export function deletePocProposal(id: string) {
  const state = readState();
  state.proposals = state.proposals.filter((proposal) => proposal.id !== id);
  writeState(state);
  return { ok: true as const };
}

export function listPocTemplates() {
  return { templates: readState().templates };
}

export function listPocClients(filters?: { search?: string }) {
  const state = readState();
  const search = filters?.search?.trim().toLowerCase() ?? "";

  const clients = state.clients
    .filter((client) => {
      if (!search) {
        return true;
      }

      return client.name.toLowerCase().includes(search);
    })
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((client) => toClientListItem(client, state.proposals));

  return { clients };
}

export function getPocClientDetail(slug: string) {
  const state = readState();
  const client = state.clients.find((entry) => entry.slug === slug);

  if (!client) {
    return null;
  }

  const proposals = sortProposals(
    state.proposals.filter(
      (proposal) => proposal.clientName?.trim().toLowerCase() === client.name.trim().toLowerCase(),
    ),
    "updatedAt:desc",
  );
  const proposalIds = new Set(proposals.map((proposal) => proposal.id));
  const proofDocuments = state.proofDocuments
    .filter((document) => !document.archivedAt)
    .filter((document) => (document.proposalId ? proposalIds.has(document.proposalId) : false))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  return {
    client: toClientListItem(client, state.proposals),
    proposals: proposals.map((proposal) =>
      toListItem(proposal, state.templates.find((template) => template.id === proposal.templateId)?.name),
    ),
    proofDocuments,
  };
}

export function createPocClient(input: { name: string }) {
  const state = readState();
  const name = input.name.trim();
  if (!name) {
    throw new Error("Client name is required.");
  }

  const existing = state.clients.find((client) => client.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return { client: existing };
  }

  const timestamp = nowIso();
  const client: ClientRecord = {
    id: createId("client"),
    name,
    slug: slugify(name),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  state.clients.unshift(client);
  writeState(state);
  return { client };
}

export function savePocCosting(
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
  const proposal = getPocProposal(id);
  if (!proposal) {
    throw new Error("Proposal not found.");
  }

  const sections = proposal.sections.map((section) =>
    section.key === "costing"
      ? {
          ...section,
          data: {
            ...(section.data as CostingSectionData),
            currency: input.currency ?? (section.data as CostingSectionData).currency,
            discount: input.discount ?? (section.data as CostingSectionData).discount,
            taxRate: input.taxRate ?? (section.data as CostingSectionData).taxRate,
            monthlyCostSummary:
              input.monthlyCostSummary ?? (section.data as CostingSectionData).monthlyCostSummary,
            durationSummary:
              input.durationSummary ?? (section.data as CostingSectionData).durationSummary,
            totalCostLabel:
              input.totalCostLabel ?? (section.data as CostingSectionData).totalCostLabel,
            supportingNarrative:
              input.supportingNarrative ?? (section.data as CostingSectionData).supportingNarrative,
            paymentScheduleIntro:
              input.paymentScheduleIntro ?? (section.data as CostingSectionData).paymentScheduleIntro,
            paymentTerms:
              input.paymentTerms ?? (section.data as CostingSectionData).paymentTerms,
            vatNotice: input.vatNotice ?? (section.data as CostingSectionData).vatNotice,
            ipTransferNotice:
              input.ipTransferNotice ?? (section.data as CostingSectionData).ipTransferNotice,
            teamAllocations:
              input.teamAllocations ?? (section.data as CostingSectionData).teamAllocations,
            paymentSchedule:
              input.paymentSchedule ?? (section.data as CostingSectionData).paymentSchedule,
            additionalNotes:
              input.additionalNotes ?? (section.data as CostingSectionData).additionalNotes,
          },
        }
      : section,
  );

  return updatePocProposal(id, {
    sections,
    costLineItems: input.costLineItems,
  });
}

export function savePocTimeline(
  id: string,
  input: {
    timelinePhases: TimelinePhaseInput[];
    viewMode?: "LIST" | "MILESTONE";
  },
) {
  const proposal = getPocProposal(id);
  if (!proposal) {
    throw new Error("Proposal not found.");
  }

  const sections = proposal.sections.map((section) =>
    section.key === "timeline"
      ? {
          ...section,
          data: {
            ...(section.data as { viewMode: "LIST" | "MILESTONE" }),
            viewMode: input.viewMode ?? (section.data as { viewMode: "LIST" | "MILESTONE" }).viewMode,
          },
        }
      : section,
  );

  return updatePocProposal(id, {
    sections,
    timelinePhases: input.timelinePhases,
  });
}

export function savePocEngagement(
  id: string,
  input: {
    ctas: CTAInput[];
    links: ProposalLinkInput[];
  },
) {
  return updatePocProposal(id, {
    ctas: input.ctas,
    links: input.links,
  });
}

export function requestPocExport(
  id: string,
  input: {
    format: "PRINT" | "PDF" | "SHARE_LINK";
    settings?: Record<string, unknown>;
  },
) {
  const proposal = getPocProposal(id);
  if (!proposal) {
    throw new Error("Proposal not found.");
  }

  const url =
    input.format === "SHARE_LINK"
      ? `/preview/${id}`
      : `/app/proposals/${id}/print`;

  return {
    export: {
      id: createId("export"),
      format: input.format,
      status: "READY" as const,
      url,
      requestedAt: nowIso(),
    },
  };
}

export function listPocProofDocuments(filters?: { proposalId?: string | null }) {
  const state = readState();
  const documents = [...state.proofDocuments]
    .filter((document) => !document.archivedAt)
    .filter((document) => (filters?.proposalId ? document.proposalId === filters.proposalId : true))
    .sort((a, b) => new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime());

  return { documents };
}

export function createPocProofDocument(input: ProofCreateDocumentInput) {
  const state = readState();
  const id = createId("proof");
  const slug = slugify(input.title) || createId("draft");
  const createdAt = nowIso();
  const linkedProposal = input.proposalId
    ? state.proposals.find((proposal) => proposal.id === input.proposalId)
    : null;
  const tokenUrl = `/app/proof?draft=${encodeURIComponent(slug)}`;

  const document: ProofDocumentRecord = {
    id,
    workspaceId: DEFAULT_WORKSPACE_ID,
    ownerId: DEFAULT_OWNER_ID,
    proposalId: input.proposalId ?? null,
    proposalTitle: linkedProposal?.title ?? null,
    slug,
    title: input.title.trim() || "Proof Draft",
    shareUrl: tokenUrl,
    tokenUrl,
    accessToken: createId("token"),
    source: "proof",
    createdAt,
    updatedAt: createdAt,
    lastOpenedAt: createdAt,
    archivedAt: null,
  };

  state.proofDocuments.unshift(document);
  writeState(state);
  return { document };
}

export function updatePocProofDocument(id: string, input: ProofDocumentUpdateInput) {
  const state = readState();
  const index = state.proofDocuments.findIndex((document) => document.id === id);
  if (index < 0) {
    throw new Error("Proof document not found.");
  }

  const proposal = input.proposalId
    ? state.proposals.find((entry) => entry.id === input.proposalId)
    : null;
  const existing = state.proofDocuments[index];
  const updated: ProofDocumentRecord = {
    ...existing,
    title: input.title ?? existing.title,
    proposalId: input.proposalId !== undefined ? input.proposalId : existing.proposalId,
    proposalTitle:
      input.proposalId !== undefined ? proposal?.title ?? null : existing.proposalTitle,
    archivedAt: input.archived ? nowIso() : input.archived === false ? null : existing.archivedAt,
    lastOpenedAt: input.touch ? nowIso() : existing.lastOpenedAt,
    updatedAt: nowIso(),
  };

  state.proofDocuments[index] = updated;
  writeState(state);
  return { document: updated };
}
