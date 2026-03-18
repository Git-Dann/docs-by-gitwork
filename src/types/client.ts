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
