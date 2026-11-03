/**
 * Google sign-in for people at a business other than Gitwork (multi-tenant Phase 3).
 *
 * It uses a SECOND Google OAuth client ("google-business" in src/auth.ts) that asks only for
 * name and email. Foundry's main Google client asks for Gmail and Drive, which Google only
 * grants to outside users after a verification review. The second client is off until
 * AUTH_GOOGLE_BUSINESS_ID and AUTH_GOOGLE_BUSINESS_SECRET are set.
 *
 * Who may use it:
 * - someone who already has an active membership somewhere;
 * - someone with a pending invite addressed to their email;
 * - someone whose email domain exactly one business lists in `allowedEmailDomains`.
 * Everyone else is refused. A business never gets a public mail domain (email-domains.ts).
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_PROVISIONED_ROLE } from "@/types/auth";
import { emailDomain, GITWORK_EMAIL_DOMAIN, PUBLIC_EMAIL_DOMAINS } from "@/lib/email-domains";
import { inviteRefusal, inviteRole } from "@/lib/invite-rules";
import { findHomeMembership } from "@/server/auth/home-membership";
import { recomputeMember } from "@/server/permissions";
import { applyInviteDeveloperFlag } from "@/server/staff";

export function businessGoogleConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.AUTH_GOOGLE_BUSINESS_ID && env.AUTH_GOOGLE_BUSINESS_SECRET);
}

/** The one business that lists this email's domain, or null (none, or more than one). */
export async function workspaceForEmailDomain(email: string): Promise<string | null> {
  const domain = emailDomain(email);
  if (!domain || domain === GITWORK_EMAIL_DOMAIN || PUBLIC_EMAIL_DOMAINS.has(domain)) return null;
  const rows = await prisma.workspace.findMany({ where: { allowedEmailDomains: { has: domain } }, select: { id: true }, take: 2 });
  return rows.length === 1 ? rows[0].id : null;
}

async function pendingInviteFor(email: string) {
  const invites = await prisma.workspaceInvite.findMany({
    where: { email: email.trim().toLowerCase(), status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return invites.find((i) => !inviteRefusal(i, email)) ?? null;
}

/** May this verified Google email sign in through the business client? */
export async function businessGoogleAllowed(email: string): Promise<"ok" | "revoked" | "not_allowed"> {
  const normalised = email.trim().toLowerCase();
  if (emailDomain(normalised) === GITWORK_EMAIL_DOMAIN) return "not_allowed";
  const user = await prisma.user.findUnique({ where: { email: normalised }, select: { id: true } });
  if (user && (await findHomeMembership(user.id))) return "ok";
  // A fresh invite addressed to them is someone deciding to let them in.
  if (await pendingInviteFor(normalised)) return "ok";
  // ⚠️ A domain only admits someone NEW. An existing account with no active membership was
  // removed or archived, and matching a domain must not bring them back.
  if (user) return "revoked";
  if (await workspaceForEmailDomain(normalised)) return "ok";
  return "not_allowed";
}

/**
 * Give a signed-in business Google user their membership, if they don't have one: from an
 * addressed invite first, else from their domain. Never touches Gitwork, never promotes.
 */
export async function provisionBusinessGoogleUser(email: string, name: string | null): Promise<string | null> {
  const normalised = email.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { email: normalised }, select: { id: true } });
  if (user && (await findHomeMembership(user.id))) return user.id;

  const invite = await pendingInviteFor(normalised);
  // Same rule as businessGoogleAllowed: a domain only admits a brand-new account.
  const workspaceId = invite?.workspaceId ?? (user ? null : await workspaceForEmailDomain(normalised));
  if (!workspaceId) return null;

  if (!user) {
    user = await prisma.user.create({ data: { email: normalised, name: name?.trim() || normalised.split("@")[0] }, select: { id: true } });
  }
  const member = await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    update: {},
    create: {
      workspaceId,
      userId: user.id,
      role: invite ? inviteRole(invite) : DEFAULT_PROVISIONED_ROLE,
      permissions: [],
    },
  });
  await recomputeMember(member.id).catch(() => undefined);
  if (invite) {
    await prisma.workspaceInvite.update({ where: { id: invite.id }, data: { status: "ACCEPTED", acceptedById: user.id } });
    await applyInviteDeveloperFlag(invite, member.id);
  }
  return user.id;
}
