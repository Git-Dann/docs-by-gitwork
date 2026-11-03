import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { convertLeadToClient, getConversionPreview } from "@/server/crm/service";
import { crmConvertSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/** GET /api/clients/{slug}/crm/convert — what conversion would fill in, and the proposal to plan from. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "convert a lead");
    await assertClientAccessBySlug(user, slug);
    const preview = await getConversionPreview(slug);
    if (!preview) return apiError("Client not found", 404);
    return apiOk({ preview });
  } catch (error) {
    return fromError(error);
  }
}

/** POST /api/clients/{slug}/crm/convert — { fields: [...] } → an ACTIVE client. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "convert a lead");
    await assertClientAccessBySlug(user, slug);
    const input = crmConvertSchema.parse(await request.json());
    const result = await convertLeadToClient(slug, input, user);
    if (!result) return apiError("Client not found", 404);
    return apiOk({ result });
  } catch (error) {
    return fromError(error);
  }
}
