import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { findHomeMembership } from "@/server/auth/home-membership";
import { PASSWORD_LOGIN_ROLES, isPasswordLoginAllowed } from "@/types/auth";

/**
 * Email-and-password sign-in.
 *
 * Who may use it is `isPasswordLoginAllowed` (types/auth.ts): guests in Gitwork's
 * workspace, and every role in any other business (multi-tenant Phase 3). Gitwork's own
 * staff stay Google-only.
 *
 * ── Why this used to be "guests only" ─────────────────────────────────────────
 * `POST /api/auth/forgot-password` used to set ANY user's password on one shared
 * `INITIAL_ADMIN_PASSWORD` recovery key, so a password that could authenticate an admin
 * was an account takeover. That route now only sends a single-use link to the account's
 * own address (src/server/auth/password-reset.ts). ⚠️ Never bring back a reset that
 * doesn't prove control of the mailbox.
 */

// The rule itself lives in types/auth.ts so a client component can read it without
// pulling bcrypt and Prisma into the browser bundle. Re-exported here because this is
// where anyone reasoning about password sign-in will look for it.
export { PASSWORD_LOGIN_ROLES, isPasswordLoginAllowed };

/**
 * A bcrypt hash of a throwaway value, compared against when no user is found.
 *
 * Without it, an unknown email returns in microseconds while a known one costs a
 * full bcrypt verify — a timing difference big enough to enumerate accounts from
 * the outside. Comparing against a real hash makes both paths do the same work.
 * Generated once per process, because the cost is the point, not the value.
 */
const DECOY_HASH = bcrypt.hashSync("password-login-decoy", 12);

export type PasswordLoginResult =
  | { ok: true; userId: string; email: string; name: string | null }
  | { ok: false };

/**
 * Verify an email and password against a membership that may use one.
 *
 * Returns the same `{ ok: false }` for every failure — unknown email, wrong
 * password, a real user who signs in with Google, a guest with no password set. The
 * caller must not distinguish them in what it shows the user either: "unknown
 * email" and "wrong password" told apart is an account-enumeration oracle.
 */
export async function verifyPassword(
  email: string,
  password: string,
): Promise<PasswordLoginResult> {
  const normalised = email.trim().toLowerCase();
  if (!normalised || !password) {
    await bcrypt.compare(password || "x", DECOY_HASH);
    return { ok: false };
  }

  const user = await prisma.user.findUnique({
    where: { email: normalised },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
    },
  });

  // Always spend the bcrypt cost, even when there is nothing to check.
  const hash = user?.passwordHash ?? DECOY_HASH;
  const matches = await bcrypt.compare(password, hash);

  if (!user || !user.passwordHash || !matches) return { ok: false };
  // Their ACTIVE membership (src/server/auth/home-membership.ts). An archived guest has none,
  // and is refused exactly like a wrong password — same response, same timing (bcrypt already
  // ran above), so the login form cannot be used to learn whether an account exists or has
  // been archived.
  const membership = await findHomeMembership(user.id);
  if (!membership) return { ok: false };
  if (!isPasswordLoginAllowed(membership.role, membership.workspace.slug)) return { ok: false };

  return { ok: true, userId: user.id, email: user.email, name: user.name };
}
