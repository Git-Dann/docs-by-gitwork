import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { loadAchievements } from "@/server/achievements";

export const dynamic = "force-dynamic";

/** GET — the caller's own achievements. There is deliberately no route for anyone else's. */
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk(await loadAchievements(user));
  } catch (err) {
    return fromError(err);
  }
}
