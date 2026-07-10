/**
 * GET /api/proposals/[id]/pdf
 *
 * Real server-side PDF (Phase 3b). Renders the document's public share page with headless
 * Chromium and streams back a PDF — pixel-accurate to what the client sees, unlike browser
 * print-to-PDF.
 *
 * Why the public page: /app/* requires a NextAuth session that Chromium can't cleanly carry, so
 * we point it at the token-auth /docs/[token] view instead. That means the document must be
 * SHARED first; we return a clear 409 otherwise. `?print=1` tells the public page to drop the
 * tracker/comments/CTA so the PDF is just the document.
 *
 * Chromium binary: production (the Alpine/musl Docker image) sets `PUPPETEER_EXECUTABLE_PATH` to
 * Alpine's own native Chromium — @sparticuz/chromium's bundled binary is glibc-linked (built for
 * AWS Lambda) and can't run there at all. Falls back to @sparticuz/chromium's bundled binary
 * (Lambda/other glibc hosts, or a dev machine with it working) when that env var isn't set.
 *
 * Gated by docs.manage. Node runtime (Chromium needs it), 60s budget for cold starts.
 */

import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { NextRequest } from "next/server";
import { apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { originFrom } from "@/lib/request-origin";
import { assertCan, canManageDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const maxDuration = 60;
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDocs, "export documents");
    const { id } = await context.params;

    const doc = await prisma.document.findFirst({
      where: { id },
      select: { id: true, shareToken: true, isShared: true, title: true, documentNumber: true },
    });
    if (!doc) return apiError("Document not found", 404);
    if (!doc.shareToken || !doc.isShared) {
      return apiError("Enable sharing for this document before exporting a PDF.", 409);
    }

    const origin = originFrom(request);
    const target = `${origin}/docs/${doc.shareToken}?print=1`;

    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (await chromium.executablePath()),
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.goto(target, { waitUntil: "networkidle0", timeout: 45_000 });
      // Zero margins → full-bleed cream to the page edge (no white frame) and no header/footer
      // band. The document's own print CSS supplies the page inset, so content still breathes.
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
      });

      const filename = `${doc.documentNumber ?? doc.title ?? "document"}.pdf`.replace(/[^\w.\-]+/g, "-");
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
