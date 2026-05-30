import type { ProposalListItem } from "@/types/proposal";
import type { ProofDocumentRecord } from "@/lib/proof";

export type ClientSource = "SUGGESTED" | "MANUAL";

export interface ClientRecord {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
  source: ClientSource;
}

export interface ClientListItem extends ClientRecord {
  proposalCount: number;
  googleDriveFolderUrl: string | null;
  clickupUrl: string | null;
}

export interface ClientDetailFields {
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  notes: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  googleDriveFolderUrl: string | null;
  clickupUrl: string | null;
  slackChannelId: string | null;
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

export interface ClientDetailRecord {
  client: ClientListItem & ClientDetailFields;
  platforms: ClientPlatformRecord[];
  designs: ClientDesignRecord[];
  proposals: ProposalListItem[];
  proofDocuments: ProofDocumentRecord[];
  pulseScans: ClientPulseScanSummary[];
  supportClient: ClientSupportSummary | null;
  placements: ClientPlacementRecord[];
  studies: ClientStudySummary[];
}
