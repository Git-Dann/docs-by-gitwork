import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { getFoundryAutomation } from "@/server/foundry-automation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    return apiOk(await getFoundryAutomation(user));
  } catch (error) {
    return fromError(error);
  }
}
