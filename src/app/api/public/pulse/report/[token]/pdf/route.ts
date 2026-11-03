/**
 * GET /api/public/pulse/report/[token]/pdf  (PUBLIC — the token is the credential)
 *
 * The full Pulse report as a PDF: the designed /report/[token] page rendered with headless
 * Chromium, exactly what "Export PDF" produces in the app. This is the one link in the report
 * email a visitor gets after unlocking their scan (pulse-lite/report-delivery.ts).
 *
 * Same access rule as /report/[token]: only a scan that is currently shared resolves, so
 * unsharing it in the app withdraws the PDF too. Opens in the browser (inline) rather than
 * downloading, because people open it from their email on a phone.
 *
 * Rendering launches Chromium, so recent PDFs are kept in memory for a few minutes: a
 * recipient opening the link twice, or forwarding it, costs one render, not several.
 */

import { NextRequest } from "next/server";
import { apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { originFrom } from "@/lib/request-origin";
import { renderPulseReportPdf } from "@/server/pulse-report-pdf";

export const maxDuration = 60;
export const runtime = "nodejs";

const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 20;
const cache = new Map<string, { at: number; pdf: Buffer; filename: string }>();
const inFlight = new Map<string, Promise<Buffer>>();

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    if (!token || token.length < 16) return apiError("Report not found", 404);

    const scan = await prisma.pulseScan.findUnique({
      where: { shareToken: token, isShared: true },
      select: { projectName: true, completedAt: true },
    });
    if (!scan) return apiError("Report not found", 404);

    const key = `${token}:${scan.completedAt?.getTime() ?? 0}`;
    const filename = `${scan.projectName}-pulse-report.pdf`.replace(/[^\w.\-]+/g, "-");
    const hit = cache.get(key);
    let pdf: Buffer;
    if (hit && Date.now() - hit.at < CACHE_MS) {
      pdf = hit.pdf;
    } else {
      let pending = inFlight.get(key);
      if (!pending) {
        pending = renderPulseReportPdf(`${originFrom(request)}/report/${token}?print=1`).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      pdf = await pending;
      cache.set(key, { at: Date.now(), pdf, filename });
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
