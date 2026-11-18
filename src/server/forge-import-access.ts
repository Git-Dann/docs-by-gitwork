/**
 * Who may import a client's plan: an Admin or Super Admin with access to that client, signed in
 * as themselves. The import creates hundreds of tasks on a client's board, so the workspace API
 * key (no person behind it) is refused, and so is anyone below Admin.
 */

import { assertAtLeastAdmin, requireAuthedUser, type EffectiveUser } from "@/server/auth/effective-user";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import { requireClientIdForSlug } from "@/server/clients-scope";

export async function requireForgeImporter(req: Request, slug: string): Promise<{ user: EffectiveUser; clientId: string }> {
  const user = await requireAuthedUser(req);
  assertAtLeastAdmin(user);
  await assertClientAccessBySlug(user, slug);
  const clientId = await requireClientIdForSlug(slug, req);
  return { user, clientId };
}
