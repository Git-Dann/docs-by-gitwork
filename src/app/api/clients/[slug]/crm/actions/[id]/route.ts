import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { deleteLeadAction, updateLeadAction } from "@/server/crm/service";
import { leadActionUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string; id: string }>;
}

/** PATCH /api/clients/{slug}/crm/actions/{id} — edit, or accept / dismiss / done / reopen. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "update a lead action");
    await assertClientAccessBySlug(user, slug);
    const input = leadActionUpdateSchema.parse(await request.json());
    const action = await updateLeadAction(slug, id, input, user);
    if (!action) return apiError("Action not found", 404);
    return apiOk({ action });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "delete a lead action");
    await assertClientAccessBySlug(user, slug);
    const deleted = await deleteLeadAction(slug, id);
    if (!deleted) return apiError("Action not found", 404);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
