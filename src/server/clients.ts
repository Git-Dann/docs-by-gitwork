import { Prisma } from "@prisma/client";
import { getClientLookupKey, normalizeClientName, slugifyClientName } from "@/lib/clients";
import { prisma } from "@/lib/prisma";
import type { ClientDetailRecord, ClientListItem, ClientSource } from "@/types/client";
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
  createdAt: Date;
  updatedAt: Date;
};

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

  return { workspace, manualClients, proposals };
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
}): Promise<ClientListItem> {
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
  },
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
        },
      })
    : await workspaceClients.create({
        data: {
          workspaceId: workspace.id,
          name: nextName,
          slug: nextSlug,
          logoUrl: input.logoUrl?.trim() || null,
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

  const proofDocuments =
    matchingProposals.length > 0
      ? await prisma.proofDocument.findMany({
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
      : [];

  return {
    client: toClientListItem(client),
    proposals: matchingProposals.map((proposal) => serializeProposalListItem(proposal)),
    proofDocuments: proofDocuments.map((document) => serializeProofDocument(document)),
  };
}
