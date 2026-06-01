import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getMyDay, pushDailyUpdate } from "@/server/tasks-standup";
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
