import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { summarise, type PublicScanView } from "@/server/pulse-lite/public-scan";
import type { PulseScanCheckInput } from "@/types/pulse";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/pulse/scan/[id]  (PUBLIC — no API key)
 * Poll target for the widget. Returns the live score + per-category counts (free)
 * on every poll; the per-check detail array is only included once an email has
 * been captured (`emailCaptured`).
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

    const checks = (lite.checks as PulseScanCheckInput[] | null) ?? [];
    const { categories, pass, warn, fail } = summarise(checks);

    const view: PublicScanView = {
      id: lite.id,
      status: lite.status,
      targetUrl: lite.targetUrl,
      healthScore: lite.healthScore,
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
