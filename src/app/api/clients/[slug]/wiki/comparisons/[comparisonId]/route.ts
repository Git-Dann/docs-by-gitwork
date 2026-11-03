import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { deleteWikiComparison, updateWikiComparison } from "@/server/wiki-comparisons";
import { comparisonSchema } from "@/server/validators";
import { clientIdForSlug } from "@/server/clients-scope";

/** Replaces the table's title, description, columns AND rows — see wiki-comparisons.ts. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; comparisonId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "edit a comparison");
    const { slug, comparisonId } = await params;
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const body = comparisonSchema.parse(await req.json());
    return apiOk(await updateWikiComparison(clientId, comparisonId, body));
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; comparisonId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "delete a comparison");
    const { slug, comparisonId } = await params;
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    await deleteWikiComparison(clientId, comparisonId);
    return apiOk({ deleted: true });
  } catch (err) {
    return fromError(err);
  }
}
