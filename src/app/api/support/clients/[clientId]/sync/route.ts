import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { syncClientConnections } from "@/server/support-sync";
import { requireSupportClient } from "@/server/support-scope";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Client-level "Sync now" — pulls every connected channel for this client on demand,
// then runs the same enrichment + routing pass as the daily cron.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    await requireSupportClient(request, clientId, "manage");
    const result = await syncClientConnections(clientId);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
