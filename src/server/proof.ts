import type { Prisma } from "@prisma/client";
import { slugifyClientName } from "@/lib/clients";
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
    markdown: document.markdown,
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

export function createProofSlug(title: string) {
  const base = slugifyClientName(title).replace(/^client$/, "proof");
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `${base}-${suffix}`;
}

export function createProofAccessToken() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function createProofUrls(origin: string, slug: string, accessToken: string) {
  const query = `draft=${encodeURIComponent(slug)}&token=${encodeURIComponent(accessToken)}`;

  return {
    shareUrl: `${origin}/app/proof?${query}`,
    tokenUrl: `${origin}/app/proof?${query}`,
  };
}
