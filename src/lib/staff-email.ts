/**
 * Whether an email belongs to Gitwork's own team.
 *
 * The same rule Google sign-in enforces in `src/auth.ts` (only @gitwork.co.uk may sign in
 * with Google). Shared so the client portal can recognise a team address and send it to
 * the team sign-in instead of logging it into a client's wiki.
 */
export const STAFF_EMAIL_DOMAIN = "gitwork.co.uk";

export function isGitworkStaffEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e.endsWith(`@${STAFF_EMAIL_DOMAIN}`);
}
