import { NextRequest } from "next/server";
import { apiOk, apiError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { serializePulseScan, pulseInclude } from "@/server/pulse";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 20) return apiError("Invalid report token.", 400);

  const record = await prisma.pulseScan.findUnique({
    where: { shareToken: token, isShared: true },
    include: pulseInclude,
  });

  if (!record) return apiError("Report not found or link has been revoked.", 404);

  const scan = serializePulseScan(record);

  // Strip internal-only fields before returning to public
  const publicScan = {
    id: scan.id,
    projectName: scan.projectName,
    inputType: scan.inputType,
    inputUrl: scan.inputUrl,
    inputGithubRepo: scan.inputGithubRepo,
    status: scan.status,
    healthScore: scan.healthScore,
    techStack: scan.techStack,
    completedAt: scan.completedAt,
    browserInsights: scan.browserInsights,
    llmAnalysis: scan.llmAnalysis
      ? {
          projectClassification: scan.llmAnalysis.projectClassification,
          executiveSummary: scan.llmAnalysis.executiveSummary,
          healthNarrative: scan.llmAnalysis.healthNarrative,
          strengths: scan.llmAnalysis.strengths,
          criticalGaps: scan.llmAnalysis.criticalGaps.slice(0, 5),
          scalingRoadmap: scan.llmAnalysis.scalingRoadmap,
          techStackAnalysis: scan.llmAnalysis.techStackAnalysis,
        }
      : null,
    checks: scan.checks,
  };

  return apiOk({ scan: publicScan });
}
