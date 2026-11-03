/**
 * The gate every team-management route uses: the caller must be an active Admin or
 * Super Admin, resolved from the DATABASE on this request.
 *
 * ⚠️ Not `auth()` + `session.user.role`. That role is baked into the JWT at
 * sign-in, so a just-archived admin would still read as ADMIN until their session
 * is next revalidated — and these are the routes that archive and restore people.
 * `requireAuthedUser` re-reads the membership every call and throws
 * `RevokedAccessError` for an archived member, so the gate closes immediately.
 */

import { ForbiddenError, requireAuthedUser, type EffectiveUser } from "@/server/auth/effective-user";
import { isAtLeast } from "@/types/auth";

export async function requireTeamAdmin(request: Request): Promise<EffectiveUser> {
  const user = await requireAuthedUser(request);
  if (!isAtLeast(user.role, "ADMIN")) {
    throw new ForbiddenError("Only an Admin or Super Admin can manage team members.");
  }
  return user;
}
