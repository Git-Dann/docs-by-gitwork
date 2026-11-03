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

/**
 * Each workspace's conversations are embedded with THAT workspace's own key, and only its own
 * conversations are selected, so a business's text is never sent with another's key.
 */
export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    const runs = await forEachWorkspace(
      {
        where: { supportClients: { some: {} } },
        select: {
          id: true,
          aiProvider: true,
          anthropicApiKey: true, platformAiKeysAllowed: true, anthropicModel: true,
          openaiApiKey: true, openaiModel: true,
          geminiApiKey: true, geminiModel: true,
          localLlmUrl: true, localLlmModel: true,
        },
      },
      async (workspace) => {
        const apiKey = aiKeyFor("OPENAI", workspace, "env");
        if (!apiKey) return { total: 0, embedded: 0, errors: [] as string[], skipped: "No OpenAI API key configured" };

        // Raw SQL because the embedding column isn't in the Prisma schema.
        const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT c.id FROM "SupportConversation" c
           JOIN "SupportClient" sc ON sc.id = c."clientId"
           WHERE c.embedding IS NULL AND sc."workspaceId" = $1
           ORDER BY c."receivedAt" DESC
           LIMIT $2`,
          workspace.id,
          BATCH_SIZE,
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
        return { total: rows.length, embedded, errors, skipped: null as string | null };
      },
    );

    let total = 0;
    let embedded = 0;
    const errors: string[] = [];
    for (const run of runs) {
      if (!run.ok) {
        errors.push(`[${run.workspaceId}] ${run.error}`);
        continue;
      }
      total += run.result.total;
      embedded += run.result.embedded;
      errors.push(...run.result.errors);
    }
    return apiOk({ total, embedded, errors, workspaces: runs.length });
  } catch (error) {
    return fromError(error);
  }
}
