import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { getLeadCrmStatus, resolveStageSuggestion } from "@/server/crm/service";
import { crmSuggestionResolveSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string; id: string }>;
}

/** POST /api/clients/{slug}/crm/suggestions/{id} — { action: "accept" | "dismiss" }. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug, id } = await context.params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "resolve a stage suggestion");
    await assertClientAccessBySlug(user, slug);
    const { action } = crmSuggestionResolveSchema.parse(await request.json());
    const ok = await resolveStageSuggestion(slug, id, action, user);
    if (!ok) return apiError("Suggestion not found", 404);
    return apiOk({ crm: await getLeadCrmStatus(slug, user) });
  } catch (error) {
    return fromError(error);
  }
}
