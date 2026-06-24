import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { syncClientConnections } from "@/server/support-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Client-level "Sync now" — pulls every connected channel for this client on demand,
// then runs the same enrichment + routing pass as the daily cron.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "sync Care connectors");
    const { clientId } = await params;
    const result = await syncClientConnections(clientId);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
