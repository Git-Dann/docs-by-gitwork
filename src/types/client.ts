import type { ProposalListItem } from "@/types/proposal";
import type { ProofDocumentRecord } from "@/lib/proof";

export type ClientSource = "SUGGESTED" | "MANUAL";

export type WorkspaceClientStatus = "PENDING_REVIEW" | "ACTIVE" | "ARCHIVED";

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
  /** Assigned devs that contributed a rate. */
  pricedDevs: number;
  /** Assigned devs with no matched rate (excluded from `amount`). */
  unpricedDevs: number;
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

export interface ClientDetailFields {
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
  credentials: string | null;
  notes: string | null;
  previewImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
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
}
