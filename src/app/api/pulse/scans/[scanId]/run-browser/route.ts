import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPulseScan, requireScanAccess } from "@/server/pulse";
import { runBrowserAgent } from "@/server/pulse-agents/browser-agent";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { detectStoreTarget } from "@/lib/pulse-store-url";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    await requireScanAccess(request, scanId);
    const scan = await getPulseScan(scanId);
    if (!scan) return apiError("Scan not found.", 404);
    if (scan.status !== "COMPLETED") return apiError("Scan must be completed first.", 400);

    // Lighthouse measures a web page. A store listing is Apple's or Google's page, and a
    // repository's homepage field is metadata, not the scanned artefact — scan that site
    // separately rather than grafting its results onto this scan.
    if (scan.inputType !== "URL" || !scan.inputUrl) {
      return apiError("Browser analysis runs on a website scan. Scan the site's URL to include it.", 400);
    }
    if (detectStoreTarget(scan.inputUrl)) {
      return apiError("Browser analysis does not apply to a store listing — it would measure the store's page, not the app.", 400);
    }
    const url = scan.inputUrl;

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
