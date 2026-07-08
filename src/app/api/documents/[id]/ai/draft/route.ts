/**
 * POST /api/documents/[id]/ai/draft
 *
 * Generate an AI first-draft for every section of the document based on `brief`. Optionally
 * uses a linked Pulse scan + client as additional context.
 *
 * Body: { brief: string, pulseScanId?: string, clientId?: string }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { AiNotConfiguredError, draftDocument } from "@/server/document-ai";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { assertCan, canGenerateAi, getEffectiveUserOrNull } from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const draftSchema = z.object({
  brief: z.string().min(8).max(5000),
  pulseScanId: z.string().optional(),
  clientId: z.string().optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canGenerateAi, "use AI document authoring");
    const { id } = await context.params;
    const body = draftSchema.parse(await request.json());
    const { workspace } = await ensureBaseRecords();

    const doc = await prisma.document.findUnique({
      where: { id },
      select: { id: true, archivedAt: true, workspaceId: true },
    });
    if (!doc) return apiError("Document not found", 404);
    if (doc.archivedAt) return apiError("Cannot draft into an archived document", 409);

    const result = await draftDocument({
      documentId: id,
      workspaceId: doc.workspaceId ?? workspace.id,
      brief: body.brief,
      pulseScanId: body.pulseScanId,
      clientId: body.clientId,
    });

    // Re-serialize the fully-included document for the client to apply directly.
    const fresh = await prisma.document.findUniqueOrThrow({
      where: { id },
      include: proposalInclude,
    });

    return apiOk({
      sectionsUpdated: result.sectionsUpdated,
      sectionsSkipped: result.sectionsSkipped,
      proposal: serializeProposal(fresh),
    });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return apiError(error.message, 412); // 412 Precondition Failed — user can fix in Settings
    }
    return fromError(error);
  }
}
