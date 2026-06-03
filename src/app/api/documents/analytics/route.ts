/**
 * GET /api/documents/analytics
 *
 * Cross-document workspace rollup: the funnel (documents → shared → viewed → sent → accepted /
 * declined), open rate, win rate, average time-to-first-open, status breakdown, the most-viewed
 * documents leaderboard, and the most-read section types across every shared doc. Powers the Docs
 * analytics dashboard and the iOS analytics screen.
 *
 * Query params:
 *   - documentType: PROPOSAL | SLA | … | ALL   (default ALL)
 *   - from, to:     ISO dates bounding Document.createdAt (optional)
 *   - days:         shortcut for from = now − N days (optional; ignored if `from` is given)
 *
 * Note: a static segment, so it takes routing precedence over /api/documents/[id] for the literal
 * "analytics" path. Read endpoint — mobile JWT-aware via the shared middleware.
 */

import { DocumentType } from "@prisma/client";
import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import {
  getWorkspaceDocumentAnalytics,
  type WorkspaceDocAnalyticsOptions,
} from "@/server/document-analytics";

export async function GET(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    const workspaceId = user?.workspaceId ?? (await ensureBaseRecords()).workspace.id;

    const sp = request.nextUrl.searchParams;

    const typeParam = sp.get("documentType")?.trim().toUpperCase();
    let documentType: WorkspaceDocAnalyticsOptions["documentType"] = "ALL";
    if (typeParam && typeParam !== "ALL") {
      if (!(typeParam in DocumentType)) return apiError("Invalid documentType.", 400);
      documentType = typeParam as DocumentType;
    }

    let from: Date | undefined;
    let to: Date | undefined;
    const fromParam = sp.get("from");
    const toParam = sp.get("to");
    const daysParam = sp.get("days");
    if (fromParam) {
      const d = new Date(fromParam);
      if (!Number.isNaN(d.getTime())) from = d;
    } else if (daysParam) {
      const days = Number(daysParam);
      if (Number.isFinite(days) && days > 0) from = new Date(Date.now() - days * 86_400_000);
    }
    if (toParam) {
      const d = new Date(toParam);
      if (!Number.isNaN(d.getTime())) to = d;
    }

    const analytics = await getWorkspaceDocumentAnalytics(workspaceId, { documentType, from, to });
    return apiOk({ analytics });
  } catch (error) {
    return fromError(error);
  }
}
