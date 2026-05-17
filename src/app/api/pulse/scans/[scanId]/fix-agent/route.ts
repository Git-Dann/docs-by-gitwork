import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPulseScan } from "@/server/pulse";
import { ensureBaseRecords } from "@/server/bootstrap";
import { runFixAgent } from "@/server/pulse-fix-agent";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const scan = await getPulseScan(scanId);
    if (!scan) return apiError("Scan not found.", 404);
    if (scan.status !== "COMPLETED") return apiError("Only completed scans can be fixed.", 400);
    if (scan.inputType !== "GITHUB_REPO") return apiError("Fix agent only works with GitHub repo scans.", 400);

    const { workspace } = await ensureBaseRecords();
    const apiKey = process.env.ANTHROPIC_API_KEY ?? workspace.anthropicApiKey ?? null;
    if (!apiKey) return apiError("Anthropic API key required for the fix agent.", 400);

    const aiConfig = {
      provider: "ANTHROPIC" as const,
      apiKey,
      model: workspace.anthropicModel ?? "claude-opus-4-7",
      baseUrl: null,
    };

    const result = await runFixAgent(scanId, aiConfig);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
