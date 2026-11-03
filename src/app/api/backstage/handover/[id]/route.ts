import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { deleteHandover, getHandover, updateHandover } from "@/server/handover";
import { handoverPatchSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

// GET /api/backstage/handover/[id] — the authored items PLUS live client state,
// stamped with `asOf`. The derived half is recomputed here on every read so it
// can never go stale underneath whoever is covering.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    return apiOk(await getHandover(user, id));
  } catch (e) {
    return fromError(e);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const body = handoverPatchSchema.parse(await req.json());
    return apiOk(await updateHandover(user, id, body));
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    await deleteHandover(user, id);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
