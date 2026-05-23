import { Prisma } from "@prisma/client";
import { getClientLookupKey, normalizeClientName, slugifyClientName } from "@/lib/clients";
import { prisma } from "@/lib/prisma";
import type {
  ClientDetailFields,
  ClientDetailRecord,
  ClientListItem,
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

type ClientAggregateRecord = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
  proposalCount: number;
  source: ClientSource;
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
  };
}

function buildContactData(input: ClientContactInput) {
  return {
    website: input.website?.trim() || null,
    addressLine1: input.addressLine1?.trim() || null,
    addressLine2: input.addressLine2?.trim() || null,
    city: input.city?.trim() || null,
    postcode: input.postcode?.trim() || null,
    country: input.country?.trim() || null,
    notes: input.notes?.trim() || null,
    primaryContactName: input.primaryContactName?.trim() || null,
    primaryContactEmail: input.primaryContactEmail?.trim() || null,
    primaryContactPhone: input.primaryContactPhone?.trim() || null,
    googleDriveFolderUrl: input.googleDriveFolderUrl?.trim() || null,
  };
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
): ClientAggregateRecord[] {
  const merged = summarizeSuggestedClients(proposals);

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
    createdAt: platform.createdAt.toISOString(),
    updatedAt: platform.updatedAt.toISOString(),
  };
}

async function loadClientCollections() {
  const { workspace } = await ensureBaseRecords();

  const [manualClients, proposals] = await Promise.all([
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

  return { workspace, manualClients: manualClients as ManualClientRecord[], proposals };
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
  const { manualClients, proposals } = await loadClientCollections();
  const search = filters?.search?.trim().toLowerCase() ?? "";

  const clients = mergeClients(manualClients, proposals)
    .filter((client) => {
      if (!search) {
        return true;
      }

      return client.name.toLowerCase().includes(search);
    })
    .map(toClientListItem);

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
  });
}

export async function updateClientRecord(
  slug: string,
  input: {
    name?: string;
    logoUrl?: string;
  } & ClientContactInput,
): Promise<ClientListItem | null> {
  const { workspace, manualClients, proposals } = await loadClientCollections();
  const mergedClients = mergeClients(manualClients, proposals);
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
            googleDriveFolderUrl: null,
            createdAt: persisted.createdAt,
            updatedAt: persisted.updatedAt,
          },
        ],
    proposals,
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
    },
  );
}

export async function getDerivedClientDetail(slug: string): Promise<ClientDetailRecord | null> {
  const { workspace, manualClients } = await loadClientCollections();

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

  const client = mergeClients(manualClients, proposals).find((entry) => entry.slug === slug);
  if (!client) {
    return null;
  }

  const clientKey = getClientLookupKey(client.name);
  const matchingProposals = proposals.filter(
    (proposal) => getClientLookupKey(proposal.clientName) === clientKey,
  );

  const manualRecord = manualClients.find((c) => c.slug === slug) ?? null;

  const [proofDocuments, platforms, pulseScans, supportClient] = await Promise.all([
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
  ]);

  const contactFields: ClientDetailFields = manualRecord
    ? contactFieldsFromRecord(manualRecord)
    : emptyContactFields();

  return {
    client: {
      ...toClientListItem(client),
      ...contactFields,
    },
    platforms: (platforms as Parameters<typeof serializeClientPlatform>[0][]).map(serializeClientPlatform),
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
    },
  });

  return serializeClientPlatform(platform as Parameters<typeof serializeClientPlatform>[0]);
}

export async function deleteClientPlatform(platformId: string): Promise<void> {
  await clientPlatforms.delete({ where: { id: platformId } });
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
