import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { PASSWORD_LOGIN_ROLES, isPasswordLoginAllowed } from "@/types/auth";

/**
 * Email-and-password sign-in, for guests only.
 *
 * ── Why "guests only" is a rule and not a preference ──────────────────────────
 * Until now `User.passwordHash` was WRITE-ONLY: three routes set it and nothing
 * on earth read it, because Google was the only provider. One of those writers is
 * `POST /api/auth/forgot-password`, which is public and sets ANY user's password
 * on presentation of a single shared `INITIAL_ADMIN_PASSWORD` recovery key.
 *
 * That was harmless while no password could be used to sign in. The moment one
 * can, it becomes a path to a Super Admin account: reset their password with the
 * shared key, then log in as them.
 *
 * So the gate is structural rather than procedural — **a password can only ever
 * authenticate a GUEST**. Resetting a Super Admin's password now gains an attacker
 * nothing, because no provider will accept it. Staff and admins remain Google-only,
 * which also keeps the `@gitwork.co.uk` domain check meaningful for them.
 *
 * ⚠️ Do not relax `PASSWORD_LOGIN_ROLES` to include a staff role without first
 * dealing with that recovery-key route. The two are a pair.
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
 * Verify an email and password against a GUEST membership of the default workspace.
 *
 * Returns the same `{ ok: false }` for every failure — unknown email, wrong
 * password, a real user who is not a guest, a guest with no password set. The
 * caller must not distinguish them in what it shows the user either: "unknown
 * email" and "wrong password" told apart is an account-enumeration oracle.
 */
export async function verifyGuestPassword(
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
      memberships: {
        where: { workspace: { slug: DEFAULT_WORKSPACE_SLUG } },
        select: { role: true },
        take: 1,
      },
    },
  });

  // Always spend the bcrypt cost, even when there is nothing to check.
  const hash = user?.passwordHash ?? DECOY_HASH;
  const matches = await bcrypt.compare(password, hash);

  if (!user || !user.passwordHash || !matches) return { ok: false };
  if (!isPasswordLoginAllowed(user.memberships[0]?.role)) return { ok: false };

  return { ok: true, userId: user.id, email: user.email, name: user.name };
}
