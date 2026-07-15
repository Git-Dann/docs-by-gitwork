import type { Prisma } from "@prisma/client";

// Placeholder accounts that aren't real teammates and must never appear in a
// people-picker / roster:
//   • the "Foundry Owner" (owner@gitwork.io) — the bootstrap base record;
//   • the env-seeded initial "admin" (INITIAL_ADMIN_EMAIL, via ensureInitialAdmin);
//   • anything on the example.com placeholder domain (e.g. admin@example.com); and
//   • anything whose DISPLAY NAME is a placeholder ("admin" / "Foundry Owner") —
//     the belt-and-suspenders, since a stray admin account's *email* isn't always
//     one we can predict, but its name is.
// Dan + Harry are the actual owners. This HIDES them from every list — it does
// not delete accounts or disable login.

/** The bootstrap "Foundry Owner" placeholder (see bootstrap.ts DEFAULT_USER_EMAIL). */
export const FOUNDRY_OWNER_EMAIL = "owner@gitwork.io";

/** Reserved placeholder domain — RFC 2606 says example.com is never a real host,
 *  so an @example.com account is always seed/junk, never a teammate. */
export const PLACEHOLDER_EMAIL_DOMAIN = "@example.com";

/** Placeholder display names. Case-insensitive matches are filtered out. No real
 *  Gitwork teammate is named "admin" or "Foundry Owner". */
export const SEED_ACCOUNT_NAMES = ["admin", "Foundry Owner"];

/** Concrete seed emails (owner + env-admin + the known example.com admin). */
export function seedAccountEmails(): string[] {
  const emails = [FOUNDRY_OWNER_EMAIL, "admin@example.com"];
  const admin = process.env.INITIAL_ADMIN_EMAIL?.trim();
  if (admin && !emails.includes(admin)) emails.push(admin);
  return emails;
}

/**
 * Prisma `user`-relation filter that excludes seed placeholder accounts by email
 * (explicit list + the whole example.com domain). Email is non-null, so this is
 * safe as a query clause. Name-based exclusion is done in-memory via isSeedAccount
 * (a `name notIn` clause would wrongly drop real teammates whose name is null).
 * Pair this where-clause with a `.filter(m => !isSeedAccount(...))` on the result.
 */
export function seedAccountUserWhere(): Prisma.UserWhereInput {
  return {
    email: { notIn: seedAccountEmails(), not: { endsWith: PLACEHOLDER_EMAIL_DOMAIN } },
  };
}

/** Case-insensitive in-memory test (email OR name) — for lists that can't use a
 *  Prisma where, and for bootstrap guards. */
export function isSeedAccount(user: { email?: string | null; name?: string | null }): boolean {
  const email = user.email?.trim().toLowerCase();
  if (email) {
    if (email.endsWith(PLACEHOLDER_EMAIL_DOMAIN)) return true;
    if (seedAccountEmails().some((s) => s.toLowerCase() === email)) return true;
  }
  const name = user.name?.trim().toLowerCase();
  if (name && SEED_ACCOUNT_NAMES.some((n) => n.toLowerCase() === name)) return true;
  return false;
}

/** Back-compat wrapper (email-only) still used by the bootstrap admin guard. */
export function isSeedAccountEmail(email: string | null | undefined): boolean {
  return isSeedAccount({ email });
}
