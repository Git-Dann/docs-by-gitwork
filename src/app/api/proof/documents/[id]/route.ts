import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { proofDocumentInclude, serializeProofDocument } from "@/server/proof";

const updateProofDocumentSchema = z.object({
  proposalId: z.string().cuid().nullable().optional(),
  touch: z.boolean().optional(),
  archived: z.boolean().optional(),
  title: z.string().trim().min(1).max(120).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const body = updateProofDocumentSchema.parse(await request.json());
    const { id } = await context.params;
    const { workspace } = await ensureBaseRecords();

    const existing = await prisma.proofDocument.findFirst({
      where: {
        id,
        workspaceId: workspace.id,
      },
      include: proofDocumentInclude,
    });

    if (!existing) {
      return apiError("Proof document not found.", 404);
    }

    let proposalId: string | null | undefined = undefined;
    if (Object.prototype.hasOwnProperty.call(body, "proposalId")) {
      proposalId = body.proposalId ?? null;
      if (proposalId) {
        const proposal = await prisma.document.findFirst({
          where: {
            id: proposalId,
            workspaceId: workspace.id,
            documentType: "PROPOSAL",
          },
          select: {
            id: true,
          },
        });

        if (!proposal) {
          return apiError("Proposal not found for Proof link.", 404);
        }
      }
    }

    const document = await prisma.proofDocument.update({
      where: {
        id: existing.id,
      },
      data: {
        ...(proposalId !== undefined ? { proposalId } : {}),
        ...(body.title ? { title: body.title } : {}),
        ...(body.touch ? { lastOpenedAt: new Date() } : {}),
        ...(body.archived === true ? { archivedAt: new Date() } : {}),
        ...(body.archived === false ? { archivedAt: null } : {}),
      },
      include: proofDocumentInclude,
    });

    return apiOk({ document: serializeProofDocument(document) });
  } catch (error) {
    return fromError(error);
  }
}
