import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { setMyCrmMailbox } from "@/server/crm/service";
import { crmMailboxSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/account/crm-mailbox — { enabled } — let the CRM read MY Gmail (only messages to/from
 * a lead's domains). Self-service only: it resolves a real signed-in person and acts on them, so
 * no one can switch on another person's mailbox, and an API-key caller (no identity) cannot either.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireAuthedUser(request);
    const { enabled } = crmMailboxSchema.parse(await request.json());
    return apiOk(await setMyCrmMailbox(user, enabled));
  } catch (error) {
    return fromError(error);
  }
}
