import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { updateDeskReminder, deleteDeskReminder } from "@/server/desk";
import { deskReminderUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    const body = deskReminderUpdateSchema.parse(await req.json());
    const reminder = await updateDeskReminder(user, id, body);
    return apiOk({ reminder });
  } catch (e) {
    return fromError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    await deleteDeskReminder(user, id);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
