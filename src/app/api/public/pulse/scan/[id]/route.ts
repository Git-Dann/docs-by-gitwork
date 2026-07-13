import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { summarise, type PublicScanView } from "@/server/pulse-lite/public-scan";
import { calculateHealthScore } from "@/server/pulse-scan";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { resolveEmbedCheckKeys, filterToEmbedChecks } from "@/server/pulse-embed-config";
import type { PulseScanCheckInput } from "@/types/pulse";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/pulse/scan/[id]  (PUBLIC — no API key)
 * Poll target for the widget. Returns the live score + per-category counts (free)
 * on every poll; the per-check detail array is only included once an email has
 * been captured (`emailCaptured`).
 *
 * The full lite-scan runs and persists ALL checks (cheap, unchanged) — but everything
 * returned here (score, counts, categories, gated findings) is filtered down to the
 * workspace's curated embed check set first, so a visitor never sees more than the
 * ~10 checks Foundry has configured for the public teaser. Internal admin views
 * (PulseLead.healthScore, the leads panel's critical count) deliberately read the
 * FULL unfiltered scan instead — see src/server/pulse-lite/leads-admin.ts.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lite = await prisma.pulseLiteScan.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        targetUrl: true,
        healthScore: true,
        techStack: true,
        checks: true,
        emailCaptured: true,
        errorMessage: true,
      },
    });
    if (!lite) return apiError("Scan not found", 404);

    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: { pulseEmbedCheckKeys: true },
    });
    const allChecks = (lite.checks as PulseScanCheckInput[] | null) ?? [];
    const checkKeys = resolveEmbedCheckKeys(workspace?.pulseEmbedCheckKeys);
    const checks = filterToEmbedChecks(allChecks, checkKeys);
    const { categories, pass, warn, fail } = summarise(checks);
    const healthScore = checks.length > 0 ? calculateHealthScore(checks) : lite.healthScore;

    const view: PublicScanView = {
      id: lite.id,
      status: lite.status,
      targetUrl: lite.targetUrl,
      healthScore,
      techStack: (lite.techStack as string[] | null) ?? [],
      totalChecks: checks.length,
      pass,
      warn,
      fail,
      categories,
      emailCaptured: lite.emailCaptured,
      checks: lite.emailCaptured ? checks : null, // gated detail
      errorMessage: lite.errorMessage,
    };
    return apiOk(view);
  } catch (error) {
    return fromError(error);
  }
}
