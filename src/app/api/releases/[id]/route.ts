import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { deleteRelease, updateRelease } from "@/server/releases";
import { releaseUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const body = releaseUpdateSchema.parse(await req.json());
    return apiOk(await updateRelease(user, id, body));
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    await deleteRelease(user, id);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
