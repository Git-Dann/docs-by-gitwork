export type DocumentStatus =
  | "DRAFT"
  | "PRODUCT_SIGN_OFF"
  | "TECH_SIGN_OFF"
  | "IN_REVIEW"
  | "APPROVED"
  | "SENT"
  | "ARCHIVED";

export type DocumentType = "PROPOSAL" | "SLA" | "OTHER";

export type SectionKey =
  | "cover"
  | "introduction"
  | "product_overview"
  | "objectives"
  | "touchpoints"
  | "timeline"
  | "costing"
  | "cta_next_steps"
  | "supporting_links_assets"
  | "assumptions"
  | "out_of_scope"
  | "signoff_footer";

export type CostKind = "ONE_OFF" | "RECURRING";

export type LinkType =
  | "INTERNAL_ROUTE"
  | "EXTERNAL_URL"
  | "DECK_LINK"
  | "DOCUMENT_LINK"
  | "EMAIL_LINK";

export type AssetType =
  | "COVER_IMAGE"
  | "SECTION_GRAPHIC"
  | "DIAGRAM"
  | "LOGO"
  | "SCREENSHOT";

export type AssetSize = "SMALL" | "MEDIUM" | "LARGE" | "FULL";

export type AssetAlignment = "LEFT" | "CENTER" | "RIGHT" | "FULL";

export type TimelineViewMode = "LIST" | "MILESTONE";
export type AssignmentTimelineMode = "DEFAULT" | "MANUAL";

export interface CoverSectionData {
  proposalTitle: string;
  productName: string;
  clientName: string;
  subtitle: string;
  date: string;
  confidentiality: string;
  confidentialityMode?: "INTERNAL" | "EXTERNAL";
  heroImage?: string;
  brandLockup?: "GITWORK" | "CLIENT_X_GITWORK";
}

export interface IntroductionSectionData {
  statement: string;
  summary: string;
  graphic?: string;
}

export interface ProductOverviewSectionData {
  platformDescription: string;
  audience: string;
  valueProposition: string;
  platformsSupported: string;
  workflowGraphic?: string;
}

export interface ObjectiveItem {
  id: string;
  title: string;
  description: string;
  icon?: string;
}

export interface ObjectivesSectionData {
  items: ObjectiveItem[];
}

export interface TouchpointItem {
  id: string;
  title: string;
  summary: string;
  features: string[];
  notes?: string;
  graphic?: string;
  callout?: string;
}

export interface TouchpointsSectionData {
  items: TouchpointItem[];
}

export interface TimelineSectionData {
  viewMode: TimelineViewMode;
}

export interface CostTeamAllocationRow {
  id: string;
  teamMemberName: string;
  role: string;
  techStack: string;
  monthsRequired: number;
  dayRate: number | null;
  monthlyRate: number | null;
  totalCost: number | null;
  included: boolean;
}

export interface PaymentScheduleRow {
  id: string;
  timelinePhaseId?: string;
  phaseLabel?: string;
  phaseDuration?: string;
  phaseTotal?: number | null;
  action: string;
  periodCovered: string;
  paymentPercent?: number | null;
  includedWork: string;
  amount: number | null;
}

export interface CostingSectionData {
  currency: "GBP" | "USD" | "EUR";
  discount: number;
  taxRate: number;
  monthlyCostSummary: string;
  durationSummary: string;
  totalCostLabel: string;
  supportingNarrative: string;
  paymentScheduleIntro: string;
  paymentTerms: string;
  vatNotice: string;
  ipTransferNotice: string;
  teamAllocations: CostTeamAllocationRow[];
  paymentSchedule: PaymentScheduleRow[];
  additionalNotes: string[];
  assignmentTimelineMode?: Record<string, AssignmentTimelineMode>;
}

export interface CtaSectionData {
  headline: string;
  body: string;
}

export interface SupportingLinksSectionData {
  notes: string;
}

export interface ListSectionData {
  items: string[];
}

export interface SignoffFooterSectionData {
  preparedBy: string;
  team: string;
  contactDetails: string;
  footerNote: string;
  showBrandingBlock: boolean;
  signatureName: string;
  signatureDate: string;
}

export type ProposalSectionData =
  | CoverSectionData
  | IntroductionSectionData
  | ProductOverviewSectionData
  | ObjectivesSectionData
  | TouchpointsSectionData
  | TimelineSectionData
  | CostingSectionData
  | CtaSectionData
  | SupportingLinksSectionData
  | ListSectionData
  | SignoffFooterSectionData;

export interface ProposalSection {
  id?: string;
  key: SectionKey;
  title: string;
  description?: string;
  sortOrder: number;
  isVisible: boolean;
  data: ProposalSectionData;
}

export interface CostLineItemInput {
  id?: string;
  category: string;
  itemName: string;
  description?: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
  costKind: CostKind;
  sortOrder: number;
}

export interface TimelinePhaseInput {
  id?: string;
  name: string;
  duration: string;
  summary: string;
  deliverables: string[];
  sortOrder: number;
  viewMode: TimelineViewMode;
}

export interface AssetInput {
  id?: string;
  sectionId?: string;
  type: AssetType;
  title: string;
  url: string;
  altText: string;
  placement: string;
  caption?: string;
  size: AssetSize;
  alignment: AssetAlignment;
  sortOrder: number;
}

export interface ProposalLinkInput {
  id?: string;
  label: string;
  url: string;
  type: LinkType;
  notes?: string;
  sortOrder: number;
}

export interface CTAInput {
  id?: string;
  role: "PRIMARY" | "SECONDARY";
  label: string;
  destination: string;
  destinationType: LinkType;
  sortOrder: number;
}

export interface ProposalMetadata {
  client: string;
  owner: string;
  expiryDate?: string;
  version: string;
  notes?: string;
  internalComments?: string;
  productSignOff: boolean;
  techSignOff: boolean;
  approvalChecked: boolean;
}

export interface ProposalDocument {
  id: string;
  workspaceId: string;
  ownerId: string;
  templateId?: string | null;
  documentType: DocumentType;
  status: DocumentStatus;
  title: string;
  productName?: string | null;
  clientName?: string | null;
  summary?: string | null;
  version: string;
  /** Workspace-scoped, type-prefixed, year-scoped identifier (e.g. PROP-2026-014). */
  documentNumber?: string | null;
  /** Random URL-safe token used to expose the doc at /docs/[token]. Null if never shared. */
  shareToken?: string | null;
  /** Sharing is "on" — public link returns the document. False = link 404s. */
  isShared: boolean;
  expiresAt?: string | null;
  metadata: ProposalMetadata;
  exportSettings: Record<string, unknown>;
  updatedAt: string;
  createdAt: string;
  sections: ProposalSection[];
  costLineItems: CostLineItemInput[];
  timelinePhases: TimelinePhaseInput[];
  assets: AssetInput[];
  links: ProposalLinkInput[];
  ctas: CTAInput[];
}

export interface TemplateSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  documentType: DocumentType;
  isDefault: boolean;
  sections: ProposalSection[];
  metadata?: Record<string, unknown> | null;
}

export interface ProposalListItem {
  id: string;
  title: string;
  clientName?: string | null;
  productName?: string | null;
  status: DocumentStatus;
  updatedAt: string;
  templateName?: string | null;
  ownerName?: string | null;
  documentNumber?: string | null;
  documentType: DocumentType;
}
