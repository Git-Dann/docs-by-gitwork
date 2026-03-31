export type RateBillingPeriod = "DAY" | "WEEK" | "MONTH";

export interface RateCardPersonRecord {
  id: string;
  workspaceId: string;
  seedIdentifier: string | null;
  name: string;
  area: string;
  sourceRate: number;
  sourceCurrencyCode: string;
  billingPeriod: RateBillingPeriod;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RateCardPeopleResponse {
  people: RateCardPersonRecord[];
}
