import { unstable_cache, revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { getClientLookupKey, normalizeClientName, slugifyClientName } from "@/lib/clients";
import { prisma } from "@/lib/prisma";
import { decryptNullable } from "@/lib/encryption";
import type {
  ClientBankReveal,
  ClientBankSummary,
  ClientDesignRecord,
  ClientDetailFields,
  ClientDetailRecord,
  ClientListItem,
  ClientPlacementRecord,
  ClientPlatformRecord,
  ClientSource,
  WorkspaceClientStatus,
} from "@/types/client";
import { ensureBaseRecords } from "@/server/bootstrap";
import { proofDocumentInclude, serializeProofDocument } from "@/server/proof";
import { serializeProposalListItem } from "@/server/proposals";
import { computeClientDevCounts, computeClientFinancials } from "@/server/client-metrics";

const clientBankAccounts = (prisma as unknown as {
  clientBankAccount: Prisma.ClientBankAccountDelegate;
}).clientBankAccount;

const onboardings = (prisma as unknown as {
  clientOnboarding: Prisma.ClientOnboardingDelegate;
}).clientOnboarding;

const clientProposalInclude = {
  template: {
    select: {
      name: true,
    },
  },
  owner: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.DocumentInclude;

const workspaceClients = (prisma as unknown as {
  workspaceClient: Prisma.WorkspaceClientDelegate;
}).workspaceClient;

const clientPlatforms = (prisma as unknown as {
  clientPlatform: Prisma.ClientPlatformDelegate;
}).clientPlatform;

const clientDesigns = (prisma as unknown as {
  clientDesign: Prisma.ClientDesignDelegate;
}).clientDesign;

type ClientAggregateRecord = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
  proposalCount: number;
  source: ClientSource;
  status: WorkspaceClientStatus;
  googleDriveFolderUrl: string | null;
  clickupUrl: string | null;
};

type ManualClientRecord = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
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
  invoiceEmail: string | null;
  googleDriveFolderUrl: string | null;
  clickupUrl: string | null;
  slackChannelId: string | null;
  slackInternalChannelId: string | null;
  slackInternalChannelName: string | null;
  slackExternalChannelId: string | null;
  slackExternalChannelName: string | null;
  slackProvisionError: string | null;
  legalCompanyName: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingCounty: string | null;
  billingPostcode: string | null;
  billingCountry: string | null;
  retainerDays: number | null;
  retainerDaysUsed: number | null;
  status: WorkspaceClientStatus;
  createdAt: Date;
  updatedAt: Date;
};

type ClientContactInput = {
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  county?: string;
  postcode?: string;
  country?: string;
  notes?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  invoiceEmail?: string;
  googleDriveFolderUrl?: string;
  clickupUrl?: string;
  slackChannelId?: string;
  slackInternalChannelId?: string;
  slackInternalChannelName?: string;
  slackExternalChannelId?: string;
  slackExternalChannelName?: string;
  legalCompanyName?: string;
  companyNumber?: string;
  vatNumber?: string;
  billingAddressLine1?: string;
  billingAddressLine2?: string;
  billingCity?: string;
  billingCounty?: string;
  billingPostcode?: string;
  billingCountry?: string;
  retainerDays?: number | null;
  retainerDaysUsed?: number | null;
};

function emptyContactFields(): ClientDetailFields {
  return {
    website: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    county: null,
    postcode: null,
    country: null,
    notes: null,
    primaryContactName: null,
    primaryContactEmail: null,
    primaryContactPhone: null,
    invoiceEmail: null,
    googleDriveFolderUrl: null,
    clickupUrl: null,
    slackChannelId: null,
    slackInternalChannelId: null,
    slackInternalChannelName: null,
    slackExternalChannelId: null,
    slackExternalChannelName: null,
    slackProvisionError: null,
    legalCompanyName: null,
    companyNumber: null,
    vatNumber: null,
    billingAddressLine1: null,
    billingAddressLine2: null,
    billingCity: null,
    billingCounty: null,
    billingPostcode: null,
    billingCountry: null,
    retainerDays: null,
    retainerDaysUsed: null,
    bank: null,
    onboardingId: null,
  };
}

function contactFieldsFromRecord(
  record: ManualClientRecord,
  extras: { bank: ClientBankSummary | null; onboardingId: string | null },
): ClientDetailFields {
  return {
    website: record.website,
    addressLine1: record.addressLine1,
    addressLine2: record.addressLine2,
    city: record.city,
    county: record.county,
    postcode: record.postcode,
    country: record.country,
    notes: record.notes,
    primaryContactName: record.primaryContactName,
    primaryContactEmail: record.primaryContactEmail,
    primaryContactPhone: record.primaryContactPhone,
    invoiceEmail: record.invoiceEmail,
    googleDriveFolderUrl: record.googleDriveFolderUrl,
    clickupUrl: record.clickupUrl,
    slackChannelId: record.slackChannelId,
    slackInternalChannelId: record.slackInternalChannelId,
    slackInternalChannelName: record.slackInternalChannelName,
    slackExternalChannelId: record.slackExternalChannelId,
    slackExternalChannelName: record.slackExternalChannelName,
    slackProvisionError: record.slackProvisionError,
    legalCompanyName: record.legalCompanyName,
    companyNumber: record.companyNumber,
    vatNumber: record.vatNumber,
    billingAddressLine1: record.billingAddressLine1,
    billingAddressLine2: record.billingAddressLine2,
    billingCity: record.billingCity,
    billingCounty: record.billingCounty,
    billingPostcode: record.billingPostcode,
    billingCountry: record.billingCountry,
    retainerDays: record.retainerDays,
    retainerDaysUsed: record.retainerDaysUsed,
    bank: extras.bank,
    onboardingId: extras.onboardingId,
  };
}

function buildContactData(input: ClientContactInput) {
  // Only include fields that were explicitly provided — omitting a field must
  // not overwrite an existing DB value with null on a partial PATCH.
  // Retainer keys are numeric (Int? columns); every other contact field is a string column.
  const data: Partial<{
    [K in keyof ClientContactInput]: K extends "retainerDays" | "retainerDaysUsed"
      ? number | null
      : string | null;
  }> = {};
  const trim = (v: string) => v.trim() || null;
  if (input.website !== undefined)             data.website             = trim(input.website);
  if (input.addressLine1 !== undefined)        data.addressLine1        = trim(input.addressLine1);
  if (input.addressLine2 !== undefined)        data.addressLine2        = trim(input.addressLine2);
  if (input.city !== undefined)                data.city                = trim(input.city);
  if (input.county !== undefined)              data.county              = trim(input.county);
  if (input.postcode !== undefined)            data.postcode            = trim(input.postcode);
  if (input.country !== undefined)             data.country             = trim(input.country);
  if (input.notes !== undefined)               data.notes               = trim(input.notes);
  if (input.primaryContactName !== undefined)  data.primaryContactName  = trim(input.primaryContactName);
  if (input.primaryContactEmail !== undefined) data.primaryContactEmail = trim(input.primaryContactEmail);
  if (input.primaryContactPhone !== undefined) data.primaryContactPhone = trim(input.primaryContactPhone);
  if (input.invoiceEmail !== undefined)        data.invoiceEmail        = trim(input.invoiceEmail);
  if (input.googleDriveFolderUrl !== undefined) data.googleDriveFolderUrl = trim(input.googleDriveFolderUrl);
  if (input.clickupUrl !== undefined)          data.clickupUrl          = trim(input.clickupUrl);
  if (input.slackChannelId !== undefined)      data.slackChannelId      = trim(input.slackChannelId);
  if (input.slackInternalChannelId !== undefined)
    data.slackInternalChannelId = trim(input.slackInternalChannelId);
  if (input.slackInternalChannelName !== undefined)
    data.slackInternalChannelName = trim(input.slackInternalChannelName);
  if (input.slackExternalChannelId !== undefined)
    data.slackExternalChannelId = trim(input.slackExternalChannelId);
  if (input.slackExternalChannelName !== undefined)
    data.slackExternalChannelName = trim(input.slackExternalChannelName);
  if (input.legalCompanyName !== undefined)    data.legalCompanyName    = trim(input.legalCompanyName);
  if (input.companyNumber !== undefined)       data.companyNumber       = trim(input.companyNumber);
  if (input.vatNumber !== undefined)           data.vatNumber           = trim(input.vatNumber);
  if (input.billingAddressLine1 !== undefined) data.billingAddressLine1 = trim(input.billingAddressLine1);
  if (input.billingAddressLine2 !== undefined) data.billingAddressLine2 = trim(input.billingAddressLine2);
  if (input.billingCity !== undefined)         data.billingCity         = trim(input.billingCity);
  if (input.billingCounty !== undefined)       data.billingCounty       = trim(input.billingCounty);
  if (input.billingPostcode !== undefined)     data.billingPostcode     = trim(input.billingPostcode);
  if (input.billingCountry !== undefined)      data.billingCountry      = trim(input.billingCountry);
  // Numeric retainer fields — pass through (0 is valid; null clears). No trim.
  if (input.retainerDays !== undefined)        data.retainerDays        = input.retainerDays;
  if (input.retainerDaysUsed !== undefined)    data.retainerDaysUsed    = input.retainerDaysUsed;
  return data;
}

function summarizeSuggestedClients(
  proposals: Array<{
    clientName: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
): Map<string, ClientAggregateRecord> {
  const clients = new Map<string, ClientAggregateRecord>();

  for (const proposal of proposals) {
    const name = normalizeClientName(proposal.clientName);
    const key = getClientLookupKey(name);

    if (!key) {
      continue;
    }

    const createdAt = proposal.createdAt.toISOString();
    const updatedAt = proposal.updatedAt.toISOString();
    const existing = clients.get(key);

    if (existing) {
      existing.proposalCount += 1;
      if (createdAt < existing.createdAt) {
        existing.createdAt = createdAt;
      }
      if (updatedAt > existing.updatedAt) {
        existing.updatedAt = updatedAt;
        existing.name = name;
        existing.slug = slugifyClientName(name);
      }
      continue;
    }

    clients.set(key, {
      id: `client_${slugifyClientName(name)}`,
      name,
      slug: slugifyClientName(name),
      createdAt,
      updatedAt,
      proposalCount: 1,
      source: "SUGGESTED",
      status: "ACTIVE",
      googleDriveFolderUrl: null,
      clickupUrl: null,
    });
  }

  return clients;
}

function mergeClients(
  manualClients: ManualClientRecord[],
  proposals: Array<{
    clientName: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
  hiddenSlugs = new Set<string>(),
): ClientAggregateRecord[] {
  const merged = summarizeSuggestedClients(proposals);

  // Suppress SUGGESTED clients that have been hidden via the hidden flag
  for (const [key, client] of [...merged.entries()]) {
    if (hiddenSlugs.has(client.slug)) {
      merged.delete(key);
    }
  }

  for (const manualClient of manualClients) {
    const key = getClientLookupKey(manualClient.name);
    const suggested = merged.get(key);
    const updatedAt = new Date(
      Math.max(
        manualClient.updatedAt.getTime(),
        suggested ? new Date(suggested.updatedAt).getTime() : 0,
      ),
    ).toISOString();

    merged.set(key, {
      id: manualClient.id,
      name: manualClient.name,
      slug: manualClient.slug,
      logoUrl: manualClient.logoUrl ?? undefined,
      createdAt: manualClient.createdAt.toISOString(),
      updatedAt,
      proposalCount: suggested?.proposalCount ?? 0,
      source: "MANUAL",
      status: manualClient.status,
      googleDriveFolderUrl: manualClient.googleDriveFolderUrl,
      clickupUrl: manualClient.clickupUrl,
    });
  }

  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function toClientListItem(client: ClientAggregateRecord): ClientListItem {
  return {
    id: client.id,
    name: client.name,
    slug: client.slug,
    logoUrl: client.logoUrl,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    proposalCount: client.proposalCount,
    source: client.source,
    status: client.status,
    googleDriveFolderUrl: client.googleDriveFolderUrl,
    clickupUrl: client.clickupUrl,
    hasCareClient: false, // overridden by listDerivedClients
    repoUrls: [],        // overridden by listDerivedClients
    devCount: 0,         // overridden by listDerivedClients
    monthlyCost: null,   // set by listDerivedClients only for authorized viewers
    workingDays: null,   // set by listDerivedClients only for authorized viewers
    retainerDays: null,  // set by listDerivedClients only for authorized viewers
    retainerDaysUsed: null,
  };
}

function serializeClientDesign(design: {
  id: string;
  clientId: string;
  name: string;
  url: string | null;
  notes: string | null;
  previewImageUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ClientDesignRecord {
  return {
    id: design.id,
    clientId: design.clientId,
    name: design.name,
    url: design.url,
    notes: design.notes,
    previewImageUrl: design.previewImageUrl ?? null,
    createdAt: design.createdAt.toISOString(),
    updatedAt: design.updatedAt.toISOString(),
  };
}

function serializeClientPlatform(platform: {
  id: string;
  clientId: string;
  name: string;
  platformType: string | null;
  url: string | null;
  stagingUrl: string | null;
  repoUrl: string | null;
  credentials: string | null;
  notes: string | null;
  previewImageUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ClientPlatformRecord {
  return {
    id: platform.id,
    clientId: platform.clientId,
    name: platform.name,
    platformType: platform.platformType,
    url: platform.url,
    stagingUrl: platform.stagingUrl,
    repoUrl: platform.repoUrl,
    credentials: platform.credentials,
    notes: platform.notes,
    previewImageUrl: platform.previewImageUrl ?? null,
    createdAt: platform.createdAt.toISOString(),
    updatedAt: platform.updatedAt.toISOString(),
  };
}

async function _loadClientCollectionsInner(workspaceId: string) {
  const [allClients, proposals] = await Promise.all([
    workspaceClients.findMany({
      where: { workspaceId },
      orderBy: { name: "asc" },
    }),
    prisma.document.findMany({
      where: {
        workspaceId,
        documentType: "PROPOSAL",
        clientName: { not: null },
      },
      select: {
        clientName: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const typedClients = allClients as Array<ManualClientRecord & { hidden: boolean }>;
  const manualClients = typedClients.filter((c) => !c.hidden) as ManualClientRecord[];
  const hiddenSlugs = [...typedClients.filter((c) => c.hidden).map((c) => c.slug)];

  return { manualClients, hiddenSlugs, proposals };
}

// Cache the expensive proposals + clients fetch for 60 seconds. The full
// client list is the same for all callers (per-user scoping happens in the
// API route after the cache hit). Invalidated on every client mutation via
// `revalidateTag("client-collections")`.
const _cachedLoadCollections = unstable_cache(
  _loadClientCollectionsInner,
  ["client-collections"],
  { revalidate: 60, tags: ["client-collections"] },
);

async function loadClientCollections() {
  const { workspace } = await ensureBaseRecords();
  const raw = await _cachedLoadCollections(workspace.id);
  // unstable_cache JSON-serialises the return value, turning Date objects into
  // ISO strings. Re-hydrate them so callers (mergeClients, toClientListItem)
  // get the Date instances they expect.
  return {
    workspace,
    manualClients: raw.manualClients.map((c) => ({
      ...c,
      createdAt: new Date(c.createdAt as unknown as string),
      updatedAt: new Date(c.updatedAt as unknown as string),
    })) as ManualClientRecord[],
    hiddenSlugs: new Set(raw.hiddenSlugs),
    proposals: raw.proposals.map((p) => ({
      ...p,
      createdAt: new Date(p.createdAt as unknown as string),
      updatedAt: new Date(p.updatedAt as unknown as string),
    })),
  };
}

async function assertClientSlugAvailable(
  workspaceId: string,
  slug: string,
  currentId?: string,
) {
  const existing = await workspaceClients.findUnique({
    where: {
      workspaceId_slug: {
        workspaceId,
        slug,
      },
    },
  });

  if (existing && existing.id !== currentId) {
    throw new Error("A client with this name already exists.");
  }
}

export async function listDerivedClients(filters?: {
  search?: string;
  /** Filter by client status. Default: ACTIVE only. Pass "ALL" to include every status. */
  status?: WorkspaceClientStatus | "ALL";
  /** Compute + include the sensitive monthlyCost/workingDays fields. The caller MUST have
   *  verified `clients.viewFinancials` (or Super Admin) first. Default false. */
  includeFinancials?: boolean;
}): Promise<{ clients: ClientListItem[] }> {
  const { workspace, manualClients, hiddenSlugs, proposals } = await loadClientCollections();
  const search = filters?.search?.trim().toLowerCase() ?? "";
  const statusFilter = filters?.status ?? "ACTIVE";
  const includeFinancials = filters?.includeFinancials ?? false;

  const merged = mergeClients(manualClients, proposals, hiddenSlugs);
  const manualClientMeta = merged
    .filter((c) => c.source === "MANUAL")
    .map((c) => ({ id: c.id }));
  const manualIds = manualClientMeta.map((c) => c.id);

  // Parallel enrichment queries — single round-trip.
  const [careRecords, platformRepos, devCounts, financials] = await Promise.all([
    // Which portal clients have a linked Care client (FK on SupportClient).
    prisma.supportClient.findMany({
      where: { workspaceClientId: { not: null } },
      select: { workspaceClientId: true },
    }),
    // All non-null repoUrls from platforms belonging to manual clients.
    prisma.clientPlatform.findMany({
      where: { clientId: { in: manualIds }, repoUrl: { not: null } },
      select: { clientId: true, repoUrl: true, name: true },
    }),
    // Assigned-dev count per client (always shown on cards).
    computeClientDevCounts(workspace.id, manualIds),
    // Sensitive monthly cost + working days — only for authorized viewers.
    includeFinancials
      ? computeClientFinancials(workspace.id, manualClientMeta)
      : Promise.resolve(null),
  ]);

  const careIds = new Set(
    careRecords.map((r) => r.workspaceClientId).filter(Boolean),
  );

  // Group repo URLs by client
  const reposByClientId = new Map<string, string[]>();
  for (const p of platformRepos) {
    if (!p.repoUrl) continue;
    const list = reposByClientId.get(p.clientId) ?? [];
    list.push(p.repoUrl);
    reposByClientId.set(p.clientId, list);
  }

  // Retainer (allowance + used this month) by client id — manual fields, surfaced
  // only to authorised viewers (gated below alongside cost/working days).
  const retainerByClient = new Map(
    manualClients.map(
      (c) => [c.id, { retainerDays: c.retainerDays, retainerDaysUsed: c.retainerDaysUsed }] as const,
    ),
  );

  const clients = merged
    .filter((client) => {
      if (statusFilter !== "ALL" && client.status !== statusFilter) {
        return false;
      }
      if (!search) return true;
      return client.name.toLowerCase().includes(search);
    })
    .map((client) => {
      const financial = financials?.get(client.id);
      return {
        ...toClientListItem(client),
        hasCareClient: careIds.has(client.id),
        repoUrls: reposByClientId.get(client.id) ?? [],
        devCount: devCounts.get(client.id) ?? 0,
        monthlyCost: financial ? financial.monthlyCost : null,
        workingDays: financial ? financial.workingDays : null,
        retainerDays: includeFinancials ? (retainerByClient.get(client.id)?.retainerDays ?? null) : null,
        retainerDaysUsed: includeFinancials ? (retainerByClient.get(client.id)?.retainerDaysUsed ?? null) : null,
      };
    });

  return { clients };
}

export async function createClientRecord(input: {
  name: string;
  logoUrl?: string;
  /** Phase 3: optional Slack channel provisioning. Failures are non-blocking — the
   *  client is created even if Slack fails; the error lands on `slackProvisionError`. */
  createInternalChannel?: boolean;
  createExternalChannel?: boolean;
  externalInviteeEmail?: string;
  customInternalName?: string;
  customExternalName?: string;
} & ClientContactInput): Promise<ClientListItem> {
  const { workspace, proposals } = await loadClientCollections();
  const name = normalizeClientName(input.name);
  const slug = slugifyClientName(name);
  const clientKey = getClientLookupKey(name);

  await assertClientSlugAvailable(workspace.id, slug);

  const client = await workspaceClients.create({
    data: {
      workspaceId: workspace.id,
      name,
      slug,
      logoUrl: input.logoUrl?.trim() || null,
      ...buildContactData(input),
    },
  });

  // Best-effort Slack channel provisioning. Dispatched via after() so the API
  // response returns immediately — failures stamp slackProvisionError but never
  // block client creation. (provisionClientChannels lives in src/server/slack/.)
  if (input.createInternalChannel || input.createExternalChannel) {
    const { provisionClientChannels } = await import("@/server/slack/provisioning");
    const { after } = await import("next/server");
    after(() =>
      provisionClientChannels(client.id, {
        createInternal: input.createInternalChannel,
        createExternal: input.createExternalChannel,
        externalInviteeEmail: input.externalInviteeEmail,
        customInternalName: input.customInternalName,
        customExternalName: input.customExternalName,
      }).catch((err) => console.warn("[slack] provisioning failed", err)),
    );
  }

  const proposalCount = proposals.filter(
    (proposal) => getClientLookupKey(proposal.clientName) === clientKey,
  ).length;

  revalidateTag("client-collections");
  return toClientListItem({
    id: client.id,
    name: client.name,
    slug: client.slug,
    logoUrl: client.logoUrl ?? undefined,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    proposalCount,
    source: "MANUAL",
    status: (client as typeof client & { status?: WorkspaceClientStatus }).status ?? "ACTIVE",
    googleDriveFolderUrl: client.googleDriveFolderUrl,
    clickupUrl: client.clickupUrl,
  });
}

export async function updateClientRecord(
  slug: string,
  input: {
    name?: string;
    logoUrl?: string;
  } & ClientContactInput,
): Promise<ClientListItem | null> {
  const { workspace, manualClients, hiddenSlugs, proposals } = await loadClientCollections();
  const mergedClients = mergeClients(manualClients, proposals, hiddenSlugs);
  const current = mergedClients.find((client) => client.slug === slug);

  if (!current) {
    return null;
  }

  const nextName = normalizeClientName(input.name ?? current.name);
  const nextSlug = slugifyClientName(nextName);
  const manualClient = manualClients.find((client) => client.slug === slug);

  await assertClientSlugAvailable(workspace.id, nextSlug, manualClient?.id);

  const contactData = buildContactData(input);

  const persisted = manualClient
    ? await workspaceClients.update({
        where: {
          workspaceId_slug: {
            workspaceId: workspace.id,
            slug,
          },
        },
        data: {
          name: nextName,
          slug: nextSlug,
          ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl.trim() || null } : {}),
          ...contactData,
        },
      })
    : await workspaceClients.create({
        data: {
          workspaceId: workspace.id,
          name: nextName,
          slug: nextSlug,
          logoUrl: input.logoUrl?.trim() || null,
          ...contactData,
        },
      });

  const updatedClients = mergeClients(
    manualClient
      ? manualClients.map((client) =>
          client.id === persisted.id
            ? {
                ...client,
                name: persisted.name,
                slug: persisted.slug,
                logoUrl: persisted.logoUrl,
                updatedAt: persisted.updatedAt,
                googleDriveFolderUrl: persisted.googleDriveFolderUrl,
                clickupUrl: persisted.clickupUrl,
              }
            : client,
        )
      : [
          ...manualClients,
          {
            id: persisted.id,
            name: persisted.name,
            slug: persisted.slug,
            logoUrl: persisted.logoUrl,
            website: null,
            addressLine1: null,
            addressLine2: null,
            city: null,
            county: null,
            postcode: null,
            country: null,
            notes: null,
            primaryContactName: null,
            primaryContactEmail: null,
            primaryContactPhone: null,
            invoiceEmail: null,
            googleDriveFolderUrl: persisted.googleDriveFolderUrl,
            clickupUrl: persisted.clickupUrl,
            slackChannelId: persisted.slackChannelId,
            slackInternalChannelId: (persisted as typeof persisted & { slackInternalChannelId: string | null }).slackInternalChannelId ?? null,
            slackInternalChannelName: (persisted as typeof persisted & { slackInternalChannelName: string | null }).slackInternalChannelName ?? null,
            slackExternalChannelId: (persisted as typeof persisted & { slackExternalChannelId: string | null }).slackExternalChannelId ?? null,
            slackExternalChannelName: (persisted as typeof persisted & { slackExternalChannelName: string | null }).slackExternalChannelName ?? null,
            slackProvisionError: (persisted as typeof persisted & { slackProvisionError: string | null }).slackProvisionError ?? null,
            legalCompanyName: (persisted as typeof persisted & { legalCompanyName: string | null }).legalCompanyName ?? null,
            companyNumber: (persisted as typeof persisted & { companyNumber: string | null }).companyNumber ?? null,
            vatNumber: (persisted as typeof persisted & { vatNumber: string | null }).vatNumber ?? null,
            billingAddressLine1: null,
            billingAddressLine2: null,
            billingCity: null,
            billingCounty: null,
            billingPostcode: null,
            billingCountry: null,
            retainerDays: null,
            retainerDaysUsed: null,
            status: (persisted as typeof persisted & { status: WorkspaceClientStatus }).status ?? "ACTIVE",
            createdAt: persisted.createdAt,
            updatedAt: persisted.updatedAt,
          },
        ],
    proposals,
    hiddenSlugs,
  );

  revalidateTag("client-collections");
  return toClientListItem(
    updatedClients.find((client) => client.slug === persisted.slug) ?? {
      id: persisted.id,
      name: persisted.name,
      slug: persisted.slug,
      logoUrl: persisted.logoUrl ?? undefined,
      createdAt: persisted.createdAt.toISOString(),
      updatedAt: persisted.updatedAt.toISOString(),
      proposalCount: 0,
      source: "MANUAL",
      status: (persisted as typeof persisted & { status?: WorkspaceClientStatus }).status ?? "ACTIVE",
      googleDriveFolderUrl: persisted.googleDriveFolderUrl,
      clickupUrl: persisted.clickupUrl,
    },
  );
}

export async function deleteClientRecord(slug: string): Promise<boolean> {
  const { workspace, proposals } = await loadClientCollections();

  // Check for an existing DB row (may be MANUAL or already a hidden suppression record)
  const existing = await workspaceClients.findFirst({
    where: { workspaceId: workspace.id, slug },
  });

  if (existing) {
    if (!(existing as typeof existing & { hidden: boolean }).hidden) {
      await workspaceClients.update({
        where: { id: existing.id },
        data: { hidden: true },
      });
    }
    return true;
  }

  // SUGGESTED client — no DB row exists; create a hidden suppression record so it
  // doesn't re-surface from proposal clientName references.
  const matchingProposal = proposals.find(
    (p) => p.clientName && slugifyClientName(normalizeClientName(p.clientName)) === slug,
  );

  if (!matchingProposal) {
    return false;
  }

  const clientName = normalizeClientName(matchingProposal.clientName!);

  await workspaceClients.create({
    data: {
      workspaceId: workspace.id,
      name: clientName,
      slug,
      hidden: true,
    },
  });

  revalidateTag("client-collections");
  return true;
}

export async function getDerivedClientDetail(slug: string): Promise<ClientDetailRecord | null> {
  const { workspace, manualClients, hiddenSlugs } = await loadClientCollections();

  const proposals = await prisma.document.findMany({
    where: {
      workspaceId: workspace.id,
      documentType: { in: ["PROPOSAL", "SOW", "MSA", "NDA", "DSA"] },
      OR: [{ clientName: { not: null } }, { clientId: { not: null } }],
    },
    include: clientProposalInclude,
    orderBy: {
      updatedAt: "desc",
    },
  });

  const client = mergeClients(manualClients, proposals, hiddenSlugs).find((entry) => entry.slug === slug);
  if (!client) {
    return null;
  }

  const clientKey = getClientLookupKey(client.name);
  const manualRecord = manualClients.find((c) => c.slug === slug) ?? null;

  // Match proposals by FK (preferred) or legacy name match
  const matchingProposals = proposals.filter(
    (proposal) =>
      (manualRecord && proposal.clientId === manualRecord.id) ||
      getClientLookupKey(proposal.clientName) === clientKey,
  );

  const [proofDocuments, platforms, designs, pulseScans, supportClient, placements, studies, bank, onboardingRow] = await Promise.all([
    matchingProposals.length > 0
      ? prisma.proofDocument.findMany({
          where: {
            proposalId: {
              in: matchingProposals.map((proposal) => proposal.id),
            },
          },
          include: proofDocumentInclude,
          orderBy: {
            lastOpenedAt: "desc",
          },
        })
      : Promise.resolve([]),
    manualRecord
      ? clientPlatforms.findMany({
          where: { clientId: manualRecord.id },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    manualRecord
      ? clientDesigns.findMany({
          where: { clientId: manualRecord.id },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    manualRecord
      ? prisma.pulseScan.findMany({
          where: { clientId: manualRecord.id },
          select: {
            id: true,
            projectName: true,
            healthScore: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    manualRecord
      ? prisma.supportClient.findFirst({
          where: { workspaceClientId: manualRecord.id },
          select: { id: true, name: true, slug: true },
        })
      : Promise.resolve(null),
    manualRecord
      ? prisma.placement.findMany({
          where: { clientId: manualRecord.id },
          include: { candidate: { select: { id: true, name: true } } },
          orderBy: { startDate: "desc" },
        })
      : Promise.resolve([]),
    manualRecord
      ? prisma.study.findMany({
          where: { workspaceClientId: manualRecord.id },
          include: { sessions: { select: { status: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    manualRecord
      ? clientBankAccounts.findUnique({
          where: { clientId: manualRecord.id },
          select: { currency: true, accountNumberLast4: true },
        })
      : Promise.resolve(null),
    manualRecord
      ? onboardings.findUnique({
          where: { workspaceClientId: manualRecord.id },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const bankSummary: ClientBankSummary | null = bank
    ? {
        onFile: true,
        currency: bank.currency ?? null,
        accountNumberLast4: bank.accountNumberLast4 ?? null,
      }
    : null;

  const contactFields: ClientDetailFields = manualRecord
    ? contactFieldsFromRecord(manualRecord, {
        bank: bankSummary,
        onboardingId: onboardingRow?.id ?? null,
      })
    : emptyContactFields();

  const serializedPlacements: ClientPlacementRecord[] = (
    placements as Array<{
      id: string;
      candidateId: string;
      clientName: string;
      projectName: string;
      startDate: Date;
      endDate: Date | null;
      allocationPercent: number;
      notes: string | null;
      updatedAt: Date;
      candidate: { id: string; name: string };
    }>
  ).map((p) => ({
    id: p.id,
    candidateId: p.candidateId,
    candidateName: p.candidate.name,
    clientName: p.clientName,
    projectName: p.projectName,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate?.toISOString() ?? null,
    allocationPercent: p.allocationPercent,
    notes: p.notes,
    updatedAt: p.updatedAt.toISOString(),
  }));

  return {
    client: {
      ...toClientListItem(client),
      ...contactFields,
    },
    platforms: (platforms as Parameters<typeof serializeClientPlatform>[0][]).map(serializeClientPlatform),
    designs: (designs as Parameters<typeof serializeClientDesign>[0][]).map(serializeClientDesign),
    proposals: matchingProposals.map((proposal) => serializeProposalListItem(proposal)),
    proofDocuments: proofDocuments.map((document) => serializeProofDocument(document)),
    pulseScans: pulseScans.map((scan) => ({
      id: scan.id,
      projectName: scan.projectName,
      healthScore: scan.healthScore,
      status: scan.status,
      createdAt: scan.createdAt.toISOString(),
    })),
    supportClient: supportClient ?? null,
    placements: serializedPlacements,
    studies: (studies as Array<{
      id: string;
      title: string;
      problemStatement: string;
      status: string;
      sessionMode: string;
      selectedPersonaIds: string[];
      createdAt: Date;
      sessions: { status: string }[];
    }>).map((s) => ({
      id: s.id,
      title: s.title,
      problemStatement: s.problemStatement,
      status: s.status,
      sessionMode: s.sessionMode,
      selectedPersonaIds: s.selectedPersonaIds,
      createdAt: s.createdAt.toISOString(),
      sessionCount: s.sessions.length,
      completedSessionCount: s.sessions.filter((sess) => sess.status === "COMPLETED").length,
    })),
  };
}

export async function createClientPlatform(
  clientId: string,
  input: {
    name: string;
    platformType?: string;
    url?: string;
    stagingUrl?: string;
    repoUrl?: string;
    credentials?: string;
    notes?: string;
  },
): Promise<ClientPlatformRecord> {
  const platform = await clientPlatforms.create({
    data: {
      clientId,
      name: input.name.trim(),
      platformType: input.platformType?.trim() || null,
      url: input.url?.trim() || null,
      stagingUrl: input.stagingUrl?.trim() || null,
      repoUrl: input.repoUrl?.trim() || null,
      credentials: input.credentials?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });

  return serializeClientPlatform(platform as Parameters<typeof serializeClientPlatform>[0]);
}

export async function updateClientPlatform(
  platformId: string,
  input: {
    name?: string;
    platformType?: string;
    url?: string;
    stagingUrl?: string;
    repoUrl?: string;
    credentials?: string;
    notes?: string;
    previewImageUrl?: string;
  },
): Promise<ClientPlatformRecord | null> {
  const platform = await clientPlatforms.update({
    where: { id: platformId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.platformType !== undefined ? { platformType: input.platformType.trim() || null } : {}),
      ...(input.url !== undefined ? { url: input.url.trim() || null } : {}),
      ...(input.stagingUrl !== undefined ? { stagingUrl: input.stagingUrl.trim() || null } : {}),
      ...(input.repoUrl !== undefined ? { repoUrl: input.repoUrl.trim() || null } : {}),
      ...(input.credentials !== undefined ? { credentials: input.credentials.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
      ...(input.previewImageUrl !== undefined ? { previewImageUrl: input.previewImageUrl || null } : {}),
    },
  });

  return serializeClientPlatform(platform as Parameters<typeof serializeClientPlatform>[0]);
}

export async function deleteClientPlatform(platformId: string): Promise<void> {
  await clientPlatforms.delete({ where: { id: platformId } });
}

export async function createClientDesign(
  clientId: string,
  input: { name: string; url?: string; notes?: string },
): Promise<ClientDesignRecord> {
  const design = await clientDesigns.create({
    data: {
      clientId,
      name: input.name.trim(),
      url: input.url?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  });
  return serializeClientDesign(design as Parameters<typeof serializeClientDesign>[0]);
}

export async function updateClientDesign(
  designId: string,
  input: { name?: string; url?: string; notes?: string; previewImageUrl?: string },
): Promise<ClientDesignRecord | null> {
  const design = await clientDesigns.update({
    where: { id: designId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.url !== undefined ? { url: input.url.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
      ...(input.previewImageUrl !== undefined ? { previewImageUrl: input.previewImageUrl || null } : {}),
    },
  });
  return serializeClientDesign(design as Parameters<typeof serializeClientDesign>[0]);
}

export async function deleteClientDesign(designId: string): Promise<void> {
  await clientDesigns.delete({ where: { id: designId } });
}

export async function getClientIdBySlug(
  workspaceId: string,
  slug: string,
): Promise<string | null> {
  const record = await workspaceClients.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
    select: { id: true },
  });

  return record?.id ?? null;
}

/**
 * Flip the lifecycle status on a client. Moving PENDING_REVIEW → ACTIVE is the
 * "Move to workflow" action; ARCHIVED is the soft-delete that replaces `hidden`
 * for clients created via onboarding.
 */
export async function setClientStatus(
  slug: string,
  status: WorkspaceClientStatus,
): Promise<ClientListItem | null> {
  const { workspace } = await ensureBaseRecords();
  const persisted = await workspaceClients.update({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    data: { status },
  });
  revalidateTag("client-collections");
  return toClientListItem({
    id: persisted.id,
    name: persisted.name,
    slug: persisted.slug,
    logoUrl: persisted.logoUrl ?? undefined,
    createdAt: persisted.createdAt.toISOString(),
    updatedAt: persisted.updatedAt.toISOString(),
    proposalCount: 0,
    source: "MANUAL",
    status: (persisted as typeof persisted & { status: WorkspaceClientStatus }).status,
    googleDriveFolderUrl: persisted.googleDriveFolderUrl,
    clickupUrl: persisted.clickupUrl,
  });
}

/**
 * Decrypt and return the bank account for a client. Caller must be authenticated;
 * this should be invoked from an API route that gates on session and audit-logs
 * the read.
 */
export async function revealClientBank(slug: string): Promise<ClientBankReveal | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await workspaceClients.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  if (!client) return null;
  const bank = await clientBankAccounts.findUnique({ where: { clientId: client.id } });
  if (!bank) return null;
  return {
    accountHolder: decryptNullable(bank.accountHolderCipher),
    bankName: decryptNullable(bank.bankNameCipher),
    sortCode: decryptNullable(bank.sortCodeCipher),
    accountNumber: decryptNullable(bank.accountNumberCipher),
    iban: decryptNullable(bank.ibanCipher),
    swiftBic: decryptNullable(bank.swiftBicCipher),
    currency: bank.currency,
  };
}
