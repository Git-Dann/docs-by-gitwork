import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPulseScan } from "@/server/pulse";
import { generateDiscoveryKit } from "@/server/pulse-ai";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canGenerateAi, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { PulseScanCheckInput } from "@/types/pulse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const scan = await getPulseScan(scanId);
    if (!scan) return apiError("Scan not found.", 404);
    if (scan.status !== "COMPLETED") return apiError("Scan must be completed first.", 400);
    if (!scan.llmAnalysis) return apiError("AI synthesis must complete before generating discovery prep.", 400);
    // An already-generated kit is served to anyone; only AI-generation holders pay to create one.
    if (scan.discoveryKit) return apiOk({ kit: scan.discoveryKit });
    assertCan(await getEffectiveUserOrNull(request), canGenerateAi, "generate a Pulse discovery kit");

    const { workspace } = await ensureBaseRecords();
    const p = (workspace.aiProvider ?? "ANTHROPIC") as "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";
    const aiConfig = {
      provider: p,
      apiKey: (() => {
        if (p === "OPENAI") return process.env.OPENAI_API_KEY ?? workspace.openaiApiKey ?? null;
        if (p === "GEMINI") return process.env.GEMINI_API_KEY ?? workspace.geminiApiKey ?? null;
        if (p === "LOCAL") return workspace.openaiApiKey ?? "local";
        return process.env.ANTHROPIC_API_KEY ?? workspace.anthropicApiKey ?? null;
      })(),
      model: p === "OPENAI" ? (workspace.openaiModel ?? "gpt-4o")
           : p === "GEMINI" ? (workspace.geminiModel ?? "gemini-2.0-flash")
           : p === "LOCAL"  ? (workspace.localLlmModel ?? "llama3.1")
           : (workspace.anthropicModel ?? "claude-sonnet-5"),
      baseUrl: p === "GEMINI" ? "https://generativelanguage.googleapis.com/v1beta/openai/"
             : p === "LOCAL"  ? (workspace.localLlmUrl ?? "http://localhost:11434/v1")
             : null,
    };

    if (!aiConfig.apiKey) return apiError("No AI API key configured — add one in Settings → Integrations.", 400);

    const llm = scan.llmAnalysis;
    const kit = await generateDiscoveryKit(
      {
        projectName: scan.projectName,
        projectType: llm.projectClassification.type,
        healthScore: scan.healthScore ?? 0,
        proposalHook: llm.proposalHook,
        executiveSummary: llm.executiveSummary,
        criticalGaps: llm.criticalGaps,
        buildOpportunities: llm.buildOpportunities,
        checks: scan.checks as PulseScanCheckInput[],
      },
      aiConfig,
    );

    if (!kit) return apiError("Discovery kit generation failed — check your AI provider settings.", 500);

    await prisma.pulseScan.update({
      where: { id: scanId },
      data: { discoveryData: kit as unknown as Prisma.InputJsonValue },
    });

    return apiOk({ kit });
  } catch (error) {
    return fromError(error);
  }
}
