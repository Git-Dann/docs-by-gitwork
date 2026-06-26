import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { addClientTouchpoint, listClientTouchpoints } from "@/server/clients";
import { touchpointCreateSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/** GET /api/clients/{slug}/touchpoints — the CRM activity log for a lead/client. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    await assertClientAccessBySlug(await getEffectiveUserOrNull(request), slug);
    const touchpoints = await listClientTouchpoints(slug);
    if (!touchpoints) return apiError("Client not found", 404);
    return apiOk({ touchpoints });
  } catch (error) {
    return fromError(error);
  }
}

/** POST /api/clients/{slug}/touchpoints — log a touchpoint. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "log a touchpoint");
    await assertClientAccessBySlug(user, slug);
    const body = touchpointCreateSchema.parse(await request.json());
    const touchpoint = await addClientTouchpoint(slug, body, user);
    if (!touchpoint) return apiError("Client not found", 404);
    return apiOk({ touchpoint }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
