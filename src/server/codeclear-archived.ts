/**
 * Which developers in Code belong to people who have left.
 *
 * Code lists `Candidate` rows, which are not team members — the only link between
 * a developer card and a person's Foundry account is their email. So a developer
 * is "archived" in Code when the matching team member is archived in Settings →
 * Team, and this is DERIVED rather than stored a second time on Candidate. Two
 * copies of "has this person left?" would disagree the first time someone restored
 * a member and forgot the developer card.
 *
 * Archived means either of:
 *   - their membership has `archivedAt` set (within the 30-day window), or
 *   - they have a User row but NO membership here (purged after the window, or
 *     removed before archiving existed). Without this second case, a developer
 *     would silently reappear on the active roster the day their 30 days ran out.
 *
 * ⚠️ Known limit: a developer card with no email, or an email that differs from
 * the address they sign in with, cannot be linked and stays on the active roster.
 * The Archived tab says so rather than implying it is complete.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function archivedTeamEmails(workspaceId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        // includes-archived: this query exists to find them.
        { memberships: { some: { workspaceId, archivedAt: { not: null } } } },
        { memberships: { none: { workspaceId } } },
      ],
    },
    select: { email: true },
  });
  return users.map((u) => u.email.trim().toLowerCase()).filter(Boolean);
}

function emailMatches(emails: string[]): Prisma.CandidateWhereInput[] {
  // `mode: insensitive` on equals, one per address: Candidate.email is typed by
  // hand and is frequently capitalised differently from the Google sign-in.
  return emails.map((e) => ({ email: { equals: e, mode: "insensitive" } }));
}

/**
 * Developers on the active roster — everyone whose person has NOT left.
 *
 * ⚠️ A record with no email must be matched explicitly. In SQL `NOT (email = 'x')` is NULL,
 * not true, when email is NULL, so a bare NOT hid every no-email record from Developers and
 * Staff → People. That is how Hassaan's old card (no email, nine placements) vanished and
 * he was given a second record (Nov 2026).
 */
export function activeDeveloperWhere(emails: string[]): Prisma.CandidateWhereInput {
  return emails.length ? { OR: [{ email: null }, { NOT: { OR: emailMatches(emails) } }] } : {};
}

/**
 * Developer records only. Since Staff (CLAUDE.md §87) a Candidate row can be anyone on
 * the team. A record is a developer's when it has a GitHub handle (how every developer
 * card was made before Staff) OR it's marked as one (`isDeveloper`: invited as a
 * developer, or switched on in their Staff profile).
 *
 * ⚠️ Not the permission role. Everyone signs in as DEVELOPER (§57.6), so a role-based
 * rule listed every new hire, developer or not. The role was used briefly (Nov 2026);
 * `backfillDeveloperFlags` turned what it said into the flag once, for the people already here.
 *
 * Every developer-facing list — Developers, Pipeline, the Overview's counts, and the
 * iOS Dev Directory, which reads the same endpoint — filters on this.
 */
export const DEVELOPER_ROLE = "DEVELOPER";
export const DEVELOPER_RECORD: Prisma.CandidateWhereInput = {
  OR: [{ githubHandle: { not: null } }, { isDeveloper: true }],
};

/** A developer whose card can't do its job yet: no GitHub handle, or no main stack. */
export const MISSING_DEVELOPER_DETAILS: Prisma.CandidateWhereInput = {
  OR: [{ githubHandle: null }, { primaryStack: "" }],
};

/** The same rule for a record already loaded. */
export function isDeveloperRecord(r: { githubHandle: string | null; isDeveloper: boolean | null }): boolean {
  return Boolean(r.githubHandle) || r.isDeveloper === true;
}

/** Only the developers whose person has left. Matches nothing when nobody has. */
export function archivedDeveloperWhere(emails: string[]): Prisma.CandidateWhereInput {
  return emails.length ? { OR: emailMatches(emails) } : { id: { in: [] } };
}
