import { Prisma } from "@prisma/client";
import { getClientLookupKey, normalizeClientName, slugifyClientName } from "@/lib/clients";
import { prisma } from "@/lib/prisma";
import type { ClientDetailRecord, ClientListItem } from "@/types/client";
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

type ClientAggregateRecord = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  proposalCount: number;
  source: "SUGGESTED";
};

function summarizeClients(
  proposals: Array<{
    clientName: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
): ClientAggregateRecord[] {
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

  return [...clients.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function toClientListItem(client: ClientAggregateRecord): ClientListItem {
  return {
    id: client.id,
    name: client.name,
    slug: client.slug,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    proposalCount: client.proposalCount,
    source: client.source,
  };
}

async function loadClientProposalSummary() {
  await ensureBaseRecords();

  return prisma.document.findMany({
    where: {
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
  });
}

export async function listDerivedClients(filters?: {
  search?: string;
}): Promise<{ clients: ClientListItem[] }> {
  const proposals = await loadClientProposalSummary();
  const search = filters?.search?.trim().toLowerCase() ?? "";

  const clients = summarizeClients(proposals)
    .filter((client) => {
      if (!search) {
        return true;
      }

      return client.name.toLowerCase().includes(search);
    })
    .map(toClientListItem);

  return { clients };
}

export async function getDerivedClientDetail(slug: string): Promise<ClientDetailRecord | null> {
  await ensureBaseRecords();

  const proposals = await prisma.document.findMany({
    where: {
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

  const client = summarizeClients(proposals).find((entry) => entry.slug === slug);
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
