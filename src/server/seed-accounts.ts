// Placeholder accounts created during bootstrap that aren't real teammates:
//   • the "Foundry Owner" (owner@gitwork.io) — the base record from
//     src/server/bootstrap.ts, and
//   • the env-seeded initial "admin" (INITIAL_ADMIN_EMAIL, via ensureInitialAdmin).
// Neither is a person, so they're filtered out of every people-picker / roster.
// Dan + Harry are the actual owners. This only HIDES them from lists — it does
// not delete the accounts or disable login.

/** The bootstrap "Foundry Owner" placeholder (see bootstrap.ts DEFAULT_USER_EMAIL). */
export const FOUNDRY_OWNER_EMAIL = "owner@gitwork.io";

/** Emails to exclude from every workspace-member list. Includes the env-seeded
 *  admin when INITIAL_ADMIN_EMAIL is set (it is at runtime — ensureInitialAdmin
 *  runs on every boot from the same env). */
export function seedAccountEmails(): string[] {
  const emails = [FOUNDRY_OWNER_EMAIL];
  const admin = process.env.INITIAL_ADMIN_EMAIL?.trim();
  if (admin) emails.push(admin);
  return emails;
}

/** Case-insensitive membership test — for in-memory filtering where a Prisma
 *  `notIn` clause isn't convenient. */
export function isSeedAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return seedAccountEmails().some((s) => s.toLowerCase() === e);
}
