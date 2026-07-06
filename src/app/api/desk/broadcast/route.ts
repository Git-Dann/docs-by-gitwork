import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getActiveBroadcast, postBroadcast, dismissActiveBroadcast } from "@/server/desk";
import { broadcastCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk({ broadcast: await getActiveBroadcast(user) });
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = broadcastCreateSchema.parse(await req.json());
    const broadcast = await postBroadcast(user, body);
    return apiOk({ broadcast }, { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    await dismissActiveBroadcast(user);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
