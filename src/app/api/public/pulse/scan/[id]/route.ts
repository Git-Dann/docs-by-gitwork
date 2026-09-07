import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { summarise, triage, type PublicScanView } from "@/server/pulse-lite/public-scan";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import type { PulseScanCheckInput } from "@/types/pulse";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/pulse/scan/[id]  (PUBLIC — no API key)
 *
 * Poll target for the widget, and the source for the public result page.
 *
 * ── What is free, and why ────────────────────────────────────────────────────
 * The FACTS are free: the score, every category count, the triaged actionable
 * findings WITH their evidence, and the list of things that could not be
 * established. All of it costs nothing to produce — `pulse-lite/*` imports no AI
 * module at all, the headless browser is off on this path (`includePageSpeed:
 * false`), and no external API quota is touched.
 *
 * What is gated is the INTERPRETATION — "what this means", the prioritised
 * roadmap, the fix brief — plus the ~600-item P3 advisory tail. That is where the
 * token cost and the expertise both sit, and it is the natural place to ask for a
 * conversation rather than an artificial one.
 *
 * ── Why the curated 10-check set is gone ─────────────────────────────────────
 * This route used to filter every scan down to ~10 configured keys and then
 * RESCORE that subset with `calculateHealthScore`. Because the score is a weighted
 * ratio over whatever array it is handed, that made one check worth ~7–14 points
 * publicly against a fraction of a point internally, and the LEGAL cap could never
 * fire publicly while the SSL cap could. The teaser and the paid report were
 * therefore different quantities wearing the same units — the first client to
 * compare their free score against their paid one would have found it.
 *
 * Now there is ONE number: `computeScoreBreakdown` over the full scan, the same
 * function the internal report, the badge and Provenance all use.
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
    const { categories, pass, warn, fail, inconclusive } = summarise(checks);

    // Same formula as every other surface. While a scan is still streaming its
    // first wave `checks` can be empty — fall back to the persisted score rather
    // than reporting a confident 0.
    const healthScore = checks.length > 0
      ? computeScoreBreakdown(checks).finalScore
      : lite.healthScore;

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
      inconclusive,
      categories,
      emailCaptured: lite.emailCaptured,
      triage: triage(checks),
      // The raw ~960-row tail stays gated — it is the tail, not the report.
      checks: lite.emailCaptured ? checks : null,
      errorMessage: lite.errorMessage,
    };
    return apiOk(view);
  } catch (error) {
    return fromError(error);
  }
}
