import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { revealPlatformLogin } from "@/server/clients";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

/** POST — reveal one login's decrypted credentials. Gated like the bank/platform reveal. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; platformId: string; loginId: string }> },
) {
  try {
    const { slug, platformId, loginId } = await params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "reveal platform credentials");
    await assertClientAccessBySlug(user, slug);
    const credentials = await revealPlatformLogin(slug, platformId, loginId);
    if (!credentials) return apiError("Login not found", 404);
    return apiOk({ credentials });
  } catch (error) {
    return fromError(error);
  }
}
