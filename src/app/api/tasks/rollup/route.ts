import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getRollupRoster, publishRollup } from "@/server/tasks-standup";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const roster = await getRollupRoster(user);
    return apiOk(roster);
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const url = new URL(req.url);
    const override = url.searchParams.get("override") === "true";
    const result = await publishRollup(user, { override });
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}
