import { apiError, apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { NeedsYouStateError, setHold } from "@/server/needs-you-state";
import { needsYouHoldSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

/**
 * POST — snooze, dismiss or clear one item in the caller's own "Needs you" inbox.
 * Body: { action: "snooze", itemKey, fingerprint, until } | { action: "dismiss", itemKey,
 * fingerprint } | { action: "clear", itemKey }.
 *
 * Only ever the caller's own rows (user id and workspace come from the session, never the
 * body). Refused while "viewing as" someone: a preview must not change their inbox.
 */
export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const viewingAs = req.headers.get("x-view-as-user");
    if (viewingAs && viewingAs === user.id) {
      return apiError("Snoozes are your own, so they can't be changed while viewing as someone.", 403);
    }
    const input = needsYouHoldSchema.parse(await req.json());
    return apiOk(await setHold(user, input));
  } catch (err) {
    if (err instanceof NeedsYouStateError) return apiError(err.message, err.status);
    return fromError(err);
  }
}
