import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPulseScan } from "@/server/pulse";
import { ensureBaseRecords } from "@/server/bootstrap";
import { runFixAgent } from "@/server/pulse-agents/fix-agent";
import { assertCan, canRunFixAgent, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { DEFAULT_MODELS } from "@/server/ai-provider";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    // High-risk: opens GitHub PRs. Gate on `pulse.fixAgent` (Admin-only by default).
    assertCan(await getEffectiveUserOrNull(request), canRunFixAgent, "run the fix-agent");
    const { scanId } = await params;
    const scan = await getPulseScan(scanId);
    if (!scan) return apiError("Scan not found.", 404);
    if (scan.status !== "COMPLETED") return apiError("Only completed scans can be fixed.", 400);
    if (scan.inputType !== "GITHUB_REPO") return apiError("Fix agent only works with GitHub repo scans.", 400);

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
      model: p === "OPENAI" ? (workspace.openaiModel ?? DEFAULT_MODELS.OPENAI)
           : p === "GEMINI" ? (workspace.geminiModel ?? DEFAULT_MODELS.GEMINI)
           : p === "LOCAL"  ? (workspace.localLlmModel ?? DEFAULT_MODELS.LOCAL)
           : (workspace.anthropicModel ?? DEFAULT_MODELS.ANTHROPIC),
      baseUrl: p === "GEMINI" ? "https://generativelanguage.googleapis.com/v1beta/openai/"
             : p === "LOCAL"  ? (workspace.localLlmUrl ?? "http://localhost:11434/v1")
             : null,
    };
    if (!aiConfig.apiKey) return apiError("No AI API key configured — add one in Settings → Integrations.", 400);
    if (!process.env.GITHUB_TOKEN?.trim()) return apiError("GITHUB_TOKEN is not set — add it to your environment variables to allow the fix agent to create pull requests.", 400);

    const result = await runFixAgent(scanId, aiConfig);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
