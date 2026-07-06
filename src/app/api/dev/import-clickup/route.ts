/**
 * POST /api/dev/import-clickup — one-time ClickUp migration, admin-only.
 *
 * Requires the CLICKUP_TOKEN env var (a ClickUp personal token, `pk_…`).
 *
 * Body (all optional):
 *   { "dryRun": true,  "clientSlug": "ace-grading", "closeStale": true }
 *
 * dryRun DEFAULTS TO TRUE — the first call reads the whole ClickUp hierarchy and
 * returns per-client counts (blocks / milestones / active tasks / subtasks) plus
 * the assignee-match report, writing NOTHING. Review that, then re-POST with
 * { "dryRun": false } to commit. Idempotent (keyed on clickupId) — safe to re-run.
 *
 * Optionally pass clientSlug to pilot a single client first.
 * Pass closeStale:true to mark ClickUp-linked Portal tasks DONE when they no
 * longer exist in ClickUp's active task set (completed/closed/deleted upstream).
 *
 * Prerequisite: run /api/dev/seed-team once so the dev roster exists as Foundry
 * Users — otherwise assignees resolve to "knownButMissingUsers" and tasks import
 * unassigned.
 */

import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertSuperAdmin, getEffectiveUserOrNull, requireAuthedUser } from "@/server/auth/effective-user";
import { runClickupImport } from "@/server/clickup-import";
import { runCsvImport } from "@/server/clickup-csv-import";
import { isAtLeast } from "@/types/auth";

export const dynamic = "force-dynamic";
// Importing ~1k tasks (or paginating ~80 ClickUp lists) can take a while.
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    assertSuperAdmin(await getEffectiveUserOrNull(req));
    const user = await requireAuthedUser(req);
    // Admins AND Super Admins (Dan) — isAtLeast, not a strict equality.
    if (!isAtLeast(user.role, "ADMIN")) return apiError("Admin only", 403);

    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      clientSlug?: string;
      source?: "csv" | "api";
      closeStale?: boolean;
    };

    const dryRun = body.dryRun !== false; // default true unless explicitly false
    const clientSlug = typeof body.clientSlug === "string" ? body.clientSlug : undefined;
    const closeStale = body.closeStale === true;

    // Default to the CSV-export path (no token). source:"api" uses CLICKUP_TOKEN.
    if (body.source === "api") {
      if (!process.env.CLICKUP_TOKEN) return apiError("CLICKUP_TOKEN env var is not set", 400);
      return apiOk(await runClickupImport({ dryRun, clientSlug, closeStale }));
    }

    return apiOk(await runCsvImport({ dryRun, clientSlug }));
  } catch (e) {
    return fromError(e);
  }
}
