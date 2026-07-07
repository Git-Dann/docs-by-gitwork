// POST /api/retention/purge — permanently delete the cold copies for the given archive ids.
// The only destructive step in the retention lifecycle; admin/super-admin only, never automatic.
// Body: { ids: string[] }

import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { approvePurge, canReviewPurges } from "@/server/retention/purge";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    if (!canReviewPurges(user)) return apiError("Forbidden", 403);

    const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
    if (ids.length === 0) return apiError("No archive ids provided", 400);

    return apiOk(await approvePurge(ids));
  } catch (e) {
    return fromError(e);
  }
}
