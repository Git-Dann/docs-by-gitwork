import { NextRequest, after } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { buildSyncContext, syncConnection } from "@/server/support-sync";
import { enrichConversations } from "@/server/care-agents/enrich";

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

    // Non-gating enrichment (sentiment/triage/draft) runs after the response so it
    // can't block or fail the sync. Ingestion has already stored everything.
    const newIds = result.newConversationIds ?? [];
    if (newIds.length > 0) {
      after(() =>
        enrichConversations({ workspace: ctx.workspace }, newIds).catch(console.error),
      );
    }

    return apiOk(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("coming soon")) {
      return apiError(error.message, 400);
    }
    return fromError(error);
  }
}
