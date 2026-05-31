export type DocumentStatus =
  | "DRAFT"
  | "PRODUCT_SIGN_OFF"
  | "TECH_SIGN_OFF"
  | "IN_REVIEW"
  | "APPROVED"
  | "SENT"
  | "ARCHIVED";

export type DocumentType = "PROPOSAL" | "SLA" | "SOW" | "MSA" | "NDA" | "CO" | "DSA" | "OTHER";

export type SectionKey =
  // ── Shared / proposal-original ─────────────────────────────────────────────
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
  | "signoff_footer"
  // ── SLA / contract sections (Sprint 3) ────────────────────────────────────
  | "parties"          // signatories / counterparties block
  | "service_tiers"    // table of service tiers, uptime targets, support hours
  | "response_times"   // table of priorities, first-response + resolution SLAs
  | "escalation"       // ordered escalation ladder
  | "exclusions"       // bulleted exclusions with rationale
  | "penalties"        // service credit / penalty schedule
  | "term"             // effective date, duration, renewal, notice period
  | "signatures"       // signature blocks for each party
  // ── Generic blocks (Sprint 7 — new) ────────────────────────────────────────
  | "heading"          // visual section heading, three sizes
  | "prose"            // freeform markdown-ish prose
  | "callout"          // highlighted note (info / warning / success / danger)
  | "image"            // standalone image with caption + alignment
  | "divider"          // visual rule, spacer, or page break
  // ── Sprint 8 expansion (P4.15) ─────────────────────────────────────────────
  | "data_table"       // generic editable rows/columns table
  | "pricing_tiers"    // 3-column tier comparison (Bronze / Silver / Gold)
  | "kpi_strip"        // 4-column big-figure stat row
  | "faq"              // Q + A pairs
  | "comparison_table" // us vs them with checkmarks
  | "video_embed"      // YouTube / Loom / Vimeo with caption
  | "code_snippet"     // monospace code block with language label
  | "checklist";       // polarity-aware list (include / exclude) — P4.16 consolidation

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

// ── SLA / contract section data shapes (Sprint 3) ─────────────────────────────────────────

export interface PartyItem {
  id: string;
  name: string;
  role: string;          // e.g. "Service Provider", "Customer", "Authorised Signatory"
  organization: string;
  email: string;
  /** Whether this party signs the document. Used by the signatures block. */
  signatureRequired: boolean;
}

export interface PartiesSectionData {
  /** Free-text preamble shown above the parties list (e.g. "This Agreement is made between:"). */
  intro: string;
  parties: PartyItem[];
}

export interface ServiceTierItem {
  id: string;
  name: string;            // e.g. "Standard", "Premium"
  services: string;        // What's included at this tier
  uptimeTarget: string;    // e.g. "99.9%"
  supportHours: string;    // e.g. "Mon-Fri 09:00-18:00 UK"
}

export interface ServiceTiersSectionData {
  intro: string;
  tiers: ServiceTierItem[];
}

export interface ResponsePriorityItem {
  id: string;
  priority: string;        // e.g. "P1 - Critical"
  definition: string;      // What qualifies as this priority
  firstResponse: string;   // e.g. "Within 1 business hour"
  resolution: string;      // e.g. "Within 4 business hours"
}

export interface ResponseTimesSectionData {
  intro: string;
  priorities: ResponsePriorityItem[];
}

export interface EscalationLevelItem {
  id: string;
  level: number;           // 1, 2, 3...
  contact: string;         // Role + name (e.g. "Account Manager — Dan Lindsay")
  timeframe: string;       // When to escalate (e.g. "After 2 hours without response")
  criteria: string;        // Trigger criteria
}

export interface EscalationSectionData {
  intro: string;
  levels: EscalationLevelItem[];
}

export interface ExclusionItem {
  id: string;
  exclusion: string;
  rationale: string;       // Why this is excluded
}

export interface ExclusionsSectionData {
  intro: string;
  items: ExclusionItem[];
}

export interface PenaltyTierItem {
  id: string;
  trigger: string;         // What event triggers a credit (e.g. "Uptime falls below 99.0%")
  credit: string;          // The credit amount (e.g. "10% of monthly fee")
  cap: string;             // Optional cap (e.g. "Capped at 50% of monthly fee")
}

export interface PenaltiesSectionData {
  intro: string;
  tiers: PenaltyTierItem[];
}

export interface TermSectionData {
  effectiveDate: string;       // ISO date
  initialTermMonths: number;   // e.g. 12
  autoRenew: boolean;
  renewalTerm: string;         // Free-text, e.g. "Successive 12-month periods"
  noticePeriodDays: number;    // e.g. 60
  governingLaw: string;        // e.g. "England and Wales"
  terminationForCause: string; // Free-text describing termination rights
}

export interface SignatureBlockItem {
  id: string;
  partyName: string;
  signatoryName: string;
  signatoryRole: string;
  signatoryEmail: string;
  /** Filled at signing time (Sprint 4 e-sig); kept blank in v3. */
  signatureDate: string;
}

export interface SignaturesSectionData {
  intro: string;
  blocks: SignatureBlockItem[];
}

// ── Generic blocks (Sprint 7 — new) ───────────────────────────────────────────────────────

export interface HeadingSectionData {
  /** Visual size — h1 (page-level), h2 (section), h3 (subsection). */
  level: "h1" | "h2" | "h3";
  text: string;
  /** Optional eyebrow above the heading (mono caps). */
  eyebrow?: string;
}

export interface ProseSectionData {
  /** Markdown-ish content. The preview renders paragraphs split on \n\n and trims line breaks. */
  content: string;
}

export interface CalloutSectionData {
  tone: "info" | "warning" | "success" | "danger" | "neutral";
  /** Optional headline above the body. */
  headline?: string;
  body: string;
}

export interface ImageSectionData {
  url: string;
  altText: string;
  caption?: string;
  /** Image width — fits to its alignment. */
  size: "small" | "medium" | "large" | "full";
  alignment: "left" | "center" | "right";
}

export interface DividerSectionData {
  /** Variant determines visual: rule = hairline; spacer = empty whitespace; page-break = forces a new page on print. */
  variant: "rule" | "spacer" | "page-break";
  /** Used by `spacer` variant — controls the gap height (px). */
  spacing?: number;
}

// ── Sprint 8 — new block data shapes (P4.15 / P4.16) ──────────────────────────────────────

export interface DataTableSectionData {
  /** Column headers. Length controls column count. */
  columns: string[];
  /** Each row is an array of cell strings; aligned to `columns` by index. */
  rows: string[][];
  /** Optional caption rendered above the table. */
  caption?: string;
}

export interface PricingTierItem {
  name: string;
  price: string;
  /** Single-line frequency / cadence — e.g. "/ month", "one-off". */
  cadence?: string;
  /** Optional one-line tagline below the name. */
  tagline?: string;
  /** Feature bullets. Plain strings; checkmarks are added in preview. */
  features: string[];
  /** Optional CTA button label + url. Only renders when label is set. */
  ctaLabel?: string;
  ctaUrl?: string;
  /** Highlights this tier ("most popular"). At most one should be highlighted. */
  highlighted?: boolean;
}

export interface PricingTiersSectionData {
  intro?: string;
  tiers: PricingTierItem[];
}

export interface KpiStripItem {
  /** The big figure — usually a number with unit. */
  value: string;
  /** Caption below the figure. */
  label: string;
  /** Optional context line above the value (e.g. "Q2 result"). */
  context?: string;
}

export interface KpiStripSectionData {
  items: KpiStripItem[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqSectionData {
  intro?: string;
  items: FaqItem[];
}

export interface ComparisonRow {
  /** Row label (capability / feature). */
  label: string;
  /** Optional sub-line under the label. */
  detail?: string;
  /** "us" cell: true → checkmark, false → cross, string → freeform text. */
  us: boolean | string;
  /** "them" cell — same as `us`. */
  them: boolean | string;
}

export interface ComparisonTableSectionData {
  /** Heading for our side (default "Gitwork"). */
  usLabel: string;
  /** Heading for the other side (default "Status quo"). */
  themLabel: string;
  rows: ComparisonRow[];
}

export interface VideoEmbedSectionData {
  /** Full URL — Loom share link, YouTube watch URL, Vimeo, etc. */
  url: string;
  /** Optional caption shown beneath the player. */
  caption?: string;
  /** Aspect ratio (default 16:9). */
  aspectRatio?: "16:9" | "4:3" | "1:1";
}

export interface CodeSnippetSectionData {
  /** Display label (e.g. "TypeScript", "Bash"). Purely cosmetic. */
  language?: string;
  /** Optional filename shown in the snippet header. */
  filename?: string;
  code: string;
}

export interface ChecklistSectionData {
  /** INCLUDE → green checks ("what's in scope"). EXCLUDE → red crosses ("what's out"). */
  polarity: "INCLUDE" | "EXCLUDE";
  intro?: string;
  items: string[];
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
  | SignoffFooterSectionData
  | PartiesSectionData
  | ServiceTiersSectionData
  | ResponseTimesSectionData
  | EscalationSectionData
  | ExclusionsSectionData
  | PenaltiesSectionData
  | TermSectionData
  | SignaturesSectionData
  | HeadingSectionData
  | ProseSectionData
  | CalloutSectionData
  | ImageSectionData
  | DividerSectionData
  | DataTableSectionData
  | PricingTiersSectionData
  | KpiStripSectionData
  | FaqSectionData
  | ComparisonTableSectionData
  | VideoEmbedSectionData
  | CodeSnippetSectionData
  | ChecklistSectionData;

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
  /** Workspace-defined labels for filtering/grouping (P0.4). */
  labels: string[];
  /** Optional parent document (P5.18). SOW → MSA, CO → SOW. */
  parentId?: string | null;
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
  labels?: string[];
  parentId?: string | null;
}
