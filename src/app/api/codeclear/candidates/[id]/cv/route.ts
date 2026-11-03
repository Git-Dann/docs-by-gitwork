/**
 * GET /api/codeclear/candidates/[id]/cv
 *
 * A dev's one-page CV, in the Gitwork Document System.
 *   `?format=html` (default) — the document, for the in-app preview iframe.
 *   `?format=pdf`            — the same document, printed by headless Chromium.
 *
 * ⚠️ **This route does NOT need the document to be shared first, and that is the
 * point.** The other three PDF routes here (the proposal, Pulse-scan and
 * shared-doc exports) all navigate Chromium to a public
 * `[token]` page, because Chromium cannot carry a NextAuth session — so each of
 * them returns 409 until the thing is publicly shared. Applying that pattern here
 * would mean publishing a person's CV to the open web before you could hand it to
 * a client, which is not a trade worth making for a file format. The CV is
 * self-contained instead (its own CSS, its own base64 fonts and mark), so it is
 * passed to Chromium with `setContent`: nothing is navigated to, nothing is
 * exposed, and the HTML the operator previewed is byte-identical to what prints.
 *
 * Gated by Manage Code, mirroring the other PDF exports' manage-level gate — this
 * emits a person's profile as a shareable file.
 *
 * Node runtime (Chromium needs it), 60s for a cold Chromium start.
 */

import { NextRequest } from "next/server";
import { apiError, fromError } from "@/lib/api-response";
import { buildCvData } from "@/lib/cv/build-cv";
import { renderCvHtml } from "@/lib/cv/render-cv";
import { prisma } from "@/lib/prisma";
import { assertCan, canManageCode, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { ensureBaseRecords } from "@/server/bootstrap";
import { loadCvAssets } from "@/server/cv-assets";
import { launchHeadlessBrowser } from "@/server/headless-browser";

export const maxDuration = 60;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Safe for a Content-Disposition filename on every platform. */
function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "developer"
  );
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageCode, "export developer CVs");
    const { workspace } = await ensureBaseRecords();
    const { id } = await context.params;

    const candidate = await prisma.candidate.findFirst({
      // Workspace-scoped, and the select is deliberately narrow: the CV's data
      // shape has nowhere to put a rate, a score or a tier, so they are not read
      // in the first place. See src/lib/cv/types.ts.
      where: { id, workspaceId: workspace.id },
      select: {
        name: true,
        origin: true,
        primaryStack: true,
        techStacks: true,
        location: true,
        timezone: true,
        yearsExperience: true,
        bio: true,
        githubHandle: true,
        linkedinUrl: true,
        portfolioUrl: true,
        placements: {
          select: {
            clientName: true,
            projectName: true,
            startDate: true,
            endDate: true,
            clientPlatform: { select: { name: true } },
          },
          orderBy: { startDate: "desc" },
        },
      },
    });
    if (!candidate) return apiError("Developer not found.", 404);

    const data = buildCvData(candidate, candidate.placements.map((p) => ({
      clientName: p.clientName,
      projectName: p.projectName,
      clientPlatformName: p.clientPlatform?.name ?? null,
      startDate: p.startDate.toISOString(),
      endDate: p.endDate ? p.endDate.toISOString() : null,
    })));

    const assets = await loadCvAssets();
    if (assets.fontFacesLoaded === 0) {
      // Not fatal — the document still renders in the fallback stack — but it is
      // the failure the Document System calls out by name ("if headings render in
      // Times, the fonts did not load"), so it must not pass silently.
      console.warn("[cv] no brand fonts inlined; check outputFileTracingIncludes for this route");
    }
    const html = renderCvHtml(data, { fontCss: assets.fontCss, markDataUri: assets.markDataUri });

    if (request.nextUrl.searchParams.get("format") !== "pdf") {
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          // The omitted list is what fitToOnePage had to cut. The preview shows it
          // so the operator can shorten the profile rather than wonder where an
          // engagement went; a header keeps it out of the document itself.
          "X-Cv-Omitted": encodeURIComponent(JSON.stringify(data.omitted)),
          "X-Cv-Missing": encodeURIComponent(JSON.stringify(data.missing)),
          "Cache-Control": "no-store",
        },
      });
    }

    const browser = await launchHeadlessBrowser();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
      // The faces are data URIs, so they decode rather than download — but decode
      // is still async, and printing before it finishes is exactly how a PDF comes
      // out in Times. `font-display: block` keeps text unpainted until then.
      await page.evaluate("document.fonts.ready").catch(() => undefined);
      const pdf = await page.pdf({
        width: "1000px",
        height: "1414px",
        printBackground: true,
        margin: { top: "0mm", bottom: "0mm", left: "0mm", right: "0mm" },
      });
      return new Response(Buffer.from(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${slugify(data.name)}-cv.pdf"`,
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
