import type { Prisma } from "@prisma/client";
import type { ProofDocumentRecord } from "@/lib/proof";

export const proofDocumentInclude = {
  proposal: {
    select: {
      id: true,
      title: true,
    },
  },
} satisfies Prisma.ProofDocumentInclude;

export type ProofDocumentPayload = Prisma.ProofDocumentGetPayload<{
  include: typeof proofDocumentInclude;
}>;

export function serializeProofDocument(document: ProofDocumentPayload): ProofDocumentRecord {
  return {
    id: document.id,
    workspaceId: document.workspaceId,
    ownerId: document.ownerId,
    proposalId: document.proposalId,
    proposalTitle: document.proposal?.title ?? null,
    slug: document.slug,
    title: document.title,
    shareUrl: document.shareUrl,
    tokenUrl: document.tokenUrl,
    accessToken: document.accessToken,
    source: "proof",
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    lastOpenedAt: document.lastOpenedAt.toISOString(),
    archivedAt: document.archivedAt?.toISOString() ?? null,
  };
}
