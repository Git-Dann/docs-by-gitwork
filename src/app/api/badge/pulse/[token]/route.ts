import { unstable_cache } from "next/cache";
import type { NextRequest } from "next/server";

import { renderPulseBadge, type BadgeBar, type BadgeStyle, type BadgeTheme } from "@/lib/badge/pulse-badge";
import { prisma } from "@/lib/prisma";
import { computePillarBreakdown } from "@/server/pulse-checks/pillars";
import type { PulseScanCheckInput } from "@/types/pulse";

/**
 * GET /api/badge/pulse/[token]  (PUBLIC — no API key)
 *
 * The client-facing Pulse score badge: an `<img>`-able SVG a client can drop in
 * their own footer or README.
 *
 *   <img src="https://foundry.gitwork.co.uk/api/badge/pulse/<token>.svg" alt="Gitwork Pulse score">
 *
 * ## Auth is the share token, and only the share token
 *
 * `token` is the SAME `PulseScan.shareToken` that serves `/report/[token]`, so
 * the badge is public exactly when the report is: nothing here is visible that
 * the linked page does not already show. Unsharing revokes both at once — this
 * reads through the same `pulse-report-<token>` cache tag that the share route
 * already revalidates, so a rotated or removed token stops resolving promptly
 * rather than after the TTL.
 *
 * A revoked or mistyped token returns 404, deliberately: a badge that kept
 * rendering after its report was unshared would be advertising a claim nobody
 * can check.
 *
 * ## Query parameters
 *
 *   style   shield (default) · ring · card · bar
 *   theme   light (default) · dark      — pick for the HOST page's background
 *   motion  1 to opt into the animated build (see below)
 *
 * Motion is off by default on purpose. A CSS animation inside an `<img>` is
 * started and then frozen at t=0 wherever the page is rasterised without being
 * scrolled — social card renderers, print-to-PDF — which would render an
 * entrance animation's hidden first frame. Ask for it only on a surface where a
 * person actually scrolls the badge into view.
 */

export const runtime = "nodejs";

// Only shown on the `card` style, which has room for four rows.
const MAX_BARS = 4;

const loadBadgeScan = (token: string) =>
  unstable_cache(
    async () => {
      const scan = await prisma.pulseScan.findUnique({
        where: { shareToken: token, isShared: true },
        select: {
          projectName: true,
          healthScore: true,
          // EVERY field the score maths reads. The previous select was
          // category/status/confidence with a comment claiming that was all
          // `computeScoreBreakdown` touches — it is not. It also reads `severity`
          // and `evidenceStrength` (the per-control weight), `scoreEligible` (the
          // eligibility gate), `completenessEligible`, and `controlId` (the
          // independence damper that stops several views of one signal counting
          // several times). Absent, each silently fell back to a default, so the
          // badge's domain bars could disagree with the report they link to.
          //
          // Still narrow: the prose fields (detail, evidence, remediation) are the
          // bulk of a check row and none of them reach the maths.
          checks: {
            select: {
              checkKey: true, category: true, status: true, confidence: true,
              severity: true, evidenceStrength: true, scoreEligible: true,
              completenessEligible: true, controlId: true,
            },
          },
        },
      });
      if (!scan) return null;
      return {
        projectName: scan.projectName,
        healthScore: scan.healthScore,
        checks: scan.checks as unknown as PulseScanCheckInput[],
      };
    },
    ["pulse-badge", token],
    { tags: [`pulse-report-${token}`], revalidate: 300 },
  )();

/** Domain rollup for the `card` style, ordered by how much weight each carries. */
function domainBars(checks: PulseScanCheckInput[]): BadgeBar[] {
  if (checks.length === 0) return [];

  // The published pillars, not a per-scan pick of domains.
  //
  // This used to roll the 12 report domains up and take the top four BY WEIGHT,
  // so which dimensions a badge showed varied between clients — and between two
  // scans of the same client, as check counts moved. A mark someone puts in their
  // own footer has to mean the same thing every time it renders.
  //
  // Pillars are stable, carry published weights, and delegate to the same
  // `computeScoreBreakdown` the report headline uses, so the badge cannot grade on
  // different rules from the page it links to. Ordered by weight so the bars a
  // reader sees first are the ones that matter most, and pillars that measured
  // nothing are already excluded — `computePillarBreakdown` drops and names them
  // rather than showing a zero it did not earn.
  return computePillarBreakdown(checks)
    .pillars.filter((pillar) => pillar.score !== null)
    .sort((a, b) => b.publishedWeight - a.publishedWeight)
    .slice(0, MAX_BARS)
    .map((pillar) => ({ label: pillar.label.toUpperCase(), value: (pillar.score ?? 0) / 100 }));
}

function parseStyle(v: string | null): BadgeStyle {
  return v === "ring" || v === "card" || v === "bar" ? v : "shield";
}

function parseTheme(v: string | null): BadgeTheme {
  return v === "dark" ? "dark" : "light";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  // `.svg` is accepted (and ignored) so the URL can end in a real file
  // extension — some CMSes and markdown linters will not treat an extensionless
  // URL as an image.
  const token = raw.replace(/\.svg$/i, "");

  const scan = await loadBadgeScan(token);
  if (!scan || scan.healthScore === null) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const q = request.nextUrl.searchParams;
  const style = parseStyle(q.get("style"));

  const { svg } = renderPulseBadge({
    score: scan.healthScore,
    style,
    theme: parseTheme(q.get("theme")),
    motion: q.get("motion") === "1",
    project: scan.projectName,
    // Only the card renders bars; skip the rollup entirely otherwise.
    bars: style === "card" ? domainBars(scan.checks) : undefined,
  });

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // A score only moves when the scan is re-run, and the cache tag above
      // handles unsharing, so a short TTL with a long stale window keeps this
      // cheap without letting a revoked badge linger.
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
      // Hotlinked from client sites by design.
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
