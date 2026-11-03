import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { deleteWikiCostItem, updateWikiCostItem } from "@/server/wiki-costs";
import { costItemSchema } from "@/server/validators";
import { clientIdForSlug } from "@/server/clients-scope";

/** Replaces the line AND its whole tier ladder — see the note in wiki-costs.ts. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; itemId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "edit a cost line");
    const { slug, itemId } = await params;
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    const body = costItemSchema.parse(await req.json());
    try {
      return apiOk(await updateWikiCostItem(clientId, itemId, body));
    } catch {
      return apiError("Cost line not found", 404);
    }
  } catch (err) {
    return fromError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; itemId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(req), canManageClients, "delete a cost line");
    const { slug, itemId } = await params;
    const clientId = await clientIdForSlug(slug, req);
    if (!clientId) return apiError("Client not found", 404);
    return apiOk(await deleteWikiCostItem(clientId, itemId));
  } catch (err) {
    return fromError(err);
  }
}
