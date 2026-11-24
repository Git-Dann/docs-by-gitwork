import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { deleteCodeVariant } from "@/server/wiki-code";
import { clientIdForSlug } from "@/server/clients-scope";
import { assertClientWriter } from "@/server/client-write-access";
import { codeActorFor } from "@/server/wiki-code-actor";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string; moduleId: string; variantId: string }> }) {
  try {
    const { slug, moduleId, variantId } = await params;
    await assertClientWriter(req, slug);
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const ok = await deleteCodeVariant(clientId, moduleId, variantId, await codeActorFor(req));
    if (!ok) return apiError("Variant not found", 404);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
