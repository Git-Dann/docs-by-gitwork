import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { updatePlatformLogin, deletePlatformLogin } from "@/server/clients";
import { platformLoginUpdateSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ slug: string; platformId: string; loginId: string }> };

/** PATCH — edit a login's label/username/password (omit a field to leave it untouched). */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { slug, platformId, loginId } = await params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "manage platform logins");
    await assertClientAccessBySlug(user, slug);
    const body = platformLoginUpdateSchema.parse(await request.json());
    const login = await updatePlatformLogin(slug, platformId, loginId, body);
    if (!login) return apiError("Login not found", 404);
    return apiOk({ login });
  } catch (error) {
    return fromError(error);
  }
}

/** DELETE — remove a login. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { slug, platformId, loginId } = await params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "manage platform logins");
    await assertClientAccessBySlug(user, slug);
    const ok = await deletePlatformLogin(slug, platformId, loginId);
    if (!ok) return apiError("Login not found", 404);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
