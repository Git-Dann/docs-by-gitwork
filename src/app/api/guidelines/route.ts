import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getGuidelineOverrides, setGuidelineOverrides } from "@/server/guidelines";

export const dynamic = "force-dynamic";

/** The brand guidelines' text edits. Anyone signed in can read them; only admins change them. */
export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk({ overrides: await getGuidelineOverrides(user.workspaceId) });
  } catch (e) {
    return fromError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = (await req.json().catch(() => null)) as { overrides?: unknown } | null;
    return apiOk({ overrides: await setGuidelineOverrides(user, body?.overrides) });
  } catch (e) {
    return fromError(e);
  }
}
