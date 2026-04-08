import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { proofDocumentInclude, serializeProofDocument } from "@/server/proof";
import { proofUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const body = proofUpdateSchema.parse(await request.json());
    const { workspace } = await ensureBaseRecords();
    const { id } = await context.params;

    const existing = await prisma.proofDocument.findFirst({
      where: {
        id,
        workspaceId: workspace.id,
      },
    });

    if (!existing) {
      return apiError("Proof document not found.", 404);
    }

    const document = await prisma.proofDocument.update({
      where: {
        id: existing.id,
      },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.markdown !== undefined ? { markdown: body.markdown } : {}),
        ...(body.proposalId !== undefined ? { proposalId: body.proposalId } : {}),
        ...(body.touch ? { lastOpenedAt: new Date() } : {}),
        ...(body.archived !== undefined
          ? { archivedAt: body.archived ? new Date() : null }
          : {}),
      },
      include: proofDocumentInclude,
    });

    return apiOk({ document: serializeProofDocument(document) });
  } catch (error) {
    return fromError(error);
  }
}
