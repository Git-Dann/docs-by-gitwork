/**
 * POST /api/dev/cleanse-tasks — one-shot, admin-only task cleanse for a migrated
 * client board (assign owners, set due dates, fix statuses, purge junk).
 *
 * Body (all optional except a target):
 *   { "preset": "speakify", "dryRun": true }            ← use a versioned preset
 *   { "clientSlug": "speakify", "ops": [...], "dryRun": true }  ← ad-hoc ops
 *
 * dryRun DEFAULTS TO TRUE — the first call returns a full per-task diff
 * (current → proposed), a structure dump (so the real section names are visible),
 * match counts, plus any unresolvedAssignees / rulesMatchedNothing, and writes
 * NOTHING. Review, then re-POST with { "dryRun": false } to apply. Idempotent.
 *
 * Prerequisite: run /api/dev/seed-team once so the dev roster exists as Foundry
 * Users — otherwise assignees land in `unresolvedAssignees`.
 */

import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { runTaskCleanse, CLEANSE_PRESETS, type CleanseOp } from "@/server/task-cleanse";
import { isAtLeast } from "@/types/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    if (!isAtLeast(user.role, "ADMIN")) return apiError("Admin only", 403);

    const body = (await req.json().catch(() => ({}))) as {
      preset?: string;
      clientSlug?: string;
      ops?: CleanseOp[];
      dryRun?: boolean;
      grantAccess?: boolean;
      setBlockSpans?: boolean;
    };

    const dryRun = body.dryRun !== false; // default true unless explicitly false

    let clientSlug = typeof body.clientSlug === "string" ? body.clientSlug : undefined;
    let ops = Array.isArray(body.ops) ? body.ops : undefined;

    if (body.preset) {
      const preset = CLEANSE_PRESETS[body.preset];
      if (!preset) {
        return apiError(`Unknown preset "${body.preset}". Known: ${Object.keys(CLEANSE_PRESETS).join(", ")}`, 400);
      }
      clientSlug = clientSlug ?? preset.clientSlug;
      ops = ops ?? preset.ops;
    }

    if (!clientSlug) return apiError("clientSlug (or preset) is required", 400);
    if (!ops || ops.length === 0) return apiError("ops (or preset) is required", 400);

    return apiOk(
      await runTaskCleanse({
        clientSlug,
        ops,
        dryRun,
        grantAccess: body.grantAccess,
        setBlockSpans: body.setBlockSpans,
      }),
    );
  } catch (e) {
    return fromError(e);
  }
}
