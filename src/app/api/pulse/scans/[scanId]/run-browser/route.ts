import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPulseScan } from "@/server/pulse";
import { runBrowserAgent } from "@/server/pulse-agents/browser-agent";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const scan = await getPulseScan(scanId);
    if (!scan) return apiError("Scan not found.", 404);
    if (scan.status !== "COMPLETED") return apiError("Scan must be completed first.", 400);

    // Determine which URL to analyse
    const url =
      scan.inputType === "URL" ? scan.inputUrl
      : scan.codeInsights?.homepageUrl ?? null;

    if (!url) return apiError("No URL available for browser analysis — provide a URL or a GitHub repo with a homepage URL set.", 400);

    const result = await runBrowserAgent(url);
    if (!result.insights) return apiError("Browser analysis returned no data. The URL may be unreachable.", 500);

    // Merge into agentData preserving existing fields
    const existing = await prisma.pulseScan.findUnique({
      where: { id: scanId },
      select: { agentData: true },
    });
    const prev = (existing?.agentData as Record<string, unknown> | null) ?? {};
    await prisma.pulseScan.update({
      where: { id: scanId },
      data: {
        agentData: { ...prev, browserInsights: result.insights } as unknown as Prisma.InputJsonValue,
      },
    });

    // Add browser checks to DB
    if (result.checks.length > 0) {
      const existingCheckKeys = new Set(scan.checks.map((c) => c.checkKey));
      const newChecks = result.checks.filter((c) => !existingCheckKeys.has(c.checkKey));
      if (newChecks.length > 0) {
        await prisma.pulseScanCheck.createMany({
          data: newChecks.map((check, i) => ({
            scanId,
            category: check.category,
            checkKey: check.checkKey,
            label: check.label,
            status: check.status,
            detail: check.detail ?? null,
            evidence: check.evidence ?? null,
            sortOrder: scan.checks.length + i,
          })),
        });
      }
    }

    return apiOk({ insights: result.insights, checksAdded: result.checks.length });
  } catch (error) {
    return fromError(error);
  }
}
