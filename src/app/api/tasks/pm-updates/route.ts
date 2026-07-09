import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";

import { previewPmUpdates, publishPmUpdates } from "@/server/tasks-standup";

export const dynamic = "force-dynamic";

/** GET — compile the same PM update the POST would send, but post nothing.
 *  Powers the review modal so the admin can eyeball each dev's update before
 *  confirming. Gated on tasks.publish (asserted inside previewPmUpdates). */
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const result = await previewPmUpdates(user);
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}


/** POST — compile every dev's PM update (done-today + note) grouped by developer
 *  and post it to the dedicated PM-updates channel (#updates). Gated on
 *  tasks.publish (asserted inside publishPmUpdates). */
export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const result = await publishPmUpdates(user);
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}
