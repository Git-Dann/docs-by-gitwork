import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { listDeskReminders, createDeskReminder } from "@/server/desk";
import { deskReminderCreateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk({ reminders: await listDeskReminders(user) });
  } catch (e) {
    return fromError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = deskReminderCreateSchema.parse(await req.json());
    const reminder = await createDeskReminder(user, body.body);
    return apiOk({ reminder }, { status: 201 });
  } catch (e) {
    return fromError(e);
  }
}
