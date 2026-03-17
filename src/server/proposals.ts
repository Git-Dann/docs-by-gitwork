import {
  DocumentStatus,
  LinkType,
  Prisma,
  TimelineView,
  type CTA,
  type CostLineItem,
  type Document,
  type DocumentSection,
  type Export,
  type Link,
  type TimelinePhase,
} from "@prisma/client";
import {
  DEFAULT_PROPOSAL_METADATA,
  defaultAssets,
  defaultCostLineItems,
  defaultCtas,
  defaultLinks,
  defaultTimelinePhases,
  getDefaultProposalSections,
} from "@/lib/default-template";
import type {
  ProposalDocument,
  ProposalMetadata,
  ProposalSection,
  ProposalListItem,
} from "@/types/proposal";

export const DEFAULT_WORKSPACE_SLUG = "gitwork";
export const DEFAULT_TEMPLATE_SLUG = "gitwork-proposal-template";
export const DEFAULT_USER_EMAIL = "owner@gitwork.io";

export const proposalInclude = {
  sections: {
    orderBy: {
      sortOrder: "asc",
    },
  },
  costLineItems: {
    orderBy: {
      sortOrder: "asc",
    },
  },
  timelinePhases: {
    orderBy: {
      sortOrder: "asc",
    },
  },
  assets: {
    orderBy: {
      sortOrder: "asc",
    },
  },
  links: {
    orderBy: {
      sortOrder: "asc",
    },
  },
  ctas: {
    orderBy: {
      sortOrder: "asc",
    },
  },
  template: true,
  owner: true,
} satisfies Prisma.DocumentInclude;

export type ProposalDocumentRecord = Prisma.DocumentGetPayload<{
  include: typeof proposalInclude;
}>;

function asJson<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }

  return value as T;
}

function normalizeMetadata(value: Prisma.JsonValue | null | undefined): ProposalMetadata {
  const metadata = asJson<Partial<ProposalMetadata>>(value, {});

  return {
    ...DEFAULT_PROPOSAL_METADATA,
    ...metadata,
    client: metadata.client ?? DEFAULT_PROPOSAL_METADATA.client,
    owner: metadata.owner ?? DEFAULT_PROPOSAL_METADATA.owner,
    version: metadata.version ?? DEFAULT_PROPOSAL_METADATA.version,
    productSignOff: Boolean(metadata.productSignOff),
    techSignOff: Boolean(metadata.techSignOff),
    approvalChecked: Boolean(metadata.approvalChecked),
  };
}

function normalizeSections(sections: DocumentSection[]): ProposalSection[] {
  if (sections.length === 0) {
    return getDefaultProposalSections();
  }

  return sections.map((section) => ({
    id: section.id,
    key: section.key as ProposalSection["key"],
    title: section.title,
    description: section.description ?? undefined,
    sortOrder: section.sortOrder,
    isVisible: section.isVisible,
    data: section.data as unknown as ProposalSection["data"],
  }));
}

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

export function serializeProposal(document: ProposalDocumentRecord): ProposalDocument {
  return {
    id: document.id,
    workspaceId: document.workspaceId,
    ownerId: document.ownerId,
    templateId: document.templateId,
    documentType: document.documentType,
    status: document.status,
    title: document.title,
    productName: document.productName,
    clientName: document.clientName,
    summary: document.summary,
    version: document.version,
    expiresAt: document.expiresAt?.toISOString() ?? null,
    metadata: normalizeMetadata(document.metadata),
    exportSettings: asJson<Record<string, unknown>>(document.exportSettings, {}),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    sections: normalizeSections(document.sections),
    costLineItems: document.costLineItems.map((item) => ({
      id: item.id,
      category: item.category,
      itemName: item.itemName,
      description: item.description ?? "",
      quantity: decimalToNumber(item.quantity),
      unitCost: decimalToNumber(item.unitCost),
      subtotal: decimalToNumber(item.subtotal),
      costKind: item.costKind,
      sortOrder: item.sortOrder,
    })),
    timelinePhases: document.timelinePhases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      duration: phase.duration,
      summary: phase.summary,
      deliverables: asJson<string[]>(phase.deliverables, []),
      sortOrder: phase.sortOrder,
      viewMode: phase.viewMode,
    })),
    assets: document.assets.map((asset) => ({
      id: asset.id,
      sectionId: asset.sectionId ?? undefined,
      type: asset.type,
      title: asset.title,
      url: asset.url,
      altText: asset.altText,
      placement: asset.placement,
      caption: asset.caption ?? undefined,
      size: asset.size,
      alignment: asset.alignment,
      sortOrder: asset.sortOrder,
    })),
    links: document.links.map((link) => ({
      id: link.id,
      label: link.label,
      url: link.url,
      type: link.type,
      notes: link.notes ?? "",
      sortOrder: link.sortOrder,
    })),
    ctas: document.ctas.map((cta) => ({
      id: cta.id,
      role: cta.role,
      label: cta.label,
      destination: cta.destination,
      destinationType: cta.destinationType,
      sortOrder: cta.sortOrder,
    })),
  };
}

export function serializeProposalListItem(
  proposal: Document & { template: { name: string } | null; owner: { name: string | null } },
): ProposalListItem {
  return {
    id: proposal.id,
    title: proposal.title,
    clientName: proposal.clientName,
    productName: proposal.productName,
    status: proposal.status,
    updatedAt: proposal.updatedAt.toISOString(),
    templateName: proposal.template?.name ?? null,
    ownerName: proposal.owner.name,
  };
}

export function getDefaultSectionPayload(): Array<
  Prisma.DocumentSectionCreateWithoutDocumentInput
> {
  return getDefaultProposalSections().map((section, index) => ({
    key: section.key,
    title: section.title,
    description: section.description,
    sortOrder: section.sortOrder ?? index,
    isVisible: section.isVisible,
    data: section.data as unknown as Prisma.InputJsonValue,
  }));
}

export function getDefaultCostsPayload(): Array<
  Prisma.CostLineItemCreateWithoutDocumentInput
> {
  return defaultCostLineItems.map((item, index) => ({
    category: item.category,
    itemName: item.itemName,
    description: item.description,
    quantity: new Prisma.Decimal(item.quantity),
    unitCost: new Prisma.Decimal(item.unitCost),
    subtotal: new Prisma.Decimal(item.subtotal),
    costKind: item.costKind,
    sortOrder: item.sortOrder ?? index,
  }));
}

export function getDefaultTimelinePayload(): Array<
  Prisma.TimelinePhaseCreateWithoutDocumentInput
> {
  return defaultTimelinePhases.map((phase, index) => ({
    name: phase.name,
    duration: phase.duration,
    summary: phase.summary,
    deliverables: phase.deliverables as unknown as Prisma.InputJsonValue,
    sortOrder: phase.sortOrder ?? index,
    viewMode: phase.viewMode,
  }));
}

export function getDefaultLinkPayload(): Array<Prisma.LinkCreateWithoutDocumentInput> {
  return defaultLinks.map((link, index) => ({
    label: link.label,
    url: link.url,
    type: link.type,
    notes: link.notes,
    sortOrder: link.sortOrder ?? index,
  }));
}

export function getDefaultCtaPayload(): Array<Prisma.CTACreateWithoutDocumentInput> {
  return defaultCtas.map((cta, index) => ({
    role: cta.role,
    label: cta.label,
    destination: cta.destination,
    destinationType: cta.destinationType,
    sortOrder: cta.sortOrder ?? index,
  }));
}

export function getDefaultAssetPayload(): Array<Prisma.AssetCreateWithoutDocumentInput> {
  return defaultAssets.map((asset, index) => ({
    type: asset.type,
    title: asset.title,
    url: asset.url,
    altText: asset.altText,
    placement: asset.placement,
    caption: asset.caption,
    size: asset.size,
    alignment: asset.alignment,
    sortOrder: asset.sortOrder ?? index,
  }));
}

export function resolveStatus(value?: string | null): DocumentStatus | undefined {
  if (!value) {
    return undefined;
  }

  const upper = value.toUpperCase();
  if (upper in DocumentStatus) {
    return upper as DocumentStatus;
  }

  return undefined;
}

export function resolveDestinationType(value?: string | null): LinkType {
  if (!value) {
    return LinkType.EXTERNAL_URL;
  }

  const upper = value.toUpperCase();
  if (upper in LinkType) {
    return upper as LinkType;
  }

  return LinkType.EXTERNAL_URL;
}

export function normalizeSubtotal(item: {
  quantity: number;
  unitCost: number;
  subtotal?: number;
}): Prisma.Decimal {
  const subtotal = item.subtotal ?? item.quantity * item.unitCost;
  return new Prisma.Decimal(subtotal);
}

export function mapDeliverables(value: string[] | Prisma.JsonValue): Prisma.InputJsonValue {
  if (Array.isArray(value)) {
    return value;
  }

  return [];
}

export function pickViewMode(mode?: string): TimelineView {
  if (mode === "MILESTONE") {
    return TimelineView.MILESTONE;
  }

  return TimelineView.LIST;
}

export type ProposalGraph = {
  sections: DocumentSection[];
  costLineItems: CostLineItem[];
  timelinePhases: TimelinePhase[];
  links: Link[];
  ctas: CTA[];
  exports: Export[];
};
