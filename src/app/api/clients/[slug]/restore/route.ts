import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { restoreClientRecord } from "@/server/clients";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/** POST /api/clients/{slug}/restore — bring a deleted client back, exactly as it was. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "restore clients");
    const { slug } = await context.params;
    const restored = await restoreClientRecord(slug, user);
    if (!restored) return apiError("No deleted client by that name", 404);
    return apiOk({ restored: true });
  } catch (error) {
    return fromError(error);
  }
}
