import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { pushProjectUpdate } from "@/server/slack-updates";
import { projectUpdatePushSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = projectUpdatePushSchema.parse(await req.json());
    const result = await pushProjectUpdate(user, body);
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}
