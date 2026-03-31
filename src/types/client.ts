import type { ProposalListItem } from "@/types/proposal";
import type { ProofDocumentRecord } from "@/lib/proof";

export type ClientSource = "SUGGESTED";

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
}

export interface ClientDetailRecord {
  client: ClientListItem;
  proposals: ProposalListItem[];
  proofDocuments: ProofDocumentRecord[];
}
