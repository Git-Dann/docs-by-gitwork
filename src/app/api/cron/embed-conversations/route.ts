import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { embedConversation } from "@/server/care-agents/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Processes up to 50 unembedded conversations per run.
// Ordered newest-first so recently ingested items get semantic search quickly.
const BATCH_SIZE = 50;

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get("Authorization") !== `Bearer ${secret}`) {
      return apiError("Unauthorized", 401);
    }

    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: {
        aiProvider: true,
        anthropicApiKey: true, anthropicModel: true,
        openaiApiKey: true, openaiModel: true,
        geminiApiKey: true, geminiModel: true,
        localLlmUrl: true, localLlmModel: true,
      },
    });
    if (!workspace) return apiError("Workspace not found", 404);

    const apiKey = process.env.OPENAI_API_KEY ?? workspace.openaiApiKey ?? null;
    if (!apiKey) return apiOk({ skipped: true, reason: "No OpenAI API key configured" });

    // Raw SQL because the embedding column isn't in the Prisma schema.
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "SupportConversation"
       WHERE embedding IS NULL
       ORDER BY "receivedAt" DESC
       LIMIT $1`,
      BATCH_SIZE,
    );

    let embedded = 0;
    const errors: string[] = [];

    for (const { id } of rows) {
      try {
        await embedConversation(id, workspace);
        embedded++;
      } catch (err) {
        errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return apiOk({ total: rows.length, embedded, errors });
  } catch (error) {
    return fromError(error);
  }
}
