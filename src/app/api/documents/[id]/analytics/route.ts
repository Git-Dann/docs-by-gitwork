/**
 * GET /api/documents/[id]/analytics
 *
 * Per-document engagement analytics: unique/returning visitors, total views, first/last opened,
 * time-to-first-open, average visit duration, the per-section dwell heatmap, device/browser/geo
 * splits, conversion state, and a recent-visits list. Powers the editor's analytics panel and the
 * iOS document-detail screen. Read endpoint — available to any Docs-module caller; mobile
 * JWT-aware via the shared session/bearer middleware.
 */

import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { getDocumentAnalytics } from "@/server/document-analytics";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const analytics = await getDocumentAnalytics(id);
    if (!analytics) return apiError("Document not found", 404);
    return apiOk({ analytics });
  } catch (error) {
    return fromError(error);
  }
}
