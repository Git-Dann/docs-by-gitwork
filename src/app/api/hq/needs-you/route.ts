import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { loadNeedsYou } from "@/server/needs-you";

export const dynamic = "force-dynamic";

/**
 * GET — HQ's "Needs you" inbox: what every watcher found that the caller can act on, with the
 * actions their own pages would offer and their own snoozes applied. Each source is gated and
 * scoped inside loadNeedsYou exactly as its own page is. While "viewing as" someone their
 * Commitments are left out, as the Commitments routes refuse a preview.
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const viewingAs = req.headers.get("x-view-as-user");
    return apiOk(await loadNeedsYou(user, new Date(), { viewingAs: Boolean(viewingAs && viewingAs === user.id) }));
  } catch (err) {
    return fromError(err);
  }
}
