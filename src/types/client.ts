import type { ProposalListItem } from "@/types/proposal";
import type { ProofDocumentRecord } from "@/lib/proof";

export interface ClientRecord {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClientListItem extends ClientRecord {
  proposalCount: number;
}

export interface ClientDetailRecord {
  client: ClientListItem;
  proposals: ProposalListItem[];
  proofDocuments: ProofDocumentRecord[];
}
