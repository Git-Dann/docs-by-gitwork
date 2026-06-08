import { NextRequest, after } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { syncConnection } from "@/server/support-sync";
import { enrichConversations } from "@/server/care-agents/enrich";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${secret}`) {
        return apiError("Unauthorized", 401);
      }
    }

    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: {
        id: true,
        googleServiceAccountJson: true,
        googleSubjectEmail: true,
        googleOAuthRefreshToken: true,
        aiProvider: true,
        anthropicApiKey: true,
        anthropicModel: true,
        openaiApiKey: true,
        openaiModel: true,
        geminiApiKey: true,
        geminiModel: true,
        localLlmUrl: true,
        localLlmModel: true,
      },
    });

    if (!workspace) return apiError("Workspace not found", 404);

    const connections = await prisma.accountConnection.findMany({
      where: { health: "CONNECTED", client: { workspaceId: workspace.id } },
      include: {
        channelTokens: true,
        client: { select: { id: true, name: true, slug: true } },
      },
    });

    let totalIngested = 0;
    let totalFiltered = 0;
    const allErrors: string[] = [];
    const allNewConversationIds: string[] = [];

    const results = await Promise.allSettled(
      connections.map(async (conn) => {
        const ctx = {
          connection: conn,
          client: conn.client,
          workspace,
        };
        const result = await syncConnection(ctx);
        return { connId: conn.id, source: conn.source, result };
      }),
    );

    for (const res of results) {
      if (res.status === "fulfilled") {
        totalIngested += res.value.result.ingested;
        totalFiltered += res.value.result.filtered;
        allNewConversationIds.push(...(res.value.result.newConversationIds ?? []));
        if (res.value.result.errors.length > 0) {
          allErrors.push(
            ...res.value.result.errors.map((e) => `[${res.value.source}:${res.value.connId.slice(-6)}] ${e}`),
          );
        }
      } else {
        allErrors.push(String(res.reason));
      }
    }

    // Enrich newly-ingested conversations after the response (non-gating).
    if (allNewConversationIds.length > 0) {
      after(() =>
        enrichConversations({ workspace }, allNewConversationIds, { max: 50 }).catch(console.error),
      );
    }

    return apiOk({
      total: connections.length,
      ingested: totalIngested,
      filtered: totalFiltered,
      errors: allErrors,
    });
  } catch (error) {
    return fromError(error);
  }
}
