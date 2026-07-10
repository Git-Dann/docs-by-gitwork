import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";

import {
  previewDailyUpdates,
  publishDailyUpdates,
  type DailyUpdatePhase,
} from "@/server/tasks-standup";

export const dynamic = "force-dynamic";

/** Read the AM/PM phase from `?phase=` (defaults to PM). */
function parsePhase(req: Request): DailyUpdatePhase | null {
  const raw = new URL(req.url).searchParams.get("phase");
  if (!raw) return "PM";
  const upper = raw.toUpperCase();
  return upper === "AM" || upper === "PM" ? upper : null;
}

/** GET — compile the same daily update the POST would send, but post nothing.
 *  Powers the review modal so the admin can eyeball each project's updates
 *  before confirming. `?phase=AM|PM` (default PM). Gated on tasks.publish
 *  (asserted inside previewDailyUpdates). */
export async function GET(req: Request) {
  try {
    const phase = parsePhase(req);
    if (!phase) return apiError("phase must be AM or PM", 400);
    const user = await requireAuthedUser(req);
    const result = await previewDailyUpdates(user, phase);
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}


/** POST — compile every dev's daily update (done-today for PM, in-progress for
 *  AM), grouped by project then developer, and post it to the dedicated updates
 *  channel (#updates). `?phase=AM|PM` (default PM). Gated on tasks.publish
 *  (asserted inside publishDailyUpdates). */
export async function POST(req: Request) {
  try {
    const phase = parsePhase(req);
    if (!phase) return apiError("phase must be AM or PM", 400);
    const user = await requireAuthedUser(req);
    const result = await publishDailyUpdates(user, phase);
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}
