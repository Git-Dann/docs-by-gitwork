/**
 * Which email domains may sign in to a business with Google (multi-tenant Phase 3).
 * Pure, so the Platform console, the sign-in callback and the tests use one rule.
 */

/** Public mail providers: anyone can get an address there, so they can't name a business. */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com", "live.co.uk",
  "msn.com", "yahoo.com", "yahoo.co.uk", "ymail.com", "icloud.com", "me.com", "mac.com", "aol.com",
  "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.co.uk", "mail.com", "zoho.com", "yandex.com",
  "btinternet.com", "sky.com", "virginmedia.com", "talktalk.net",
]);

/** Gitwork's own domain belongs to Gitwork's workspace, which has its own sign-in. */
export const GITWORK_EMAIL_DOMAIN = "gitwork.co.uk";

export class EmailDomainError extends Error {
  status = 400;
}

export function emailDomain(email: string | null | undefined): string | null {
  const at = (email ?? "").trim().toLowerCase().split("@");
  return at.length === 2 && at[1] ? at[1] : null;
}

/** Pure: a clean, de-duplicated list, or an EmailDomainError naming the bad entry. */
export function normaliseAllowedDomains(input: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const d = raw.trim().toLowerCase().replace(/^@/, "");
    if (!d) continue;
    if (!/^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d)) {
      throw new EmailDomainError(`"${raw.trim()}" isn't a domain.`);
    }
    if (PUBLIC_EMAIL_DOMAINS.has(d)) throw new EmailDomainError(`${d} is a public mail service, so anyone could join. Invite those people by email instead.`);
    if (d === GITWORK_EMAIL_DOMAIN) throw new EmailDomainError(`${d} is Gitwork's.`);
    if (!out.includes(d)) out.push(d);
  }
  if (out.length > 10) throw new EmailDomainError("Up to 10 domains.");
  return out;
}
