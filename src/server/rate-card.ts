import { Prisma, type RateCardPerson } from "@prisma/client";
import type { RateCardPersonRecord } from "@/types/rate-card";

type SeedRateCardPerson = {
  seedIdentifier: string;
  name: string;
  area: string;
  sourceRate: number;
  sourceCurrencyCode: string;
  billingPeriod: "DAY" | "WEEK" | "MONTH";
};

// Canonical Gitwork dev roster — order matches the Slack member list.
// Adding/removing devs here is the single source of truth; the candidate seed
// in src/server/codeclear.ts derives its CodeClear roster from this list.
export const defaultRateCardPeople: SeedRateCardPerson[] = [
  {
    seedIdentifier: "gitwork.shahab",
    name: "Shahab",
    area: "Senior • Frontend, Backend, AI, DevOps",
    sourceRate: 1900,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  // Muneeb removed from the roster — see demo-cleanup.ts for one-shot sweep.
  {
    seedIdentifier: "gitwork.waqar",
    name: "Waqar",
    area: "Mid Level • Frontend, Backend, AI, DevOps",
    sourceRate: 1500,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.fahad",
    name: "Fahad",
    area: "Senior • Flutter, AI, DevOps",
    sourceRate: 1900,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.nasir",
    name: "Nasir",
    area: "Senior • iOS Native, DevOps",
    sourceRate: 1900,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.mustaqeem",
    name: "Mustaqeem",
    area: "Junior • Frontend, Backend",
    sourceRate: 1300,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.jamal",
    name: "Jamal",
    area: "Mid Level • Frontend, Backend, AI, DevOps",
    sourceRate: 1500,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.wasey",
    name: "Wasey",
    area: "Junior • Frontend, Backend",
    sourceRate: 1300,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.hamza-ahmed",
    name: "Hamza Ahmed",
    area: "Junior • Frontend, Backend, AI",
    sourceRate: 1300,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  // Waqas Ali removed from the roster — see demo-cleanup.ts for one-shot sweep.
  {
    seedIdentifier: "gitwork.ehtasham-razzaq",
    name: "Ehtasham Razzaq",
    area: "Mid Level • Frontend, Backend, AI, DevOps",
    sourceRate: 1500,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  // Atisham Ahmed removed from the roster — see demo-cleanup.ts for one-shot sweep.
  {
    seedIdentifier: "gitwork.liaquat",
    name: "Liaquat",
    area: "Junior • Frontend, Backend",
    sourceRate: 1300,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.umer-fayyaz",
    name: "Umer Fayyaz",
    area: "Mid Level • Frontend, Backend, AI",
    sourceRate: 1500,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.mohammed-shahbaz",
    name: "Mohammed Shahbaz",
    area: "Junior • Flutter, Frontend, Backend, DevOps",
    sourceRate: 1300,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.abdur-rehman",
    name: "Abdur Rehman",
    area: "Mid Level • Frontend, Backend, AI",
    sourceRate: 1500,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.abdullah-irshad",
    name: "Abdullah irshad",
    area: "Junior • Frontend, Backend, AI",
    sourceRate: 1300,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.ali-sher",
    name: "Ali Sher",
    area: "Mid Level • iOS Native",
    sourceRate: 1500,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.roohullah",
    name: "RoohUllah",
    area: "Junior • Frontend, Backend, AI",
    sourceRate: 1300,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.tahir",
    name: "Tahir",
    area: "Mid Level • Flutter, Frontend, Backend, DevOps",
    sourceRate: 1500,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
  {
    seedIdentifier: "gitwork.ali-asghar",
    name: "Ali Asghar",
    area: "Mid Level • Frontend, Backend, AI, DevOps",
    sourceRate: 1500,
    sourceCurrencyCode: "USD",
    billingPeriod: "MONTH",
  },
];

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value.toString());
}

export function serializeRateCardPerson(person: RateCardPerson): RateCardPersonRecord {
  return {
    id: person.id,
    workspaceId: person.workspaceId,
    seedIdentifier: person.seedIdentifier ?? null,
    name: person.name,
    area: person.area,
    sourceRate: decimalToNumber(person.sourceRate),
    sourceCurrencyCode: person.sourceCurrencyCode,
    billingPeriod: person.billingPeriod,
    archivedAt: person.archivedAt?.toISOString() ?? null,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

export function getDefaultRateCardPeoplePayload(
  workspaceId: string,
): Prisma.RateCardPersonCreateManyInput[] {
  return defaultRateCardPeople.map((person) => ({
    workspaceId,
    seedIdentifier: person.seedIdentifier,
    name: person.name,
    area: person.area,
    sourceRate: new Prisma.Decimal(person.sourceRate),
    sourceCurrencyCode: person.sourceCurrencyCode,
    billingPeriod: person.billingPeriod,
  }));
}
