/**
 * GET /api/public/pulse/examples/[id]/pdf  (PUBLIC — example data only)
 *
 * One of the three example reports from /pulse/features as a PDF, printed from
 * /pulse/features/examples/[id] by the same renderer as a real report's "Export PDF", so the
 * example can't look different from the real thing. The data never changes within a day, so
 * each PDF is rendered once and kept in memory; a visitor never waits on Chromium twice.
 */

import { NextRequest } from "next/server";
import { apiError, fromError } from "@/lib/api-response";
import { originFrom } from "@/lib/request-origin";
import { exampleReport } from "@/lib/pulse-example-reports";
import { renderPulseReportPdf } from "@/server/pulse-report-pdf";

export const maxDuration = 60;
export const runtime = "nodejs";

const CACHE_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; pdf: Buffer }>();
const inFlight = new Map<string, Promise<Buffer>>();

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const report = exampleReport(id);
    if (!report) return apiError("Example not found", 404);

    const hit = cache.get(id);
    let pdf: Buffer;
    if (hit && Date.now() - hit.at < CACHE_MS) {
      pdf = hit.pdf;
    } else {
      let pending = inFlight.get(id);
      if (!pending) {
        pending = renderPulseReportPdf(`${originFrom(request)}/pulse/features/examples/${id}?print=1`).finally(() =>
          inFlight.delete(id),
        );
        inFlight.set(id, pending);
      }
      pdf = await pending;
      cache.set(id, { at: Date.now(), pdf });
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="pulse-example-report-${id}.pdf"`,
        "Cache-Control": "public, max-age=3600",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return fromError(error);
  }
}
