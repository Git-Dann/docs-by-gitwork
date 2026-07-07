// Placeholder accounts that aren't real teammates and must never appear in a
// people-picker / roster:
//   • the "Foundry Owner" (owner@gitwork.io) — the bootstrap base record;
//   • the env-seeded initial "admin" (INITIAL_ADMIN_EMAIL, via ensureInitialAdmin); and
//   • anything on the example.com placeholder domain (e.g. admin@example.com — a
//     leftover seed that slipped through the env-only check).
// Dan + Harry are the actual owners. This HIDES them from lists — it does not
// delete accounts or disable login.

/** The bootstrap "Foundry Owner" placeholder (see bootstrap.ts DEFAULT_USER_EMAIL). */
export const FOUNDRY_OWNER_EMAIL = "owner@gitwork.io";

/** Reserved placeholder domain — RFC 2606 says example.com is never a real host,
 *  so an @example.com account is always seed/junk, never a teammate. */
export const PLACEHOLDER_EMAIL_DOMAIN = "@example.com";

/** Concrete emails to exclude from every workspace-member list (Prisma `notIn`).
 *  The example.com domain is handled separately via a `not: { endsWith }` clause
 *  and by isSeedAccountEmail below. */
export function seedAccountEmails(): string[] {
  const emails = [FOUNDRY_OWNER_EMAIL, "admin@example.com"];
  const admin = process.env.INITIAL_ADMIN_EMAIL?.trim();
  if (admin && !emails.includes(admin)) emails.push(admin);
  return emails;
}

/** Case-insensitive test covering the explicit emails AND the example.com
 *  placeholder domain — for in-memory filtering and bootstrap guards. */
export function isSeedAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (e.endsWith(PLACEHOLDER_EMAIL_DOMAIN)) return true;
  return seedAccountEmails().some((s) => s.toLowerCase() === e);
}
