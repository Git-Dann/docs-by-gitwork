import { NextRequest } from "next/server";
import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";

export const dynamic = "force-dynamic";

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 7)}${"•".repeat(Math.min(16, key.length - 11))}${key.slice(-4)}`;
}

export async function GET() {
  try {
    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: {
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

    const anthropicKey = process.env.ANTHROPIC_API_KEY ?? workspace?.anthropicApiKey ?? null;
    const openaiKey = process.env.OPENAI_API_KEY ?? workspace?.openaiApiKey ?? null;
    const geminiKey = process.env.GEMINI_API_KEY ?? workspace?.geminiApiKey ?? null;

    return apiOk({
      aiProvider: workspace?.aiProvider ?? "ANTHROPIC",
      anthropicKeyMasked: anthropicKey ? maskKey(anthropicKey) : null,
      anthropicKeySource: process.env.ANTHROPIC_API_KEY ? "env" : workspace?.anthropicApiKey ? "database" : null,
      anthropicModel: workspace?.anthropicModel ?? "claude-opus-4-6",
      openaiKeyMasked: openaiKey ? maskKey(openaiKey) : null,
      openaiKeySource: process.env.OPENAI_API_KEY ? "env" : workspace?.openaiApiKey ? "database" : null,
      openaiModel: workspace?.openaiModel ?? "gpt-4o",
      geminiKeyMasked: geminiKey ? maskKey(geminiKey) : null,
      geminiKeySource: process.env.GEMINI_API_KEY ? "env" : workspace?.geminiApiKey ? "database" : null,
      geminiModel: workspace?.geminiModel ?? "gemini-2.0-flash",
      localLlmUrl: workspace?.localLlmUrl ?? "",
      localLlmModel: workspace?.localLlmModel ?? "llama3.1",
    });
  } catch (error) {
    return fromError(error);
  }
}

const updateSchema = z.object({
  aiProvider: z.enum(["ANTHROPIC", "OPENAI", "GEMINI", "LOCAL"]).optional(),
  anthropicApiKey: z.string().trim().optional(),
  anthropicModel: z.string().trim().optional(),
  openaiApiKey: z.string().trim().optional(),
  openaiModel: z.string().trim().optional(),
  geminiApiKey: z.string().trim().optional(),
  geminiModel: z.string().trim().optional(),
  localLlmUrl: z.string().trim().optional(),
  localLlmModel: z.string().trim().optional(),
});

export async function PUT(request: NextRequest) {
  try {
    const body = updateSchema.parse(await request.json());

    const data: Record<string, string> = {};
    if (body.aiProvider) data.aiProvider = body.aiProvider;
    if (body.anthropicApiKey) data.anthropicApiKey = body.anthropicApiKey;
    if (body.anthropicModel) data.anthropicModel = body.anthropicModel;
    if (body.openaiApiKey) data.openaiApiKey = body.openaiApiKey;
    if (body.openaiModel) data.openaiModel = body.openaiModel;
    if (body.geminiApiKey) data.geminiApiKey = body.geminiApiKey;
    if (body.geminiModel) data.geminiModel = body.geminiModel;
    if (body.localLlmUrl) data.localLlmUrl = body.localLlmUrl;
    if (body.localLlmModel) data.localLlmModel = body.localLlmModel;

    if (Object.keys(data).length === 0) return apiOk({ saved: false });

    await prisma.workspace.updateMany({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      data,
    });

    return apiOk({ saved: true });
  } catch (error) {
    return fromError(error);
  }
}
