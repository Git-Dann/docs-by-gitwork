/**
 * GET /api/pulse/scans/[scanId]/pdf
 *
 * Branded PDF of a scan report. Renders the public /report/[token]?print=1 page with headless
 * Chromium (mirrors /api/proposals/[id]/pdf). The scan must be SHARED first (Chromium can't carry
 * a NextAuth session) — 409 otherwise. `?print=1` strips the tracker/CTA. Gated by Manage Pulse.
 */

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { NextRequest } from "next/server";
import { apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { originFrom } from "@/lib/request-origin";
import { assertCan, canManagePulse, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const maxDuration = 60;
export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ scanId: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManagePulse, "export Pulse reports");
    const { scanId } = await context.params;

    const scan = await prisma.pulseScan.findUnique({
      where: { id: scanId },
      select: { shareToken: true, isShared: true, projectName: true },
    });
    if (!scan) return apiError("Scan not found", 404);
    if (!scan.shareToken || !scan.isShared) {
      return apiError("Share this report before exporting a PDF.", 409);
    }

    const target = `${originFrom(request)}/report/${scan.shareToken}?print=1`;
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.goto(target, { waitUntil: "networkidle0", timeout: 45_000 });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", bottom: "16mm", left: "0mm", right: "0mm" },
      });
      const filename = `${scan.projectName ?? "pulse-report"}-pulse-report.pdf`.replace(/[^\w.\-]+/g, "-");
      return new Response(Buffer.from(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    return fromError(error);
  }
}
