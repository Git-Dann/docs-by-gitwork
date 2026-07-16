import { unstable_cache, revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { getClientLookupKey, normalizeClientName, slugifyClientName } from "@/lib/clients";
import { prisma } from "@/lib/prisma";
import { encryptNullable, decryptNullable } from "@/lib/encryption";
import type {
  ClientBankReveal,
  ClientBankSummary,
  ClientDesignRecord,
  ClientDocumentLinkRecord,
  ClientDetailFields,
  ClientDetailRecord,
  ClientListItem,
  ClientLifecycleEvent,
  ClientPlacementRecord,
  ClientPlatformRecord,
  ClientPlatformReveal,
  ClientPlatformLoginSummary,
  ClientSource,
  ClientTouchpoint,
  LeadStage,
  TouchpointType,
  WorkspaceClientStatus,
} from "@/types/client";
import { ensureBaseRecords } from "@/server/bootstrap";
import { proofDocumentInclude, serializeProofDocument } from "@/server/proof";
import { serializeProposalListItem } from "@/server/proposals";
import {
  computeClientDevCounts,
  computeClientFinancials,
  computeClientOverdueTaskCounts,
  computeClientPulseHealth,
  deriveClientHealth,
} from "@/server/client-metrics";
import { recordAuditEntry } from "@/server/audit-log";
import type { EffectiveUser } from "@/server/auth/effective-user";

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
  signatureRequests: {
    select: { status: true, sentAt: true, completedAt: true },
    orderBy: { updatedAt: "desc" },
  },
  // Visible-block count for the Docs list-item serializer (card meta readout).
  _count: { select: { sections: true } },
} satisfies Prisma.DocumentInclude;

const workspaceClients = (prisma as unknown as {
  workspaceClient: Prisma.WorkspaceClientDelegate;
}).workspaceClient;

const clientPlatforms = (prisma as unknown as {
  clientPlatform: Prisma.ClientPlatformDelegate;
}).clientPlatform;

const clientPlatformLogins = (prisma as unknown as {
  clientPlatformLogin: Prisma.ClientPlatformLoginDelegate;
}).clientPlatformLogin;

const clientDesigns = (prisma as unknown as {
  clientDesign: Prisma.ClientDesignDelegate;
}).clientDesign;

const clientDocumentLinks = (prisma as unknown as {
  clientDocumentLink: Prisma.ClientDocumentLinkDelegate;
}).clientDocumentLink;

/** Current retainer period as YYYY-MM (UTC) — the month `retainerDaysUsed` is counted against. */
export function currentRetainerMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Lazy monthly reset: a used figure stamped to an earlier month reads as 0 this month. A null
 *  period (legacy rows) is left untouched so an existing value is never silently wiped. */
function effectiveRetainerUsed(
  used: number | null,
  periodMonth: string | null | undefined,
): number | null {
  if (used == null) return used;
  if (periodMonth && periodMonth !== currentRetainerMonth()) return 0;
  return used;
}

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
  productTeamUserIds: string[];
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
  retainerPeriodMonth: string | null;
  leadSource: string | null;
  leadStage: LeadStage | null;
  leadFollowUpAt: Date | null;
  leadValue: number | null;
  leadValueCurrency: string | null;
  resumeAt: Date | null;
  pauseNote: string | null;
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
  leadSource?: string | null;
  leadStage?: LeadStage | null;
  leadFollowUpAt?: string | null;
  leadValue?: number | null;
  leadValueCurrency?: string | null;
  resumeAt?: string | null;
  pauseNote?: string | null;
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
    productTeamUserIds: [],
    leadSource: null,
    leadStage: null,
    leadFollowUpAt: null,
    leadValue: null,
    leadValueCurrency: null,
    resumeAt: null,
    pauseNote: null,
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
    // Lazy monthly reset — a prior-month figure reads as 0, matching the card.
    retainerDaysUsed: effectiveRetainerUsed(record.retainerDaysUsed, record.retainerPeriodMonth),
    leadSource: record.leadSource,
    leadStage: record.leadStage,
    leadFollowUpAt: record.leadFollowUpAt ? record.leadFollowUpAt.toISOString() : null,
    leadValue: record.leadValue,
    leadValueCurrency: record.leadValueCurrency,
    resumeAt: record.resumeAt ? record.resumeAt.toISOString() : null,
    pauseNote: record.pauseNote,
    bank: extras.bank,
    onboardingId: extras.onboardingId,
    productTeamUserIds: record.productTeamUserIds ?? [],
  };
}

function buildContactData(input: ClientContactInput) {
  // Only include fields that were explicitly provided — omitting a field must
  // not overwrite an existing DB value with null on a partial PATCH.
  // Retainer keys are numeric (Int? columns); every other contact field is a string column.
  const data: Partial<{
    [K in keyof ClientContactInput]: K extends "retainerDays" | "retainerDaysUsed" | "leadValue"
      ? number | null
      : K extends "leadFollowUpAt" | "resumeAt"
        ? Date | null
        : K extends "leadStage"
          ? LeadStage | null
          : string | null;
  }> & { retainerPeriodMonth?: string | null } = {};
  const trim = (v: string) => v.trim() || null;
  // ISO string → Date (empty/invalid → null) for the DateTime columns.
  const toDate = (v: string | null | undefined): Date | null => {
    if (!v || !v.trim()) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
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
  if (input.retainerDaysUsed !== undefined) {
    data.retainerDaysUsed = input.retainerDaysUsed;
    // Stamp the period so the lazy monthly reset knows which month this figure belongs to;
    // clearing the used value (null) clears the stamp too.
    data.retainerPeriodMonth = input.retainerDaysUsed == null ? null : currentRetainerMonth();
  }
  // Lead (LEAD) + paused-client (INACTIVE) fields.
  if (input.leadSource !== undefined)        data.leadSource        = input.leadSource?.trim() || null;
  if (input.leadStage !== undefined)         data.leadStage         = input.leadStage ?? null;
  if (input.leadValue !== undefined)         data.leadValue         = input.leadValue ?? null;
  if (input.leadValueCurrency !== undefined) data.leadValueCurrency = input.leadValueCurrency?.trim().toUpperCase() || null;
  if (input.leadFollowUpAt !== undefined)    data.leadFollowUpAt    = toDate(input.leadFollowUpAt);
  if (input.resumeAt !== undefined)          data.resumeAt          = toDate(input.resumeAt);
  if (input.pauseNote !== undefined)         data.pauseNote         = input.pauseNote?.trim() || null;
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

function serializeClientDocumentLink(link: {
  id: string;
  clientId: string;
  name: string;
  url: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ClientDocumentLinkRecord {
  return {
    id: link.id,
    clientId: link.clientId,
    name: link.name,
    url: link.url,
    notes: link.notes,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
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
  credentials?: string | null; // legacy plaintext (fallback for hasPassword pre-migration)
  usernameCipher?: string | null;
  passwordCipher?: string | null;
  logins?: Array<{ id: string; label: string | null; usernameCipher: string | null; passwordCipher: string | null; orderKey: number; createdAt: Date }> | null;
  notes: string | null;
  previewImageUrl?: string | null;
  featuredInWiki?: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ClientPlatformRecord {
  const logins = (platform.logins ?? [])
    .slice()
    .sort((a, b) => a.orderKey - b.orderKey || a.createdAt.getTime() - b.createdAt.getTime())
    .map((l) => ({
      id: l.id,
      label: l.label,
      // Never leak plaintext — only whether each field is set. Values come from the reveal route.
      hasUsername: Boolean(l.usernameCipher),
      hasPassword: Boolean(l.passwordCipher),
    }));
  return {
    id: platform.id,
    clientId: platform.clientId,
    name: platform.name,
    platformType: platform.platformType,
    url: platform.url,
    stagingUrl: platform.stagingUrl,
    repoUrl: platform.repoUrl,
    // Legacy single-credential flags — true only for platforms not yet migrated into `logins`.
    hasUsername: Boolean(platform.usernameCipher),
    hasPassword: Boolean(platform.passwordCipher) || Boolean(platform.credentials),
    logins,
    notes: platform.notes,
    previewImageUrl: platform.previewImageUrl ?? null,
    featuredInWiki: platform.featuredInWiki ?? false,
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

// Strict ISO-8601 datetime — exactly what JSON.stringify(new Date()) emits. Used
// to revive cached dates without touching ordinary string fields (names, slugs,
// notes never look like this).
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** unstable_cache JSON-serialises Dates to ISO strings; turn any such top-level
 *  string back into a Date so callers get the Date instances they expect. Generic
 *  by design — a newly-added DateTime field revives automatically, so it can never
 *  silently break again (leadFollowUpAt/resumeAt slipped through the old hand-list). */
function reviveDates<T>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const rec = obj as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    const value = rec[key];
    if (typeof value === "string" && ISO_DATETIME_RE.test(value)) rec[key] = new Date(value);
  }
  return obj;
}

async function loadClientCollections() {
  const { workspace } = await ensureBaseRecords();
  const raw = await _cachedLoadCollections(workspace.id);
  // Spread first (never mutate the shared cached object), then revive dates.
  return {
    workspace,
    manualClients: raw.manualClients.map((c) => reviveDates({ ...c })) as ManualClientRecord[],
    hiddenSlugs: new Set(raw.hiddenSlugs),
    proposals: raw.proposals.map((p) => reviveDates({ ...p })),
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
  /** Include Pulse-derived health fields/cards. The caller should pass false when the
   *  viewer lacks the Pulse module permission. */
  includePulse?: boolean;
  /** Compute + include the sensitive monthlyCost/workingDays fields. The caller MUST have
   *  verified `clients.viewFinancials` (or Super Admin) first. Default false. */
  includeFinancials?: boolean;
}): Promise<{ clients: ClientListItem[] }> {
  const { workspace, manualClients, hiddenSlugs, proposals } = await loadClientCollections();
  const search = filters?.search?.trim().toLowerCase() ?? "";
  const statusFilter = filters?.status ?? "ACTIVE";
  const includePulse = filters?.includePulse ?? true;
  const includeFinancials = filters?.includeFinancials ?? false;

  const merged = mergeClients(manualClients, proposals, hiddenSlugs);
  const manualClientMeta = merged
    .filter((c) => c.source === "MANUAL")
    .map((c) => ({ id: c.id }));
  const manualIds = manualClientMeta.map((c) => c.id);

  // Parallel enrichment queries — single round-trip.
  const [careRecords, platformRepos, devCounts, pulseHealth, overdueCounts, financials] = await Promise.all([
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
    // Latest completed Pulse scan health per client. Hidden when the caller lacks
    // the Pulse module permission, so Portal does not leak Pulse cards/links.
    includePulse ? computeClientPulseHealth(workspace.id, manualIds) : Promise.resolve(new Map()),
    // Overdue open-task count per client — feeds the health roll-up (not financial).
    computeClientOverdueTaskCounts(workspace.id, manualIds),
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
      (c) =>
        [
          c.id,
          {
            retainerDays: c.retainerDays,
            // Lazy monthly reset applied here so the card never shows a stale prior-month figure.
            retainerDaysUsed: effectiveRetainerUsed(c.retainerDaysUsed, c.retainerPeriodMonth),
          },
        ] as const,
    ),
  );

  // Lead (LEAD) + paused (INACTIVE) fields by client id — manual-only, attached ungated.
  const leadInfoByClient = new Map(
    manualClients.map(
      (c) =>
        [
          c.id,
          {
            leadSource: c.leadSource,
            leadStage: c.leadStage,
            leadFollowUpAt: c.leadFollowUpAt ? c.leadFollowUpAt.toISOString() : null,
            leadValue: c.leadValue,
            leadValueCurrency: c.leadValueCurrency,
            resumeAt: c.resumeAt ? c.resumeAt.toISOString() : null,
            pauseNote: c.pauseNote,
          },
        ] as const,
    ),
  );

  const clients = merged
    .filter((client) => {
      // Leads are a separate pipeline — only ever returned by the explicit LEAD filter, never
      // in "ALL" or any other view, so they don't leak into client pickers/dropdowns.
      if (client.status === "LEAD" && statusFilter !== "LEAD") return false;
      if (statusFilter !== "ALL" && client.status !== statusFilter) {
        return false;
      }
      if (!search) return true;
      return client.name.toLowerCase().includes(search);
    })
    .map((client) => {
      const financial = financials?.get(client.id);
      const pulse = pulseHealth.get(client.id);
      return {
        ...toClientListItem(client),
        hasCareClient: careIds.has(client.id),
        repoUrls: reposByClientId.get(client.id) ?? [],
        devCount: devCounts.get(client.id) ?? 0,
        monthlyCost: financial ? financial.monthlyCost : null,
        workingDays: financial ? financial.workingDays : null,
        retainerDays: includeFinancials ? (retainerByClient.get(client.id)?.retainerDays ?? null) : null,
        retainerDaysUsed: includeFinancials ? (retainerByClient.get(client.id)?.retainerDaysUsed ?? null) : null,
        pulseHealthScore: pulse?.healthScore ?? null,
        pulseScanId: pulse?.scanId ?? null,
        health: deriveClientHealth({
          pulseHealthScore: pulse?.healthScore ?? null,
          overdueTasks: overdueCounts.get(client.id) ?? 0,
        }),
        ...(leadInfoByClient.get(client.id) ?? {}),
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
  /** Initial status — omit for a normal ACTIVE client; "LEAD" from the Add-lead flow. */
  status?: WorkspaceClientStatus;
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
      ...(input.status ? { status: input.status } : {}),
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
            productTeamUserIds: (persisted as typeof persisted & { productTeamUserIds?: string[] }).productTeamUserIds ?? [],
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
            retainerPeriodMonth: null,
            leadSource: null,
            leadStage: null,
            leadFollowUpAt: null,
            leadValue: null,
            leadValueCurrency: null,
            resumeAt: null,
            pauseNote: null,
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

/**
 * Set a client's product team (Gitwork account leads) — the ordered list of
 * User ids surfaced on the wiki header. Validates the ids are real workspace
 * members before persisting; returns the stored list. Null client → null.
 */
export async function setClientProductTeam(
  slug: string,
  userIds: string[],
): Promise<string[] | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await workspaceClients.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  if (!client) return null;
  // Keep only ids that are members of this workspace, de-duped, in submitted order.
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, userId: { in: userIds } },
    select: { userId: true },
  });
  const valid = new Set(members.map((m) => m.userId));
  const clean = [...new Set(userIds)].filter((id) => valid.has(id));
  await workspaceClients.update({
    where: { id: client.id },
    data: { productTeamUserIds: clean },
  });
  revalidateTag("client-collections");
  return clean;
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
    // Bust the 60s collection cache so the deleted client disappears immediately — without
    // this the list keeps serving the stale snapshot and the card "doesn't go anywhere".
    revalidateTag("client-collections");
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

/** Resolve touchpoint rows → DTOs, batching the author-name lookup. */
async function serializeTouchpoints(
  rows: Array<{
    id: string;
    type: string;
    note: string | null;
    occurredAt: Date;
    authorId: string | null;
    createdAt: Date;
  }>,
): Promise<ClientTouchpoint[]> {
  const authorIds = [...new Set(rows.map((r) => r.authorId).filter(Boolean))] as string[];
  const authors = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(authors.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    type: r.type as TouchpointType,
    note: r.note,
    occurredAt: r.occurredAt.toISOString(),
    authorId: r.authorId,
    authorName: r.authorId ? nameById.get(r.authorId) ?? null : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** List a client's logged touchpoints (most recent first). Null when the client is unknown. */
export async function listClientTouchpoints(slug: string): Promise<ClientTouchpoint[] | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await workspaceClients.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  if (!client) return null;
  return serializeTouchpoints(
    await prisma.clientTouchpoint.findMany({
      where: { clientId: client.id },
      orderBy: { occurredAt: "desc" },
      take: 200,
    }),
  );
}

/** Log a touchpoint (call/email/meeting/note) against a client. Null when unknown. */
export async function addClientTouchpoint(
  slug: string,
  input: { type: TouchpointType; note?: string | null; occurredAt?: string | null },
  actor?: EffectiveUser | null,
): Promise<ClientTouchpoint | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await workspaceClients.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  if (!client) return null;
  const occurred =
    input.occurredAt && input.occurredAt.trim() && !Number.isNaN(new Date(input.occurredAt).getTime())
      ? new Date(input.occurredAt)
      : new Date();
  const row = await prisma.clientTouchpoint.create({
    data: {
      clientId: client.id,
      workspaceId: workspace.id,
      type: input.type,
      note: input.note?.trim() || null,
      occurredAt: occurred,
      authorId: actor?.id ?? null,
    },
  });
  const [dto] = await serializeTouchpoints([row]);
  return dto;
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

  const [proofDocuments, platforms, designs, pulseScans, supportClient, placements, studies, bank, onboardingRow, auditRows, documentLinks] = await Promise.all([
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
          include: { logins: true },
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
          select: { id: true, status: true, createdAt: true, submittedAt: true },
        })
      : Promise.resolve(null),
    manualRecord
      ? prisma.auditLog.findMany({
          where: {
            workspaceId: workspace.id,
            target: clientLifecycleTarget(manualRecord.id),
            action: {
              in: [
                "foundry.proposal_draft.prepared",
                "foundry.client.activated",
                "foundry.delivery_plan.seeded",
              ],
            },
          },
          select: { id: true, action: true, createdAt: true, metadata: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    manualRecord
      ? clientDocumentLinks.findMany({
          where: { clientId: manualRecord.id },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
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

  // CRM activity log (leads) — most-recent first, author names resolved in one batch.
  const touchpoints = manualRecord
    ? await serializeTouchpoints(
        await prisma.clientTouchpoint.findMany({
          where: { clientId: manualRecord.id },
          orderBy: { occurredAt: "desc" },
          take: 200,
        }),
      )
    : [];

  return {
    client: {
      ...toClientListItem(client),
      ...contactFields,
    },
    touchpoints,
    lifecycle: buildClientLifecycle({
      client,
      proposals: matchingProposals.map((proposal) => ({
        id: proposal.id,
        title: proposal.title,
        status: proposal.status,
        documentType: proposal.documentType,
        createdAt: proposal.createdAt,
        updatedAt: proposal.updatedAt,
        acceptedAt: proposal.acceptedAt,
        signatureRequests: proposal.signatureRequests,
      })),
      onboarding: onboardingRow,
      auditRows,
    }),
    platforms: (platforms as Parameters<typeof serializeClientPlatform>[0][]).map(serializeClientPlatform),
    designs: (designs as Parameters<typeof serializeClientDesign>[0][]).map(serializeClientDesign),
    documentLinks: (documentLinks as Parameters<typeof serializeClientDocumentLink>[0][]).map(
      serializeClientDocumentLink,
    ),
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
    username?: string;
    password?: string;
    notes?: string;
    featuredInWiki?: boolean;
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
      usernameCipher: encryptNullable(input.username),
      passwordCipher: encryptNullable(input.password),
      notes: input.notes?.trim() || null,
      featuredInWiki: input.featuredInWiki ?? false,
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
    username?: string;
    password?: string;
    notes?: string;
    previewImageUrl?: string;
    featuredInWiki?: boolean;
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
      // Only re-encrypt when the field is explicitly provided — omitting it leaves the stored
      // cipher untouched (so editing the name/URL never wipes saved credentials). Setting it to
      // a cipher of an empty string clears it. When the username/password is set, also drop any
      // legacy plaintext blob so it stops lingering unencrypted.
      ...(input.username !== undefined ? { usernameCipher: encryptNullable(input.username), credentials: null } : {}),
      ...(input.password !== undefined ? { passwordCipher: encryptNullable(input.password), credentials: null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
      ...(input.previewImageUrl !== undefined ? { previewImageUrl: input.previewImageUrl || null } : {}),
      ...(input.featuredInWiki !== undefined ? { featuredInWiki: input.featuredInWiki } : {}),
    },
  });

  return serializeClientPlatform(platform as Parameters<typeof serializeClientPlatform>[0]);
}

export async function deleteClientPlatform(platformId: string): Promise<void> {
  await clientPlatforms.delete({ where: { id: platformId } });
}

/**
 * Decrypt and return a platform's stored credentials. Gate at the route on canManageClients +
 * client access (mirrors revealClientBank). Falls back to the legacy plaintext blob (as the
 * password) for rows not yet migrated by encryptLegacyPlatformCredentials.
 */
export async function revealClientPlatform(
  slug: string,
  platformId: string,
): Promise<ClientPlatformReveal | null> {
  const { workspace } = await ensureBaseRecords();
  const client = await workspaceClients.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  if (!client) return null;
  const platform = await clientPlatforms.findFirst({
    where: { id: platformId, clientId: client.id },
    select: { usernameCipher: true, passwordCipher: true, credentials: true },
  });
  if (!platform) return null;
  return {
    username: decryptNullable(platform.usernameCipher),
    password: decryptNullable(platform.passwordCipher) ?? (platform.credentials?.trim() || null),
  };
}

/**
 * One-time migration: encrypt any platform still holding a plaintext `credentials` blob into
 * passwordCipher (only when no password is already set), then null the plaintext. Idempotent —
 * re-running is a no-op once every row is migrated. Returns the count actually encrypted.
 */
export async function encryptLegacyPlatformCredentials(): Promise<{ migrated: number }> {
  const rows = await clientPlatforms.findMany({
    where: { credentials: { not: null } },
    select: { id: true, credentials: true, passwordCipher: true },
  });
  let migrated = 0;
  for (const row of rows) {
    const plain = row.credentials?.trim();
    const encryptIt = Boolean(plain) && !row.passwordCipher;
    await clientPlatforms.update({
      where: { id: row.id },
      data: {
        ...(encryptIt ? { passwordCipher: encryptNullable(plain) } : {}),
        credentials: null,
      },
    });
    if (encryptIt) migrated += 1;
  }
  return { migrated };
}

/**
 * Heuristic split of a legacy credential blob into username + password. Pulls out an email-like
 * token as the username; the leftover (after stripping common labels/delimiters) becomes the
 * password — but ONLY when it's a single token (no internal whitespace), so multi-value notes
 * blobs are never mangled into a bogus password. Returns null when it can't split safely.
 */
function splitCredentialBlob(raw: string): { username: string; password: string } | null {
  const text = raw.trim();
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  if (!email) return null;
  let rest = text.replace(email, " ");
  rest = rest.replace(/\b(?:e-?mail|username|user|login|password|pass(?:word)?|pwd|pw)\b\s*[:=]?/gi, " ");
  rest = rest.replace(/\s+/g, " ").trim();
  rest = rest.replace(/^[\s:=/|,\-–—]+|[\s:=/|,\-–—]+$/g, "").trim();
  if (!rest) return { username: email, password: "" }; // email-only → a login, no password
  if (/\s/.test(rest)) return null; // multi-word leftover → too risky, leave merged
  return { username: email, password: rest };
}

/**
 * Split already-migrated merged blobs (email + password that landed together in passwordCipher)
 * into separate usernameCipher + passwordCipher. Only touches rows with no username yet, and only
 * when splitCredentialBlob succeeds — password-only or multi-value blobs are left untouched.
 * Idempotent (split rows gain a usernameCipher and are skipped next run). Returns counts.
 */
export async function splitPlatformCredentials(): Promise<{ split: number; unchanged: number }> {
  const rows = await clientPlatforms.findMany({
    where: { usernameCipher: null, passwordCipher: { not: null } },
    select: { id: true, passwordCipher: true },
  });
  let split = 0;
  let unchanged = 0;
  for (const row of rows) {
    let blob: string | null = null;
    try {
      blob = decryptNullable(row.passwordCipher);
    } catch {
      unchanged += 1;
      continue; // unreadable cipher — leave it
    }
    const parts = blob ? splitCredentialBlob(blob) : null;
    if (!parts) {
      unchanged += 1;
      continue;
    }
    await clientPlatforms.update({
      where: { id: row.id },
      data: {
        usernameCipher: encryptNullable(parts.username),
        passwordCipher: encryptNullable(parts.password),
      },
    });
    split += 1;
  }
  return { split, unchanged };
}

// ── Platform logins (multiple credential sets per platform) ──────────────────

function loginSummary(l: {
  id: string;
  label: string | null;
  usernameCipher: string | null;
  passwordCipher: string | null;
}): ClientPlatformLoginSummary {
  return { id: l.id, label: l.label, hasUsername: Boolean(l.usernameCipher), hasPassword: Boolean(l.passwordCipher) };
}

/** Verify a platform belongs to the slug's client in this workspace. */
async function platformInClient(slug: string, platformId: string): Promise<boolean> {
  const { workspace } = await ensureBaseRecords();
  const p = await clientPlatforms.findFirst({
    where: { id: platformId, client: { workspaceId: workspace.id, slug } },
    select: { id: true },
  });
  return Boolean(p);
}

/** Find a login scoped to its platform + the slug's client (null if it doesn't belong). */
async function findScopedLogin(slug: string, platformId: string, loginId: string) {
  const { workspace } = await ensureBaseRecords();
  return clientPlatformLogins.findFirst({
    where: { id: loginId, platformId, platform: { client: { workspaceId: workspace.id, slug } } },
  });
}

export async function createPlatformLogin(
  slug: string,
  platformId: string,
  input: { label?: string; username?: string; password?: string },
): Promise<ClientPlatformLoginSummary | null> {
  if (!(await platformInClient(slug, platformId))) return null;
  const agg = await clientPlatformLogins.aggregate({ where: { platformId }, _max: { orderKey: true } });
  const login = await clientPlatformLogins.create({
    data: {
      platformId,
      label: input.label?.trim() || null,
      usernameCipher: encryptNullable(input.username),
      passwordCipher: encryptNullable(input.password),
      orderKey: (agg._max.orderKey ?? -1) + 1,
    },
  });
  return loginSummary(login);
}

export async function updatePlatformLogin(
  slug: string,
  platformId: string,
  loginId: string,
  input: { label?: string | null; username?: string; password?: string },
): Promise<ClientPlatformLoginSummary | null> {
  if (!(await findScopedLogin(slug, platformId, loginId))) return null;
  const login = await clientPlatformLogins.update({
    where: { id: loginId },
    data: {
      ...(input.label !== undefined ? { label: input.label?.trim() || null } : {}),
      ...(input.username !== undefined ? { usernameCipher: encryptNullable(input.username) } : {}),
      ...(input.password !== undefined ? { passwordCipher: encryptNullable(input.password) } : {}),
    },
  });
  return loginSummary(login);
}

export async function deletePlatformLogin(slug: string, platformId: string, loginId: string): Promise<boolean> {
  if (!(await findScopedLogin(slug, platformId, loginId))) return false;
  await clientPlatformLogins.delete({ where: { id: loginId } });
  return true;
}

export async function revealPlatformLogin(
  slug: string,
  platformId: string,
  loginId: string,
): Promise<ClientPlatformReveal | null> {
  const login = await findScopedLogin(slug, platformId, loginId);
  if (!login) return null;
  return { username: decryptNullable(login.usernameCipher), password: decryptNullable(login.passwordCipher) };
}

/**
 * One-shot migration: move each platform's row-level credentials (usernameCipher/passwordCipher
 * or the legacy plaintext blob) into a single ClientPlatformLogin, then null the row-level fields.
 * Only touches platforms with no logins yet. Idempotent. Returns the count migrated.
 */
export async function migratePlatformLogins(): Promise<{ migrated: number }> {
  const rows = await clientPlatforms.findMany({
    where: {
      logins: { none: {} },
      OR: [
        { usernameCipher: { not: null } },
        { passwordCipher: { not: null } },
        { credentials: { not: null } },
      ],
    },
    select: { id: true, usernameCipher: true, passwordCipher: true, credentials: true },
  });
  let migrated = 0;
  for (const p of rows) {
    let usernameCipher = p.usernameCipher;
    let passwordCipher = p.passwordCipher;
    if (!usernameCipher && !passwordCipher && p.credentials) {
      const blob = p.credentials.trim();
      const parts = splitCredentialBlob(blob);
      if (parts) {
        usernameCipher = encryptNullable(parts.username);
        passwordCipher = encryptNullable(parts.password);
      } else {
        passwordCipher = encryptNullable(blob);
      }
    }
    await clientPlatformLogins.create({
      data: { platformId: p.id, label: null, usernameCipher, passwordCipher, orderKey: 0 },
    });
    await clientPlatforms.update({
      where: { id: p.id },
      data: { usernameCipher: null, passwordCipher: null, credentials: null },
    });
    migrated += 1;
  }
  return { migrated };
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

export async function createClientDocumentLink(
  clientId: string,
  input: { name: string; url: string; notes?: string },
): Promise<ClientDocumentLinkRecord> {
  const link = await clientDocumentLinks.create({
    data: {
      clientId,
      name: input.name.trim(),
      url: input.url.trim(),
      notes: input.notes?.trim() || null,
    },
  });
  return serializeClientDocumentLink(link as Parameters<typeof serializeClientDocumentLink>[0]);
}

export async function updateClientDocumentLink(
  linkId: string,
  input: { name?: string; url?: string; notes?: string },
): Promise<ClientDocumentLinkRecord | null> {
  const link = await clientDocumentLinks.update({
    where: { id: linkId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.url !== undefined ? { url: input.url.trim() } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
    },
  });
  return serializeClientDocumentLink(link as Parameters<typeof serializeClientDocumentLink>[0]);
}

export async function deleteClientDocumentLink(linkId: string): Promise<void> {
  await clientDocumentLinks.delete({ where: { id: linkId } });
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

function clientLifecycleTarget(clientId: string): string {
  return `client:${clientId}`;
}

function buildClientLifecycle(input: {
  client: Pick<ClientListItem, "id" | "status" | "createdAt" | "updatedAt">;
  proposals: Array<{
    id: string;
    title: string;
    status: string;
    documentType: string;
    createdAt: Date;
    updatedAt: Date;
    acceptedAt: Date | null;
    signatureRequests: Array<{ status: string; sentAt: Date | null; completedAt: Date | null }>;
  }>;
  onboarding: { id: string; status: string; createdAt: Date; submittedAt: Date | null } | null;
  auditRows: Array<{ id: string; action: string; createdAt: Date; metadata: Prisma.JsonValue }>;
}): ClientLifecycleEvent[] {
  const events: ClientLifecycleEvent[] = [
    {
      id: `client:${input.client.id}`,
      label: "Client record",
      detail: input.client.status === "PENDING_REVIEW" ? "Pending activation review." : "Client exists in Portal.",
      at: input.client.createdAt,
      status: "done",
    },
  ];
  const latestMeetingDraft = input.auditRows.find((row) => row.action === "foundry.proposal_draft.prepared");
  if (latestMeetingDraft) {
    events.push({
      id: latestMeetingDraft.id,
      label: "Proposal drafted",
      detail: "Proposal draft prepared from Scribe notes.",
      at: latestMeetingDraft.createdAt.toISOString(),
      status: "done",
    });
  }

  const signedProposal = input.proposals.find(
    (proposal) =>
      proposal.status === "ACCEPTED" ||
      proposal.signatureRequests.some((request) => request.status === "COMPLETED"),
  );
  const sentProposal = input.proposals.find(
    (proposal) => proposal.status === "SENT" || proposal.signatureRequests.some((request) => request.status === "SENT"),
  );
  if (signedProposal) {
    const completedAt = signedProposal.acceptedAt ??
      signedProposal.signatureRequests.find((request) => request.status === "COMPLETED")?.completedAt ??
      signedProposal.updatedAt;
    events.push({
      id: `signoff:${signedProposal.id}`,
      label: "Commercial sign-off",
      detail: `${signedProposal.title} is accepted or signed.`,
      at: completedAt.toISOString(),
      status: "done",
    });
  } else if (sentProposal) {
    events.push({
      id: `sent:${sentProposal.id}`,
      label: "Waiting signature",
      detail: `${sentProposal.title} has been sent for sign-off.`,
      at: (sentProposal.signatureRequests.find((request) => request.status === "SENT")?.sentAt ?? sentProposal.updatedAt).toISOString(),
      status: "waiting",
    });
  }

  if (input.onboarding) {
    events.push({
      id: `onboarding:${input.onboarding.id}`,
      label: input.onboarding.submittedAt ? "Onboarding submitted" : "Onboarding link open",
      detail: input.onboarding.submittedAt ? "Client submitted onboarding." : "Onboarding link exists but is not submitted.",
      at: (input.onboarding.submittedAt ?? input.onboarding.createdAt).toISOString(),
      status: input.onboarding.submittedAt ? "done" : "waiting",
    });
  }

  const activated = input.auditRows.find((row) => row.action === "foundry.client.activated");
  if (activated || input.client.status === "ACTIVE") {
    events.push({
      id: activated?.id ?? `active:${input.client.id}`,
      label: "Client active",
      detail: "Client is active in Portal.",
      at: (activated?.createdAt.toISOString() ?? input.client.updatedAt),
      status: "done",
    });
  }

  const seeded = input.auditRows.find((row) => row.action === "foundry.delivery_plan.seeded");
  if (seeded) {
    events.push({
      id: seeded.id,
      label: "Delivery plan seeded",
      detail: "Feature blocks, tasks, and milestones were generated from proposal timeline.",
      at: seeded.createdAt.toISOString(),
      status: "done",
    });
  } else if (input.client.status === "ACTIVE" && signedProposal) {
    events.push({
      id: `plan-ready:${input.client.id}`,
      label: "Delivery plan",
      detail: "Ready to seed tasks and milestones.",
      at: (signedProposal.acceptedAt ?? signedProposal.updatedAt).toISOString(),
      status: "ready",
    });
  }

  return events.sort((left, right) => Date.parse(left.at) - Date.parse(right.at)).slice(-8);
}

/**
 * Flip the lifecycle status on a client. Moving PENDING_REVIEW → ACTIVE is the
 * "Move to workflow" action; ARCHIVED is the soft-delete that replaces `hidden`
 * for clients created via onboarding.
 */
export async function setClientStatus(
  slug: string,
  status: WorkspaceClientStatus,
  actor?: EffectiveUser | null,
  options?: { resumeAt?: string | null; pauseNote?: string | null },
): Promise<ClientListItem | null> {
  const { workspace } = await ensureBaseRecords();
  const previous = await workspaceClients.findUnique({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!previous) return null;

  // Pausing (→ INACTIVE) optionally records a "pick back up" date + note; any other
  // transition (e.g. reactivating to ACTIVE, converting a lead) clears both.
  const parseDate = (v: string | null | undefined): Date | null => {
    if (!v || !v.trim()) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const pauseData =
    status === "INACTIVE"
      ? { resumeAt: parseDate(options?.resumeAt), pauseNote: options?.pauseNote?.trim() || null }
      : { resumeAt: null, pauseNote: null };

  const persisted = await workspaceClients.update({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug } },
    data: { status, ...pauseData },
  });
  if (previous.status === "PENDING_REVIEW" && persisted.status === "ACTIVE") {
    await recordAuditEntry({
      workspaceId: workspace.id,
      actorId: actor?.id ?? null,
      action: "foundry.client.activated",
      target: `client:${persisted.id}`,
      before: { status: previous.status },
      after: { status: persisted.status },
      metadata: {
        source: "foundry_manual_activation",
        clientId: persisted.id,
        clientSlug: persisted.slug,
        clientName: persisted.name,
      },
    });
  }

  // Pausing or archiving a client auto-unassigns its team: closes every open Placement
  // (endDate = now — the same mechanism the CodeClear pipeline's drag-to-"Unassigned" uses,
  // src/app/api/codeclear/candidates/[id]/current-clients/route.ts) so those devs drop off
  // the client's dev count and reappear in the pipeline's Unassigned column, and clears
  // internal-staff ClientAssignment rows (Settings → Team access scoping). Reactivating a
  // client does NOT restore either — reassignment is manual, on purpose.
  if (
    previous.status !== persisted.status &&
    (persisted.status === "ARCHIVED" || persisted.status === "INACTIVE")
  ) {
    const [{ count: placementsClosed }, { count: assignmentsRemoved }] = await Promise.all([
      prisma.placement.updateMany({
        where: { clientId: persisted.id, endDate: null },
        data: { endDate: new Date() },
      }),
      prisma.clientAssignment.deleteMany({ where: { clientId: persisted.id } }),
    ]);
    if (placementsClosed > 0 || assignmentsRemoved > 0) {
      await recordAuditEntry({
        workspaceId: workspace.id,
        actorId: actor?.id ?? null,
        action: "foundry.client.team_auto_unassigned",
        target: `client:${persisted.id}`,
        before: { status: previous.status },
        after: { status: persisted.status },
        metadata: {
          clientId: persisted.id,
          clientSlug: persisted.slug,
          clientName: persisted.name,
          placementsClosed,
          assignmentsRemoved,
        },
      });
    }
  }

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
