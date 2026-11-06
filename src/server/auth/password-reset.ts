/**
 * Password reset by emailed link (multi-tenant Phase 3). Replaces the old reset, which set
 * ANY user's password on one shared `INITIAL_ADMIN_PASSWORD` recovery key.
 *
 * - A link is sent only to the account's own address, and only for an account that may use
 *   a password (`isPasswordLoginAllowed`). A Gitwork Google account never gets one.
 * - The token is 32 random bytes. Only its SHA-256 is stored. It works once, for an hour,
 *   and asking for a new one cancels the old ones.
 * - The request answers the same way whether or not the address exists, so the form can't
 *   be used to find accounts.
 */

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isPasswordLoginAllowed } from "@/types/auth";
import { findHomeMembership } from "@/server/auth/home-membership";
import { escapeHtml, sendWorkspaceEmail } from "@/server/email";

export const RESET_LINK_TTL_MS = 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://foundry.gitwork.co.uk").replace(/\/+$/, "");
}

/**
 * Send a reset link if `email` belongs to an account that may use a password. Says nothing
 * either way: the caller answers identically in every case.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return;
  const user = await prisma.user.findUnique({ where: { email: normalised }, select: { id: true, email: true, name: true } });
  if (!user) return;
  const membership = await findHomeMembership(user.id);
  if (!membership || !isPasswordLoginAllowed(membership.role, membership.workspace.slug)) return;

  const token = randomBytes(32).toString("base64url");
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + RESET_LINK_TTL_MS) },
  });

  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const name = user.name?.trim().split(/\s+/)[0] || "there";
  const result = await sendWorkspaceEmail({
    workspaceId: membership.workspaceId,
    to: user.email,
    subject: "Reset your Foundry password",
    text: `Hi ${name},\n\nUse this link to set a new Foundry password. It works once, for the next hour:\n\n${link}\n\nIf you didn't ask for this, ignore this email. Your password hasn't changed.`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Use this link to set a new Foundry password. It works once, for the next hour:</p><p><a href="${escapeHtml(link)}">Set a new password</a></p><p>If you didn't ask for this, ignore this email. Your password hasn't changed.</p>`,
  });
  if (!result.ok) console.error("[password-reset] email not sent:", result.error);
}

export type ResetResult = { ok: true; email: string } | { ok: false; error: string };

/** Use a reset link. Refused when unknown, used, expired, or the account can't use a password. */
export async function completePasswordReset(token: string, newPassword: string): Promise<ResetResult> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const invalid: ResetResult = { ok: false, error: "This link has expired or has already been used. Ask for a new one." };
  if (!token) return invalid;
  const row = await prisma.passwordResetToken.findFirst({
    where: { tokenHash: hashResetToken(token), usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userId: true },
  });
  if (!row) return invalid;
  // Claim the link first, so two submissions can't both use it.
  const claimed = await prisma.passwordResetToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return invalid;

  const membership = await findHomeMembership(row.userId);
  if (!membership || !isPasswordLoginAllowed(membership.role, membership.workspace.slug)) return invalid;

  const user = await prisma.user.update({
    where: { id: row.userId },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    select: { email: true },
  });
  return { ok: true, email: user.email };
}
