import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { revealClientBank } from "@/server/clients";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";

export const dynamic = "force-dynamic";

/**
 * Reveal decrypted bank details for a client. Gated by middleware (NextAuth
 * session or workspace API key). Returns 404 when no bank record exists.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageClients, "reveal bank details");
    await assertClientAccessBySlug(user, slug);
    const bank = await revealClientBank(slug);
    if (!bank) return apiError("No bank details on file", 404);
    return apiOk({ bank });
  } catch (error) {
    return fromError(error);
  }
}
