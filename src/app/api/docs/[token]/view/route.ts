/**
 * POST /api/docs/[token]/view
 *
 * Public, token-gated. Records (or reuses, per session) a DocumentView when someone opens the
 * share URL, enriched with a first-party visitorId, coarse geo (Vercel edge headers) and a
 * device/browser classification. Detects the document's first-ever open and fires a distinct
 * DOC_FIRST_VIEWED Slack alert ("📣 your proposal was just opened") alongside the per-view
 * DOC_VIEWED. Fire-and-forget on Slack so the public visitor never waits on a third party.
 *
 * Client passes `?v=<visitorId>&s=<sessionId>` (small, sendBeacon-friendly); the sessionId ties
 * this visit to the per-section dwell events posted later to /api/docs/[token]/events.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { notifyDocumentEvent } from "@/server/slack-notify";
import { dispatchNotification } from "@/server/notifications";
import { recordDocumentView } from "@/server/document-analytics";
import { clientIpFromRequest, geoFromRequest, parseUserAgent } from "@/server/visitor-context";
import { resolveGeoForIp } from "@/server/ip-geo";

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    if (!token || token.length < 16) return apiError("Bad token", 400);

    const doc = await prisma.document.findFirst({
      where: { shareToken: token, isShared: true, archivedAt: null },
      select: { id: true, workspaceId: true, title: true, documentType: true },
    });
    if (!doc) return apiError("Not shared", 404);

    const ip = clientIpFromRequest(request);
    const userAgent = request.headers.get("user-agent");
    const referer = request.headers.get("referer");
    // Prefer geo from the edge/proxy; nginx doesn't provide it (unlike Vercel),
    // so fall back to resolving the IP. Fail-soft: nulls if it can't be found.
    const headerGeo = geoFromRequest(request);
    const geo = headerGeo.country ? headerGeo : await resolveGeoForIp(ip);
    const ua = parseUserAgent(userAgent);

    const visitorId = request.nextUrl.searchParams.get("v")?.slice(0, 64) || null;
    const sessionId = request.nextUrl.searchParams.get("s")?.slice(0, 64) || null;

    const { isFirstView } = await recordDocumentView({
      documentId: doc.id,
      sessionId,
      visitorId,
      ip,
      userAgent,
      referer,
      origin: "DOCS",
      country: geo.country,
      city: geo.city,
      device: ua.device,
      browser: ua.browser,
      os: ua.os,
    });

    // Location only — never a raw IP. An IP in a notification is meaningless to
    // the reader (and needlessly exposes the visitor's address); when geo can't
    // be resolved we simply omit the "Opened from …" line.
    const where = geo.city && geo.country ? `${geo.city}, ${geo.country}` : geo.country ?? null;

    // First open is the high-signal moment — surface it distinctly. Every subsequent open still
    // fires DOC_VIEWED so subscribers who want all traffic keep getting it.
    if (isFirstView) {
      void notifyDocumentEvent({
        workspaceId: doc.workspaceId,
        documentId: doc.id,
        documentTitle: doc.title,
        documentType: doc.documentType,
        kind: "DOC_FIRST_VIEWED",
        detail: where ? `Opened from ${where}` : undefined,
      });
      dispatchNotification({
        event: "docs.viewed_by_client",
        workspaceId: doc.workspaceId,
        target: { kind: "permission", permission: "docs.manage" },
        title: `${doc.title} was opened`,
        body: where ? `Opened from ${where}` : null,
        actionUrl: `/app/docs/${doc.id}`,
        groupKey: `docs.viewed:${doc.id}`,
      });
    }
    void notifyDocumentEvent({
      workspaceId: doc.workspaceId,
      documentId: doc.id,
      documentTitle: doc.title,
      documentType: doc.documentType,
      kind: "DOC_VIEWED",
      detail: where ? `Opened from ${where}` : undefined,
    });

    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
