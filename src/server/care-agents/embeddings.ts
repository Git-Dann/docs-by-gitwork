import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import type { WorkspaceAiFields } from "@/server/ai-provider";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

function resolveOpenAiKey(ws: WorkspaceAiFields): string | null {
  return process.env.OPENAI_API_KEY ?? ws.openaiApiKey ?? null;
}

export async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000),
    encoding_format: "float",
  });
  return response.data[0].embedding;
}

function conversationText(conv: { subject: string; preview: string | null; tags: string[] }): string {
  return [conv.subject, conv.preview ?? "", conv.tags.filter((t) => !t.startsWith("kw:")).join(" ")]
    .join(" ")
    .trim();
}

export async function embedConversation(
  convId: string,
  workspace: WorkspaceAiFields,
): Promise<void> {
  const apiKey = resolveOpenAiKey(workspace);
  if (!apiKey) return; // No OpenAI key configured — skip silently

  const conv = await prisma.supportConversation.findUnique({
    where: { id: convId },
    select: { subject: true, preview: true, tags: true },
  });
  if (!conv) return;

  const text = conversationText(conv);
  if (!text.trim()) return;

  const embedding = await generateEmbedding(text, apiKey);
  const vectorStr = `[${embedding.join(",")}]`;

  await prisma.$executeRaw`
    UPDATE "SupportConversation"
    SET embedding = ${vectorStr}::vector
    WHERE id = ${convId}
  `;
}

export interface SimilarConversation {
  id: string;
  subject: string;
  customerLabel: string;
  messages: Array<{ direction: string; body: string }>;
  similarity: number;
}

/**
 * Finds conversations for the same client that already have an outbound reply,
 * ordered by cosine similarity to the given conversation. Used to ground AI drafts
 * in how similar issues were actually resolved before.
 */
export async function findSimilarReplied(
  convId: string,
  clientId: string,
  workspace: WorkspaceAiFields,
  topN = 3,
): Promise<SimilarConversation[]> {
  const apiKey = resolveOpenAiKey(workspace);
  if (!apiKey) return [];

  // Retrieve the current conversation's stored embedding (or generate it on the fly
  // so the very first draft for a new conversation still benefits from RAG).
  const embeddingRows = await prisma.$queryRawUnsafe<Array<{ embedding: string | null }>>(
    `SELECT embedding::text FROM "SupportConversation" WHERE id = $1`,
    convId,
  );

  let vectorStr: string;
  const storedEmbedding = embeddingRows[0]?.embedding ?? null;

  if (storedEmbedding) {
    vectorStr = storedEmbedding;
  } else {
    const conv = await prisma.supportConversation.findUnique({
      where: { id: convId },
      select: { subject: true, preview: true, tags: true },
    });
    if (!conv) return [];
    const text = conversationText(conv);
    if (!text.trim()) return [];
    const embedding = await generateEmbedding(text, apiKey);
    vectorStr = `[${embedding.join(",")}]`;
    // Persist so the async cron doesn't need to re-generate it
    await prisma.$executeRaw`
      UPDATE "SupportConversation"
      SET embedding = ${vectorStr}::vector
      WHERE id = ${convId}
    `;
  }

  // Conversations for the same client that have at least one outbound reply
  const similar = await prisma.$queryRawUnsafe<
    Array<{ id: string; subject: string; customerLabel: string; similarity: number }>
  >(
    `SELECT sc.id, sc.subject, sc."customerLabel",
            1 - (sc.embedding <=> $1::vector) AS similarity
     FROM "SupportConversation" sc
     WHERE sc."clientId" = $2
       AND sc.id != $3
       AND sc.embedding IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM "SupportMessage" sm
         WHERE sm."conversationId" = sc.id
           AND sm.direction = 'outbound'
       )
     ORDER BY sc.embedding <=> $1::vector
     LIMIT $4`,
    vectorStr,
    clientId,
    convId,
    topN,
  );

  if (similar.length === 0) return [];

  const ids = similar.map((r) => r.id);
  const messages = await prisma.supportMessage.findMany({
    where: { conversationId: { in: ids } },
    orderBy: { createdAt: "asc" },
    select: { conversationId: true, direction: true, body: true },
  });

  const msgMap = new Map<string, Array<{ direction: string; body: string }>>();
  for (const msg of messages) {
    const list = msgMap.get(msg.conversationId) ?? [];
    list.push({ direction: msg.direction, body: msg.body });
    msgMap.set(msg.conversationId, list);
  }

  return similar.map((r) => ({
    id: r.id,
    subject: r.subject,
    customerLabel: r.customerLabel,
    messages: msgMap.get(r.id) ?? [],
    similarity: Number(r.similarity),
  }));
}

export { EMBEDDING_DIM, resolveOpenAiKey };
