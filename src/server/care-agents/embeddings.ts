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

export { EMBEDDING_DIM, resolveOpenAiKey };
