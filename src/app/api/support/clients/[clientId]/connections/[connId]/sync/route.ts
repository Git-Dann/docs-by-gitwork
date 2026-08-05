import { NextRequest, after } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { buildSyncContext, syncConnection } from "@/server/support-sync";
import { enrichConversations } from "@/server/care-agents/enrich";
import { evaluateWorkflowRules } from "@/server/support";
import { runCourseFeedbackImport } from "@/server/wiki-course-feedback";

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
    // Workflow rules run after enrichment so they can read triage-set sentiment/tags.
    const newIds = result.newConversationIds ?? [];
    const clientId = ctx.client.id;

    // Course-requests-only mode (support paused): skip triage/rules and auto-import
    // course requests into the wiki instead — same as the client-level sync + daily
    // cron. Runs on every sync (deduped) so this button drains any backlog, not just
    // brand-new mail. This is the path the Channels panel's Refresh/Sync buttons use.
    const sc = await prisma.supportClient.findUnique({
      where: { id: clientId },
      select: { courseRequestOnly: true, workspaceClientId: true },
    });
    if (sc?.courseRequestOnly) {
      const wsClientId = sc.workspaceClientId;
      if (wsClientId) {
        after(async () => {
          await runCourseFeedbackImport(wsClientId, { onlyCourseRequests: true }).catch(console.error);
        });
      }
    } else if (newIds.length > 0) {
      after(async () => {
        await enrichConversations({ workspace: ctx.workspace }, newIds).catch(console.error);
        await Promise.allSettled(newIds.map((convId) => evaluateWorkflowRules(clientId, convId)));
      });
    }

    return apiOk(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("coming soon")) {
      return apiError(error.message, 400);
    }
    return fromError(error);
  }
}
