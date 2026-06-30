import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getSlackPushPrefs, saveSlackPushPrefs } from "@/server/slack-updates";
import { slackPushPrefsSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const prefs = await getSlackPushPrefs(user);
    return apiOk(prefs);
  } catch (e) {
    return fromError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = slackPushPrefsSchema.parse(await req.json());
    const prefs = await saveSlackPushPrefs(user, body);
    return apiOk(prefs);
  } catch (e) {
    return fromError(e);
  }
}
