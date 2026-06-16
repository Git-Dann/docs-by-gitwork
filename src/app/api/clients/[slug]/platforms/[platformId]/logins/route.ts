import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { createPlatformLogin } from "@/server/clients";
import { platformLoginCreateSchema } from "@/server/validators";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

/** POST /api/clients/{slug}/platforms/{platformId}/logins — add a credential set (encrypted). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; platformId: string }> },
) {
  try {
    const { slug, platformId } = await params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "manage platform logins");
    await assertClientAccessBySlug(user, slug);
    const body = platformLoginCreateSchema.parse(await request.json());
    const login = await createPlatformLogin(slug, platformId, body);
    if (!login) return apiError("Platform not found", 404);
    return apiOk({ login }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
