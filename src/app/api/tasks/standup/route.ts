import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getMyDay, pushDailyUpdate, deleteStandupUpdate } from "@/server/tasks-standup";
import { dailyUpdatePushSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const url = new URL(req.url);
    const date = url.searchParams.get("date") ?? undefined;
    const myDay = await getMyDay(user, date);
    return apiOk(myDay);
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = dailyUpdatePushSchema.parse(await req.json());
    const update = await pushDailyUpdate(user, body);
    return apiOk(update);
  } catch (e) {
    return fromError(e);
  }
}

// Retract a sent standup: delete today's posted Slack messages for the phase and
// reset the pushed state. `?phase=AM|PM`.
export async function DELETE(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const phase = new URL(req.url).searchParams.get("phase");
    if (phase !== "AM" && phase !== "PM") return apiError("phase must be AM or PM", 400);
    const update = await deleteStandupUpdate(user, phase);
    return apiOk(update);
  } catch (e) {
    return fromError(e);
  }
}
