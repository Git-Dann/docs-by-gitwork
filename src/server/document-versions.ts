/**
 * Document version snapshots (P1.6).
 *
 * Each snapshot freezes the current sections array, cost line items, and timeline phases into
 * a DocumentVersion row, keyed by the document's `version` string. Operators can list previous
 * versions and diff any two of them.
 *
 * Independent of SignatureRequest.documentSnapshot — that frozen copy is signing-scoped (one
 * per send-for-signature event). This module is user-driven (operator clicks "Save version").
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface CreateVersionInput {
  documentId: string;
  version: string;        // The new version string (e.g. "v1.1")
  changelog?: string;
  createdById: string;
}

export async function createDocumentVersion(input: CreateVersionInput) {
  const doc = await prisma.document.findUnique({
    where: { id: input.documentId },
    include: {
      sections: { orderBy: { sortOrder: "asc" } },
      costLineItems: { orderBy: { sortOrder: "asc" } },
      timelinePhases: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!doc) throw new Error("Document not found.");

  // Bump the document's `version` field to match the snapshot label so future snapshots align.
  return prisma.$transaction(async (tx) => {
    const snapshot = await tx.documentVersion.create({
      data: {
        documentId: input.documentId,
        version: input.version,
        sectionsSnapshot: doc.sections as unknown as Prisma.InputJsonValue,
        costSnapshot: doc.costLineItems as unknown as Prisma.InputJsonValue,
        timelineSnapshot: doc.timelinePhases as unknown as Prisma.InputJsonValue,
        changelog: input.changelog ?? null,
        createdById: input.createdById,
      },
    });

    await tx.document.update({
      where: { id: input.documentId },
      data: { version: input.version },
    });

    return snapshot;
  });
}

export async function listDocumentVersions(documentId: string) {
  return prisma.documentVersion.findMany({
    where: { documentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      version: true,
      changelog: true,
      createdById: true,
      createdAt: true,
    },
  });
}

export async function getDocumentVersion(versionId: string) {
  return prisma.documentVersion.findUnique({ where: { id: versionId } });
}
