import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { revealClientPlatform } from "@/server/clients";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

/**
 * Reveal decrypted credentials for a platform. Gated by middleware (NextAuth session or
 * workspace API key) and canManageClients — mirrors the bank-details reveal. Server-side
 * decrypt only; never cached.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; platformId: string }> },
) {
  try {
    const { slug, platformId } = await params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "reveal platform credentials");
    await assertClientAccessBySlug(user, slug);
    const credentials = await revealClientPlatform(slug, platformId);
    if (!credentials) return apiError("Platform not found", 404);
    return apiOk({ credentials });
  } catch (error) {
    return fromError(error);
  }
}
