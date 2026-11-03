import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { getLeadCrmStatus, updateLeadCrmSettings } from "@/server/crm/service";
import { crmSettingsSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/** GET /api/clients/{slug}/crm — the lead's automation state, suggestions, actions and next step. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const user = await getEffectiveUserOrNull(request);
    await assertClientAccessBySlug(user, slug);
    const status = await getLeadCrmStatus(slug, user);
    if (!status) return apiError("Client not found", 404);
    return apiOk({ crm: status });
  } catch (error) {
    return fromError(error);
  }
}

/** PATCH /api/clients/{slug}/crm — automation on/off, email domains, owner, resume a pinned stage. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "change CRM settings");
    await assertClientAccessBySlug(user, slug);
    const input = crmSettingsSchema.parse(await request.json());
    const ok = await updateLeadCrmSettings(slug, input);
    if (!ok) return apiError("Client not found", 404);
    return apiOk({ crm: await getLeadCrmStatus(slug, user) });
  } catch (error) {
    return fromError(error);
  }
}
