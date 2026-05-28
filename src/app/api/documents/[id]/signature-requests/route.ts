/**
 * Signature request endpoints for a document.
 *
 *   GET  /api/documents/[id]/signature-requests
 *        → list every SignatureRequest for this document, newest first.
 *
 *   POST /api/documents/[id]/signature-requests
 *        → create a fresh DRAFT request. If `signers` are omitted in the body, the server
 *          auto-populates them from the document's parties + signatures sections (Sprint 3
 *          structured data). Returns the new request.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  createSignatureRequest,
  inferSignersFromSections,
  listSignatureRequestsForDocument,
} from "@/server/signatures";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const signerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().min(1),
  organization: z.string().optional(),
  signatureBlockId: z.string().optional(),
});

const createSchema = z.object({
  signers: z.array(signerSchema).optional(),
  message: z.string().max(2000).optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const requests = await listSignatureRequestsForDocument(id);
    return apiOk({ requests });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = createSchema.parse(await request.json().catch(() => ({})));
    const { workspace, user } = await ensureBaseRecords();

    const document = await prisma.document.findUnique({
      where: { id },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });
    if (!document) return apiError("Document not found", 404);
    if (document.archivedAt) return apiError("Cannot send an archived document", 409);

    // Derive signers from the body if provided; otherwise read the parties / signatures
    // sections. This means the simplest flow ("just click Send") works straight from the doc.
    const signers =
      body.signers && body.signers.length > 0
        ? body.signers
        : inferSignersFromSections(
            document.sections.map((s) => ({ key: s.key, data: s.data as unknown })),
          );

    if (!signers.length) {
      return apiError(
        "No signers found. Add a parties or signatures section first, or pass signers in the body.",
        400,
      );
    }

    const requestRecord = await createSignatureRequest({
      documentId: id,
      workspaceId: workspace.id,
      createdById: user.id,
      signers,
      message: body.message,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    return apiOk({ request: requestRecord }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
