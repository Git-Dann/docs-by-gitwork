import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { prisma } from "@/lib/prisma";
import { embedConversation } from "@/server/care-agents/embeddings";
import { aiKeyFor } from "@/server/ai-keys";
import { forEachWorkspace } from "@/server/workspaces/for-each";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Processes up to 50 unembedded conversations per workspace per run.
// Ordered newest-first so recently ingested items get semantic search quickly.
const BATCH_SIZE = 50;

export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    // Once per workspace, each with its own key and only its own conversations. This used to
    // pick every workspace's unembedded conversations and embed them all with Gitwork's key.
    const workspaces = await forEachWorkspace(
      {
        select: {
          aiProvider: true,
          anthropicApiKey: true, platformAiKeysAllowed: true, anthropicModel: true,
          openaiApiKey: true, openaiModel: true,
          geminiApiKey: true, geminiModel: true,
          localLlmUrl: true, localLlmModel: true,
        },
      },
      async (workspace) => {
        const apiKey = aiKeyFor("OPENAI", workspace, "env");
        if (!apiKey) return { skipped: true as const, total: 0, embedded: 0, errors: [] as string[] };

        // Raw SQL because the embedding column isn't in the Prisma schema.
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT c.id FROM "SupportConversation" c
           JOIN "SupportClient" s ON s.id = c."clientId"
           WHERE c.embedding IS NULL AND s."workspaceId" = $2
           ORDER BY c."receivedAt" DESC
           LIMIT $1`,
          BATCH_SIZE,
          workspace.id,
        );

        let embedded = 0;
        const errors: string[] = [];
        for (const { id } of rows) {
          try {
            await embedConversation(id, workspace, workspace.id);
            embedded++;
          } catch (err) {
            errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
        return { skipped: false as const, total: rows.length, embedded, errors };
      },
    );

    const done = workspaces.flatMap((w) => (w.ok ? [w.result] : []));
    if (done.length > 0 && done.every((r) => r.skipped)) {
      return apiOk({ skipped: true, reason: "No OpenAI API key configured" });
    }
    return apiOk({
      total: done.reduce((n, r) => n + r.total, 0),
      embedded: done.reduce((n, r) => n + r.embedded, 0),
      errors: [...done.flatMap((r) => r.errors), ...workspaces.flatMap((w) => (w.ok ? [] : [w.error]))],
      workspaces: workspaces.map((w) => ({ workspaceId: w.workspaceId, ok: w.ok, skipped: w.ok ? w.result.skipped : undefined })),
    });
  } catch (error) {
    return fromError(error);
  }
}
