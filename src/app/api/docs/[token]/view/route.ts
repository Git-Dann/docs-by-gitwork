/**
 * POST /api/docs/[token]/view
 *
 * Public, token-gated. Records a DocumentView row when someone opens the share URL. Used by
 * the editor's "Recent activity" feed and to drive the view-count display.
 *
 * Idempotent enough for our purposes — we accept multiple views from the same browser (each
 * load is a distinct row). The editor's UI deduplicates by counting unique-day-by-IP if it
 * needs a "unique visitor" figure.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token || token.length < 16) return apiError("Bad token", 400);

    const doc = await prisma.document.findFirst({
      where: { shareToken: token, isShared: true, archivedAt: null },
      select: { id: true },
    });
    if (!doc) return apiError("Not shared", 404);

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const userAgent = request.headers.get("user-agent") || undefined;
    const referer = request.headers.get("referer") || undefined;

    await prisma.documentView.create({
      data: {
        documentId: doc.id,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        referer: referer ?? null,
        origin: "DOCS",
      },
    });

    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
