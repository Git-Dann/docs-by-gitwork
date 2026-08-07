/**
 * GET /api/docs/[token]/pdf
 *
 * Public, token-gated PDF download. Lets a client who received a share link download the document
 * as a PDF straight from the public /docs/[token] view — no login, no hunting for it inside the
 * platform. The token in the URL is its own auth (matches the sibling /view, /events, /accept,
 * /comments public routes), so this needs NO API_KEY (`/api/docs` is already in the middleware's
 * PUBLIC_API_PATHS allow-list).
 *
 * Mirrors the internal `GET /api/proposals/[id]/pdf` render — headless Chromium against the public
 * `/docs/[token]?print=1` page (clean, tracker-free, full-bleed) — but keyed by shareToken and
 * with no permission gate. Only documents that are actually shared resolve; anything else 404s the
 * same way the page itself does, so an unshared/revoked/archived token never yields a PDF.
 *
 * See the internal route for the Chromium-binary / launch-arg notes (native Alpine Chromium via
 * PUPPETEER_EXECUTABLE_PATH in prod, @sparticuz/chromium's bundled binary otherwise).
 */

import { NextRequest } from "next/server";
import { apiError, fromError } from "@/lib/api-response";
import { buildDocumentFilename } from "@/lib/document-filename";
import { prisma } from "@/lib/prisma";
import { originFrom } from "@/lib/request-origin";
import { launchHeadlessBrowser } from "@/server/headless-browser";

export const maxDuration = 60;
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token || token.length < 16) return apiError("Document not found", 404);

    const doc = await prisma.document.findFirst({
      where: { shareToken: token, isShared: true, archivedAt: null },
      select: { title: true, clientName: true, documentNumber: true },
    });
    if (!doc) return apiError("Document not found", 404);

    const origin = originFrom(request);
    const target = `${origin}/docs/${token}?print=1`;

    // Shared launcher — single implementation in src/server/headless-browser.ts.
    const browser = await launchHeadlessBrowser();

    try {
      const page = await browser.newPage();
      await page.goto(target, { waitUntil: "networkidle0", timeout: 45_000 });
      // Wait for the client-side height pagination to settle so each block lands on its final page
      // before we snapshot (the renderer sets window.__docPaginated once measured). Best-effort.
      await page
        .waitForFunction("window.__docPaginated === true", { timeout: 15_000 })
        .catch(() => undefined);
      // Zero margins → full-bleed cream to the page edge; the document's own print CSS supplies the
      // page inset so content still breathes.
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
      });

      const filename = `${buildDocumentFilename(doc)}.pdf`;
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
