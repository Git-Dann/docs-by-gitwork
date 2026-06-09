import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { generateEmbedding } from "@/server/care-agents/embeddings";

export const dynamic = "force-dynamic";

interface SearchResult {
  id: string;
  subject: string;
  preview: string | null;
  source: string;
  customerLabel: string;
  receivedAt: Date;
  distance: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const body = await request.json() as { query?: string; limit?: number };
    const query = body.query?.trim();
    if (!query) return apiError("query is required", 400);
    const limit = Math.min(body.limit ?? 10, 25);

    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: {
        openaiApiKey: true,
        aiProvider: true,
        anthropicApiKey: true,
        anthropicModel: true,
        openaiModel: true,
        geminiApiKey: true,
        geminiModel: true,
        localLlmUrl: true,
        localLlmModel: true,
      },
    });

    const apiKey = process.env.OPENAI_API_KEY ?? workspace?.openaiApiKey ?? null;
    if (!apiKey) return apiError("OpenAI API key not configured — semantic search requires an OpenAI key", 400);

    const queryEmbedding = await generateEmbedding(query, apiKey);
    const vectorStr = `[${queryEmbedding.join(",")}]`;

    const rows = await prisma.$queryRawUnsafe<SearchResult[]>(
      `SELECT id, subject, preview, source, "customerLabel", "receivedAt",
              (embedding <=> $2::vector) AS distance
       FROM "SupportConversation"
       WHERE "clientId" = $1
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector
       LIMIT $3`,
      clientId,
      vectorStr,
      limit,
    );

    const results = rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      preview: r.preview,
      source: (r.source as string).toLowerCase(),
      customerLabel: r.customerLabel,
      receivedAt: new Date(r.receivedAt).toISOString(),
      score: Math.max(0, 1 - Number(r.distance)),
    }));

    return apiOk({ results });
  } catch (error) {
    return fromError(error);
  }
}
