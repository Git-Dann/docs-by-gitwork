import type { ProposalListItem } from "@/types/proposal";
import type { ProofDocumentRecord } from "@/lib/proof";

export type ClientSource = "SUGGESTED" | "MANUAL";

export type WorkspaceClientStatus =
  | "PENDING_REVIEW"
  | "ACTIVE"
  | "ARCHIVED"
  | "LEAD"
  | "INACTIVE";

/** Sales pipeline stage for a lead (status === "LEAD"). */
export type LeadStage =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "PROPOSAL_SENT"
  | "WON"
  | "LOST";

/** Kind of logged touchpoint on a lead/client. */
export type TouchpointType = "CALL" | "EMAIL" | "MEETING" | "NOTE";

/** A logged touchpoint (the CRM activity log on a lead's detail). */
export interface ClientTouchpoint {
  id: string;
  type: TouchpointType;
  note: string | null;
  occurredAt: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
}

/** Lead + paused-client fields, shared by the list item and the detail record. */
export interface ClientLeadFields {
  /** Where the lead came from (referral, inbound, website…). LEAD only. */
  leadSource: string | null;
  leadStage: LeadStage | null;
  /** ISO date of the next follow-up. */
  leadFollowUpAt: string | null;
  /** Estimated deal value (whole units of `leadValueCurrency`). */
  leadValue: number | null;
  leadValueCurrency: string | null;
  /** ISO date to "pick back up" a paused (INACTIVE) client. */
  resumeAt: string | null;
  /** Why the client was paused. */
  pauseNote: string | null;
}

export interface ClientRecord {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
  source: ClientSource;
  status: WorkspaceClientStatus;
}

/** Summed monthly cost of a client's assigned devs. Present only when the viewer
 *  may see financials (`clients.viewFinancials` / Super Admin). */
export interface ClientMonthlyCost {
  /** Summed monthly cost across priced devs, in `currency` (rounded). */
  amount: number;
  /** ISO 4217 code of the summed rates (e.g. "USD"). */
  currency: string;
  /** Assigned devs that contributed a rate (those in the dominant currency when mixed). */
  pricedDevs: number;
  /** Assigned devs with no matched rate (excluded from `amount`). */
  unpricedDevs: number;
  /** True when priced devs span more than one currency — `amount` then covers only the
   *  dominant currency, so the card shows a "mixed" readout instead of a misleading total. */
  mixedCurrency?: boolean;
}

export type ClientHealthLevel = "green" | "amber" | "red";

/** A composite delivery-health signal for a client, derived from open-task and Pulse
 *  signals. `reasons` explains the level for the card tooltip. Null when there's no signal. */
export interface ClientHealth {
  level: ClientHealthLevel;
  reasons: string[];
}

export interface ClientListItem extends ClientRecord {
  proposalCount: number;
  googleDriveFolderUrl: string | null;
  clickupUrl: string | null;
  hasCareClient: boolean;
  repoUrls: string[];
  /** Count of developers assigned to this client (ClientAssignment). Always present. */
  devCount: number;
  /** Summed monthly dev cost — present (non-null) only when the viewer may see financials. */
  monthlyCost?: ClientMonthlyCost | null;
  /** Business days since the project's Gantt timeline started (earliest dated feature block).
   *  Null/absent when there's no timeline yet, or when the viewer may not see financials. */
  workingDays?: number | null;
  /** Monthly retainer-day allowance (manual). Present only when the viewer may see financials. */
  retainerDays?: number | null;
  /** Retainer days used this month (manual). Present only when the viewer may see financials. */
  retainerDaysUsed?: number | null;
  /** Latest completed Pulse scan health score (0–100), if this client has a linked scan. */
  pulseHealthScore?: number | null;
  /** Id of that latest Pulse scan (deep-link target). */
  pulseScanId?: string | null;
  /** Composite delivery-health signal (overdue tasks + Pulse). Null when no signal exists. */
  health?: ClientHealth | null;
  // Lead + paused fields — present (non-null) only for LEAD / INACTIVE clients respectively.
  leadSource?: string | null;
  leadStage?: LeadStage | null;
  leadFollowUpAt?: string | null;
  leadValue?: number | null;
  leadValueCurrency?: string | null;
  resumeAt?: string | null;
  pauseNote?: string | null;
}

export interface ClientBankSummary {
  /** True when an encrypted bank record exists for the client. */
  onFile: boolean;
  /** ISO 4217 currency code. Plaintext for filtering / display hint. */
  currency: string | null;
  /** Last 4 digits of the account / IBAN. Plaintext for "•••• 4321" display. */
  accountNumberLast4: string | null;
}

export interface ClientBankReveal {
  accountHolder: string | null;
  bankName: string | null;
  sortCode: string | null;
  accountNumber: string | null;
  iban: string | null;
  swiftBic: string | null;
  currency: string | null;
}

export interface ClientDetailFields extends ClientLeadFields {
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
  notes: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  /** Where invoices are sent — distinct from primaryContactEmail. */
  invoiceEmail: string | null;
  googleDriveFolderUrl: string | null;
  clickupUrl: string | null;
  slackChannelId: string | null;
  /** Phase 3: dual-channel storage. `slackInternalChannelId ?? slackChannelId` is the
   *  effective internal channel for standup posts. `slackExternalChannelId` is the
   *  Slack Connect channel shared with the client. */
  slackInternalChannelId: string | null;
  slackInternalChannelName: string | null;
  slackExternalChannelId: string | null;
  slackExternalChannelName: string | null;
  /** Sticky error from the last provisioning attempt; null when everything's healthy. */
  slackProvisionError: string | null;
  legalCompanyName: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
  /** Billing address — only populated when it differs from the HQ address. */
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingCounty: string | null;
  billingPostcode: string | null;
  billingCountry: string | null;
  bank: ClientBankSummary | null;
  /** Original onboarding session id when this client was created via onboarding. */
  onboardingId: string | null;
  /** Monthly retainer-day allowance + days used this month (manual). */
  retainerDays: number | null;
  retainerDaysUsed: number | null;
}

export interface ClientPlatformRecord {
  id: string;
  clientId: string;
  name: string;
  platformType: string | null;
  url: string | null;
  stagingUrl: string | null;
  repoUrl: string | null;
  /** Legacy single-credential flags (pre-logins). True when a platform still has creds on the
   *  platform row that haven't been migrated into `logins` yet. */
  hasUsername: boolean;
  hasPassword: boolean;
  /** Credential sets ("logins"). Plaintext is never sent — only label + whether each field is
   *  set; fetch the values on demand via the per-login reveal endpoint. */
  logins: ClientPlatformLoginSummary[];
  notes: string | null;
  previewImageUrl: string | null;
  /** When true, this platform's prod + staging URLs surface as buttons in the wiki header. */
  featuredInWiki: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A login on a platform, sans plaintext (list/summary shape). */
export interface ClientPlatformLoginSummary {
  id: string;
  label: string | null;
  hasUsername: boolean;
  hasPassword: boolean;
}

/** Decrypted platform credentials — returned only by the reveal endpoint, never the list. */
export interface ClientPlatformReveal {
  username: string | null;
  password: string | null;
}

export interface ClientDesignRecord {
  id: string;
  clientId: string;
  name: string;
  url: string | null;
  notes: string | null;
  previewImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientPulseScanSummary {
  id: string;
  projectName: string;
  healthScore: number | null;
  status: string;
  createdAt: string;
}

export interface ClientSupportSummary {
  id: string;
  name: string;
  slug: string;
}

export interface ClientPlacementRecord {
  id: string;
  candidateId: string;
  candidateName: string;
  clientName: string;
  projectName: string;
  startDate: string;
  endDate: string | null;
  allocationPercent: number;
  notes: string | null;
  updatedAt: string;
}

export interface ClientStudySummary {
  id: string;
  title: string;
  problemStatement: string;
  status: string;
  sessionMode: string;
  selectedPersonaIds: string[];
  createdAt: string;
  sessionCount: number;
  completedSessionCount: number;
}

export interface ClientLifecycleEvent {
  id: string;
  label: string;
  detail: string;
  at: string;
  status: "done" | "ready" | "waiting";
}

export interface ClientDetailRecord {
  client: ClientListItem & ClientDetailFields;
  lifecycle: ClientLifecycleEvent[];
  platforms: ClientPlatformRecord[];
  designs: ClientDesignRecord[];
  proposals: ProposalListItem[];
  proofDocuments: ProofDocumentRecord[];
  pulseScans: ClientPulseScanSummary[];
  supportClient: ClientSupportSummary | null;
  placements: ClientPlacementRecord[];
  studies: ClientStudySummary[];
  /** CRM activity log — present for leads; empty for other clients. */
  touchpoints: ClientTouchpoint[];
}
