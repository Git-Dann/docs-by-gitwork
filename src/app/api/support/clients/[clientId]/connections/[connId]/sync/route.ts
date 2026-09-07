import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { buildSyncContext, syncConnection, runPostSyncHousekeeping } from "@/server/support-sync";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; connId: string }> },
) {
  try {
    const { connId } = await params;
    const resync = request.nextUrl.searchParams.get("resync") === "1";

    if (resync) {
      await prisma.accountConnection.update({
        where: { id: connId },
        data: { lastSyncedAt: null },
      });
    }

    const ctx = await buildSyncContext(connId);
    const result = await syncConnection(ctx);

    // ⚠️ This route used to do its own thing here — the course-request branch copy-pasted from
    // the client-level sync, and NEITHER the forwarded-identity repair nor the activity backfill.
    // Since this is the path behind the Channels panel's Refresh and "Re-sync history" buttons,
    // an operator could re-sync a visibly broken board as many times as they liked, be told it
    // succeeded, and change nothing. One shared helper now covers every entry point.
    const housekeeping = await runPostSyncHousekeeping({
      clientId: ctx.client.id,
      workspace: ctx.workspace,
      newConversationIds: result.newConversationIds ?? [],
    });

    return apiOk({ ...result, housekeeping });
  } catch (error) {
    if (error instanceof Error && error.message.includes("coming soon")) {
      return apiError(error.message, 400);
    }
    return fromError(error);
  }
}
