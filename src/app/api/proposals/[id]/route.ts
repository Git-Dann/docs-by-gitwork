import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { updateDocument } from "@/server/documents";
import { proposalUpdateSchema } from "@/server/validators";
import { allowedDocTypesForUser, canViewCosts, getEffectiveUserOrNull } from "@/server/auth/effective-user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Type-agnostic: any document type (proposal, contract, handover, report, brief, blank)
    // is fetched by id — the editor at /app/docs/[id] is generic. id is a unique cuid.
    const document = await prisma.document.findFirst({
      where: {
        id,
      },
      include: proposalInclude,
    });

    if (!document) {
      return apiError("Document not found", 404);
    }

    const user = await getEffectiveUserOrNull(request);
    // Type gate: a developer must never open an admin doc type. 404 (not 403) so the doc's
    // existence isn't leaked.
    if (user && !allowedDocTypesForUser(user).includes(document.documentType)) {
      return apiError("Document not found", 404);
    }
    // Field gate: blank costs/margins for users without docs.viewCosts (API-key → full).
    const showCosts = user ? canViewCosts(user) : true;
    return apiOk({ proposal: serializeProposal(document, { canViewCosts: showCosts }) });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const actor = await getEffectiveUserOrNull(request);
    const { id } = await context.params;
    const payload = proposalUpdateSchema.parse(await request.json());
    const proposal = await updateDocument(actor, id, payload);
    return apiOk({ proposal });
  } catch (error) {
    return fromError(error);
  }
}
