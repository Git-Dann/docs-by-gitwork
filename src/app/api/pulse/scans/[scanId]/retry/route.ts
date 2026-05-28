import { after } from "next/server";
import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPulseScan, retryPulseScan, runAnalysis } from "@/server/pulse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const existing = await getPulseScan(scanId);
    if (!existing) return apiError("Scan not found.", 404);
    if (existing.status !== "FAILED") return apiError("Only failed scans can be retried.", 400);

    const { scan, aiConfig } = await retryPulseScan(scanId);

    after(() =>
      runAnalysis(scan.id, {
        inputType: existing.inputType,
        inputUrl: existing.inputUrl ?? undefined,
        inputGithubRepo: existing.inputGithubRepo ?? undefined,
        inputDescription: existing.inputDescription ?? undefined,
        projectName: existing.projectName,
        clientId: existing.clientId ?? undefined,
      }, aiConfig)
    );

    return apiOk({ scan });
  } catch (error) {
    return fromError(error);
  }
}
