/**
 * POST /api/documents/[id]/ai/section
 *
 * Rewrite a single section of a document via AI. Used by the per-section "Expand with AI"
 * button in the Builder.
 *
 * Body: { sectionKey: string, instruction: string }
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { AiNotConfiguredError, expandSection } from "@/server/document-ai";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import type { SectionKey } from "@/types/proposal";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const schema = z.object({
  sectionKey: z.string().min(1),
  instruction: z.string().min(2).max(2000),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = schema.parse(await request.json());
    const { workspace } = await ensureBaseRecords();

    const doc = await prisma.document.findUnique({
      where: { id },
      select: { id: true, archivedAt: true, workspaceId: true },
    });
    if (!doc) return apiError("Document not found", 404);
    if (doc.archivedAt) return apiError("Cannot edit an archived document", 409);

    await expandSection({
      documentId: id,
      workspaceId: doc.workspaceId ?? workspace.id,
      sectionKey: body.sectionKey as SectionKey,
      instruction: body.instruction,
    });

    const fresh = await prisma.document.findUniqueOrThrow({
      where: { id },
      include: proposalInclude,
    });

    return apiOk({ proposal: serializeProposal(fresh) });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return apiError(error.message, 412);
    }
    return fromError(error);
  }
}
