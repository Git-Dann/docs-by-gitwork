import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { updateDocument } from "@/server/documents";
import { proposalInclude, serializeProposal } from "@/server/proposals";
import { proposalUpdateSchema } from "@/server/validators";

/**
 * Generic, type-agnostic document read/write.
 *
 * `/api/proposals/[id]` is hardcoded to `documentType: "PROPOSAL"`, so it can't
 * serve SLA / SOW / MSA / NDA / CO / DSA documents. These endpoints work for ANY
 * document type — used by the iOS native document editor (read + write parity
 * with the web). The serialization + section/child upsert logic mirrors the
 * proposals route exactly; only the PROPOSAL filter is dropped.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const document = await prisma.document.findFirst({
      where: { id },
      include: proposalInclude,
    });

    if (!document) {
      return apiError("Document not found", 404);
    }

    return apiOk({ proposal: serializeProposal(document) });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    // Delegates to `updateDocument` — the SINGLE document write path — rather than
    // reimplementing it.
    //
    // This handler used to carry its own near-verbatim copy of that function's transaction, and
    // in doing so it silently dropped every protection the canonical path applies:
    //
    //   · `assertCan(canManageDocs)`      — ANY signed-in member could edit ANY document.
    //   · `allowedDocTypesForUser`        — a developer scoped away from admin types could edit
    //                                       (and read back, via the response) an MSA or NDA.
    //   · cost write-protection           — a user without `docs.viewCosts` reads costs blanked,
    //                                       so saving wrote their blanks over the real costing.
    //   · the ACCEPTED/DECLINED guard     — an autosave could silently downgrade a client's own
    //                                       accept/decline back to DRAFT, destroying the
    //                                       conversion signal the public page had recorded.
    //
    // It also never handled `clientId`, so linking or unlinking a Portal client through this
    // route quietly did nothing.
    //
    // The duplication WAS the bug: the two copies could not help but drift, and the copy without
    // the guards is the one three clients call. Keeping one implementation is the fix.
    const actor = await getEffectiveUserOrNull(request);
    const { id } = await context.params;
    const payload = proposalUpdateSchema.parse(await request.json());
    const proposal = await updateDocument(actor, id, payload);
    return apiOk({ proposal });
  } catch (error) {
    return fromError(error);
  }
}
