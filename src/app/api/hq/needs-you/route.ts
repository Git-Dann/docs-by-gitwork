import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { loadNeedsYou } from "@/server/needs-you";

export const dynamic = "force-dynamic";

/**
 * GET — HQ's "Needs you" list: what every watcher found that the caller can act on.
 * Each source is gated and scoped inside loadNeedsYou exactly as its own page is.
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk(await loadNeedsYou(user));
  } catch (err) {
    return fromError(err);
  }
}
