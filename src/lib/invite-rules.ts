/**
 * Who may accept a workspace invite, and with what role (multi-tenant Phase 3). Pure, so the
 * signed-in accept, the set-a-password accept and the tests all read the same rule.
 */

import { DEFAULT_PROVISIONED_ROLE, ROLE_IDS, type RoleId } from "@/types/auth";

export interface InviteFacts {
  status: string;
  expiresAt: Date | string | null;
  email: string | null;
  role: string | null;
}

export type InviteRefusal = "not_pending" | "expired" | "wrong_email";

export function normaliseEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** The role an accepted invite grants. An unknown or missing value is the minimal default. */
export function inviteRole(invite: Pick<InviteFacts, "role">): RoleId {
  return invite.role && (ROLE_IDS as readonly string[]).includes(invite.role)
    ? (invite.role as RoleId)
    : DEFAULT_PROVISIONED_ROLE;
}

/**
 * Null when `acceptingEmail` may accept, otherwise why not. An invite with an address can
 * only be accepted by that address: the owner invite for a new business must not be
 * redeemable by whoever else sees the link.
 */
export function inviteRefusal(invite: InviteFacts, acceptingEmail: string | null, now = new Date()): InviteRefusal | null {
  if (invite.status !== "PENDING") return "not_pending";
  if (invite.expiresAt && new Date(invite.expiresAt) < now) return "expired";
  if (invite.email && normaliseEmail(invite.email) !== normaliseEmail(acceptingEmail)) return "wrong_email";
  return null;
}

export const INVITE_REFUSAL_MESSAGE: Record<InviteRefusal, string> = {
  not_pending: "This invite has already been used or was withdrawn.",
  expired: "This invite has expired. Ask whoever sent it for a new one.",
  wrong_email: "This invite was sent to a different email address.",
};
