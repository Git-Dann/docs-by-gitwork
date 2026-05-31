import { Prisma } from "@prisma/client";
import { getClientLookupKey, normalizeClientName, slugifyClientName } from "@/lib/clients";
import { prisma } from "@/lib/prisma";
import type {
  ClientDesignRecord,
  ClientDetailFields,
  ClientDetailRecord,
  ClientListItem,
  ClientPlacementRecord,
  ClientPlatformRecord,
  ClientSource,
} from "@/types/client";
import { ensureBaseRecords } from "@/server/bootstrap";
import { proofDocumentInclude, serializeProofDocument } from "@/server/proof";
import { serializeProposalListItem } from "@/server/proposals";

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
  postcode: string | null;
  country: string | null;
  notes: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  googleDriveFolderUrl: string | null;
  clickupUrl: string | null;
  slackChannelId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ClientContactInput = {
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  notes?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  googleDriveFolderUrl?: string;
  clickupUrl?: string;
  slackChannelId?: string;
};

function emptyContactFields(): ClientDetailFields {
  return {
    website: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    postcode: null,
    country: null,
    notes: null,
    primaryContactName: null,
    primaryContactEmail: null,
    primaryContactPhone: null,
    googleDriveFolderUrl: null,
    clickupUrl: null,
    slackChannelId: null,
  };
}

function contactFieldsFromRecord(record: ManualClientRecord): ClientDetailFields {
  return {
    website: record.website,
    addressLine1: record.addressLine1,
    addressLine2: record.addressLine2,
    city: record.city,
    postcode: record.postcode,
    country: record.country,
    notes: record.notes,
    primaryContactName: record.primaryContactName,
    primaryContactEmail: record.primaryContactEmail,
    primaryContactPhone: record.primaryContactPhone,
    googleDriveFolderUrl: record.googleDriveFolderUrl,
    clickupUrl: record.clickupUrl,
    slackChannelId: record.slackChannelId,
  };
}

function buildContactData(input: ClientContactInput) {
  // Only include fields that were explicitly provided — omitting a field must
  // not overwrite an existing DB value with null on a partial PATCH.
  const data: Partial<Record<keyof ClientContactInput, string | null>> = {};
  const trim = (v: string) => v.trim() || null;
  if (input.website !== undefined)             data.website             = trim(input.website);
  if (input.addressLine1 !== undefined)        data.addressLine1        = trim(input.addressLine1);
  if (input.addressLine2 !== undefined)        data.addressLine2        = trim(input.addressLine2);
  if (input.city !== undefined)                data.city                = trim(input.city);
  if (input.postcode !== undefined)            data.postcode            = trim(input.postcode);
  if (input.country !== undefined)             data.country             = trim(input.country);
  if (input.notes !== undefined)               data.notes               = trim(input.notes);
  if (input.primaryContactName !== undefined)  data.primaryContactName  = trim(input.primaryContactName);
  if (input.primaryContactEmail !== undefined) data.primaryContactEmail = trim(input.primaryContactEmail);
  if (input.primaryContactPhone !== undefined) data.primaryContactPhone = trim(input.primaryContactPhone);
  if (input.googleDriveFolderUrl !== undefined) data.googleDriveFolderUrl = trim(input.googleDriveFolderUrl);
  if (input.clickupUrl !== undefined)          data.clickupUrl          = trim(input.clickupUrl);
  if (input.slackChannelId !== undefined)      data.slackChannelId      = trim(input.slackChannelId);
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
    googleDriveFolderUrl: client.googleDriveFolderUrl,
    clickupUrl: client.clickupUrl,
    hasCareClient: false, // overridden by listDerivedClients which does the care lookup
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

async function loadClientCollections() {
  const { workspace } = await ensureBaseRecords();

  const [allClients, proposals] = await Promise.all([
    workspaceClients.findMany({
      where: {
        workspaceId: workspace.id,
      },
      orderBy: {
        name: "asc",
      },
    }),
    prisma.document.findMany({
      where: {
        workspaceId: workspace.id,
        documentType: "PROPOSAL",
        clientName: {
          not: null,
        },
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
  const hiddenSlugs = new Set(typedClients.filter((c) => c.hidden).map((c) => c.slug));

  return { workspace, manualClients, hiddenSlugs, proposals };
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
}): Promise<{ clients: ClientListItem[] }> {
  const { manualClients, hiddenSlugs, proposals } = await loadClientCollections();
  const search = filters?.search?.trim().toLowerCase() ?? "";

  // Single query: which portal client IDs have a linked Care client.
  // SupportClient.workspaceClientId is the FK to WorkspaceClient.id.
  const careRecords = await prisma.supportClient.findMany({
    where: { workspaceClientId: { not: null } },
    select: { workspaceClientId: true },
  });
  const careIds = new Set(
    careRecords.map((r) => r.workspaceClientId).filter(Boolean),
  );

  const clients = mergeClients(manualClients, proposals, hiddenSlugs)
    .filter((client) => {
      if (!search) return true;
      return client.name.toLowerCase().includes(search);
    })
    .map((client) => ({
      ...toClientListItem(client),
      hasCareClient: careIds.has(client.id),
    }));

  return { clients };
}

export async function createClientRecord(input: {
  name: string;
  logoUrl?: string;
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

  const proposalCount = proposals.filter(
    (proposal) => getClientLookupKey(proposal.clientName) === clientKey,
  ).length;

  return toClientListItem({
    id: client.id,
    name: client.name,
    slug: client.slug,
    logoUrl: client.logoUrl ?? undefined,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    proposalCount,
    source: "MANUAL",
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
            postcode: null,
            country: null,
            notes: null,
            primaryContactName: null,
            primaryContactEmail: null,
            primaryContactPhone: null,
            googleDriveFolderUrl: persisted.googleDriveFolderUrl,
            clickupUrl: persisted.clickupUrl,
            slackChannelId: persisted.slackChannelId,
            createdAt: persisted.createdAt,
            updatedAt: persisted.updatedAt,
          },
        ],
    proposals,
    hiddenSlugs,
  );

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

  return true;
}

export async function getDerivedClientDetail(slug: string): Promise<ClientDetailRecord | null> {
  const { workspace, manualClients, hiddenSlugs } = await loadClientCollections();

  const proposals = await prisma.document.findMany({
    where: {
      workspaceId: workspace.id,
      documentType: "PROPOSAL",
      clientName: {
        not: null,
      },
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

  const [proofDocuments, platforms, designs, pulseScans, supportClient, placements, studies] = await Promise.all([
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
  ]);

  const contactFields: ClientDetailFields = manualRecord
    ? contactFieldsFromRecord(manualRecord)
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
