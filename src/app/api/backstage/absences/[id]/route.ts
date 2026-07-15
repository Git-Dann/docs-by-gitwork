import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { deleteAbsence } from "@/server/absences";

export const dynamic = "force-dynamic";

// DELETE /api/backstage/absences/[id] — clear a same-day absence.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    await deleteAbsence(user, id);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
