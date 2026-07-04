/**
 * ClickUp ↔ Portal audit — READ-ONLY drift report (writes nothing).
 *
 * POST /api/dev/clickup-audit  (admin-only)
 *   Body (all optional):
 *     { "post": true, "clientSlug": "ace-grading", "channelId": "C123", "source": "live" }
 *   Returns the full structured report + markdown. When { "post": true } it also drops the
 *   written report into Slack (roll-up channel by default, or `channelId`).
 *   source: "snapshot" (default, committed JSON) | "live" (pull current ClickUp via
 *   CLICKUP_TOKEN — current data + assignees).
 *
 * GET /api/dev/clickup-audit  (CRON_SECRET-guarded)
 *   Runs the audit and posts it to Slack — wire to host cron (§23) to land the report in the
 *   channel each Monday morning. No body.
 *
 * The audit compares the committed ClickUp snapshot (src/data/clickup-import.json) against the
 * live Portal task DB. It never mutates Portal — it's the "what to eyeball" report, not a sync.
 */

import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertSuperAdmin, getEffectiveUserOrNull, requireAuthedUser } from "@/server/auth/effective-user";
import { runClickupAudit, postAuditToSlack } from "@/server/clickup-audit";
import { isAtLeast } from "@/types/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    assertSuperAdmin(await getEffectiveUserOrNull(req));
    const user = await requireAuthedUser(req);
    if (!isAtLeast(user.role, "ADMIN")) return apiError("Admin only", 403);

    const body = (await req.json().catch(() => ({}))) as {
      post?: boolean;
      clientSlug?: string;
      channelId?: string;
      source?: "snapshot" | "live";
    };
    const clientSlug = typeof body.clientSlug === "string" ? body.clientSlug : undefined;
    const source = body.source === "live" ? "live" : "snapshot";
    if (source === "live" && !process.env.CLICKUP_TOKEN) {
      return apiError("source:\"live\" needs CLICKUP_TOKEN set", 400);
    }

    const report = await runClickupAudit({ clientSlug, source });
    const slack = body.post ? await postAuditToSlack(report, { channelId: body.channelId }) : null;
    return apiOk({ report, slack });
  } catch (e) {
    return fromError(e);
  }
}

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${secret}`) return apiError("Unauthorized", 401);
    }
    // Prefer live ClickUp when a token is available; else fall back to the snapshot.
    const source = process.env.CLICKUP_TOKEN ? "live" : "snapshot";
    const report = await runClickupAudit({ source });
    const slack = await postAuditToSlack(report);
    return apiOk({ totals: report.totals, slack });
  } catch (error) {
    return fromError(error);
  }
}
