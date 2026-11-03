import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { createLeadAction } from "@/server/crm/service";
import { leadActionCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/** POST /api/clients/{slug}/crm/actions — add an action (owner defaults to whoever adds it). */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "add a lead action");
    await assertClientAccessBySlug(user, slug);
    const input = leadActionCreateSchema.parse(await request.json());
    const action = await createLeadAction(slug, input, user);
    if (!action) return apiError("Client not found", 404);
    return apiOk({ action }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
