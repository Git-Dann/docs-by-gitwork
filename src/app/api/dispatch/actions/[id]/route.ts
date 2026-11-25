import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { assertAssistantAvailable } from "@/server/dispatch/assistant/access-gate";
import { decideAction } from "@/server/dispatch/assistant/actions";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ decision: z.enum(["confirm", "cancel"]) }).strict();

/** POST /api/dispatch/actions/{id} — confirm or cancel something Dispatch proposed. Only its asker can. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    await assertAssistantAvailable(user);
    const { id } = await params;
    const { decision } = bodySchema.parse(await req.json());
    return apiOk(await decideAction(user, id, decision));
  } catch (err) {
    return fromError(err);
  }
}
