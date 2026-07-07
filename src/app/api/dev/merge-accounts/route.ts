/**
 * POST /api/dev/merge-accounts — Super Admin only.
 *
 * Merges two user accounts: all data (client assignments, tasks, leave, expenses,
 * standup logs, etc.) is transferred from `mergeEmail` to `keepEmail`, then the
 * `mergeEmail` account is deleted. Use when a dev was provisioned with a
 * placeholder/old email and has since logged in with their gitwork email,
 * creating a second bare account.
 *
 * Body: { keepEmail: string, mergeEmail: string }
 */

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { assertSuperAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { mergeUserAccounts } from "@/server/team";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  keepEmail: z.string().email(),
  mergeEmail: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    assertSuperAdmin(user);
    const { keepEmail, mergeEmail } = bodySchema.parse(await req.json());
    const result = await mergeUserAccounts(keepEmail, mergeEmail);
    return apiOk(result);
  } catch (e) {
    return fromError(e);
  }
}
