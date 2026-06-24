import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { revealClientBank } from "@/server/clients";
import { assertCan, canManageClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { recordAuditEntry } from "@/server/audit-log";

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
    // Audit the decryption of sensitive bank data (append-only, never blocks the read).
    void recordAuditEntry({
      workspaceId: user!.workspaceId,
      actorId: user!.id,
      action: "client.bank.revealed",
      target: slug,
    });
    return apiOk({ bank });
  } catch (error) {
    return fromError(error);
  }
}
