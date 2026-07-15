import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { ForbiddenError } from "@/server/auth/effective-user";
import { recomputeMember } from "@/server/permissions";
import { seedAccountUserWhere, isSeedAccount } from "@/server/seed-accounts";
import { canManageRole, normalizeOverrides, type PermissionOverrides, type RoleId } from "@/types/auth";

export async function getWorkspace() {
  return prisma.workspace.findUniqueOrThrow({ where: { slug: DEFAULT_WORKSPACE_SLUG } });
}

export async function listMembers() {
  const workspace = await getWorkspace();
  const rows = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: workspace.id,
      user: seedAccountUserWhere(),
    },
    // `googleOAuthEmail` is captured on a member's first successful Google sign-in (the auth
    // jwt callback writes it whenever Google returns a refresh token — which `prompt: "consent"`
    // forces every sign-in). Its presence is therefore a reliable "has actually signed in"
    // signal, separating active members from those only provisioned/invited so far.
    include: { user: { select: { id: true, name: true, email: true, googleOAuthEmail: true } } },
    orderBy: { createdAt: "asc" },
  });
  // Normalise `permissions` (Json column) to a string array for the UI, and surface a derived
  // `hasSignedIn` flag — without exposing the raw OAuth email field beyond the member row.
  return rows
    .filter((row) => !isSeedAccount({ email: row.user.email, name: row.user.name }))
    .map((row) => {
    const { googleOAuthEmail, ...user } = row.user;
    return {
      ...row,
      user,
      hasSignedIn: Boolean(googleOAuthEmail),
      permissions: Array.isArray(row.permissions)
        ? (row.permissions as unknown[]).filter((p): p is string => typeof p === "string")
        : [],
    };
  });
}

/**
 * Removes a member. Guardrail: the actor can only remove members below their own
 * role, and the last Super Admin can never be removed (workspace lock-out).
 */
export async function removeMember(memberId: string, actorRole: string) {
  const existing = await prisma.workspaceMember.findUnique({
    where: { id: memberId },
    select: { id: true, workspaceId: true, role: true },
  });
  if (!existing) return;

  if (!canManageRole(actorRole, existing.role)) {
    throw new ForbiddenError("You can't remove a member at or above your own role.");
  }
  if (existing.role === "SUPER_ADMIN") {
    await assertNotLastSuperAdmin(existing.workspaceId, memberId);
  }

  return prisma.workspaceMember.delete({ where: { id: memberId } });
}

export interface UpdateMemberInput {
  role?: RoleId;
  permissionOverrides?: PermissionOverrides;
}

/**
 * Updates a member's role and/or per-person permission overrides, then recomputes
 * their cached effective permissions from the role matrix.
 *
 * Guardrails (see canManageRole in src/types/auth.ts):
 *  • You can only manage a member whose current role is below your own — so only a
 *    Super Admin can edit Admins/Super Admins; an Admin manages Staff & Developers.
 *  • You can't assign a role at or above your own (no self-escalation).
 *  • The last Super Admin can't be demoted (workspace lock-out protection).
 * Changing a member's role clears their overrides (clean slate for the new role)
 * unless explicit overrides are supplied in the same call.
 */
export async function updateMember(memberId: string, input: UpdateMemberInput, actorRole: string) {
  const existing = await prisma.workspaceMember.findUnique({
    where: { id: memberId },
    select: { id: true, workspaceId: true, role: true },
  });
  if (!existing) throw new Error("Member not found");

  if (!canManageRole(actorRole, existing.role)) {
    throw new ForbiddenError("You can't manage a member at or above your own role.");
  }

  const roleChanged = input.role !== undefined && input.role !== existing.role;
  if (input.role !== undefined && roleChanged) {
    if (!canManageRole(actorRole, input.role)) {
      throw new ForbiddenError("You can't assign a role at or above your own.");
    }
    if (existing.role === "SUPER_ADMIN" && input.role !== "SUPER_ADMIN") {
      await assertNotLastSuperAdmin(existing.workspaceId, memberId);
    }
  }

  const overrides =
    input.permissionOverrides !== undefined
      ? normalizeOverrides(input.permissionOverrides)
      : roleChanged
        ? { grant: [], revoke: [] } // reset overrides on a role change
        : undefined;

  await prisma.workspaceMember.update({
    where: { id: memberId },
    data: {
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(overrides !== undefined
        ? { permissionOverrides: overrides as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });

  // Refresh the cached resolved `permissions` so middleware/JWT and every reader stay in sync.
  await recomputeMember(memberId);

  return prisma.workspaceMember.findUniqueOrThrow({
    where: { id: memberId },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

/** Throws if `memberId` is the only remaining (non-bootstrap) Super Admin. */
async function assertNotLastSuperAdmin(workspaceId: string, memberId: string) {
  const others = await prisma.workspaceMember.count({
    where: {
      workspaceId,
      role: "SUPER_ADMIN",
      id: { not: memberId },
      user: seedAccountUserWhere(),
    },
  });
  if (others === 0) {
    throw new Error(
      "Can't remove the last Super Admin — promote someone else first or this workspace becomes uneditable.",
    );
  }
}

/**
 * Best-effort match of a user's display name against pending invite labels. Used when a
 * user signs in directly (not via the invite URL) so we don't leave the invite hanging
 * in the Team list forever.
 *
 * Match rules: case-insensitive, trim. Either the label contains the user's first name
 * OR the user's first name contains the label. So an invite labeled "Harry" matches
 * "Harry Brown", and an invite labeled "Harry Brown" matches "Harry".
 */
export async function autoAcceptMatchingInvite(userId: string, userName: string | null | undefined) {
  const firstName = (userName ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  if (!firstName || firstName.length < 2) return null;

  const workspace = await getWorkspace();
  const pending = await prisma.workspaceInvite.findMany({
    where: { workspaceId: workspace.id, status: "PENDING" },
    select: { id: true, label: true },
  });

  const match = pending.find((invite) => {
    const label = (invite.label ?? "").trim().toLowerCase();
    if (!label) return false;
    return label.includes(firstName) || firstName.includes(label.split(/\s+/)[0] ?? "");
  });

  if (!match) return null;

  return prisma.workspaceInvite.update({
    where: { id: match.id },
    data: { status: "ACCEPTED", acceptedById: userId },
  });
}

export async function listInvites() {
  const workspace = await getWorkspace();

  // An invite's status only ever changes in response to a real action by the recipient:
  // opening /invite/[token] (acceptInvite) or signing in directly with a name that matches
  // a pending label (autoAcceptMatchingInvite, in the auth jwt callback). We deliberately do
  // NOT auto-match pending invites against the existing member list here. That used to flip a
  // freshly-generated link to "Accepted" the instant its label matched someone already in the
  // workspace (e.g. a teammate seeded from the roster) — so the link never appeared and the
  // invite looked auto-accepted by a person who'd done nothing. A generated link now stays
  // PENDING until it's genuinely used.
  return prisma.workspaceInvite.findMany({
    where: { workspaceId: workspace.id },
    include: {
      invitedBy: { select: { name: true, email: true } },
      acceptedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createInvite(invitedById: string, label?: string) {
  const workspace = await getWorkspace();
  return prisma.workspaceInvite.create({
    data: {
      workspaceId: workspace.id,
      invitedById,
      label: label ?? null,
      status: "PENDING",
    },
  });
}

export async function revokeInvite(inviteId: string) {
  return prisma.workspaceInvite.update({
    where: { id: inviteId },
    data: { status: "REVOKED" },
  });
}

export async function deleteInvite(inviteId: string) {
  return prisma.workspaceInvite.delete({ where: { id: inviteId } });
}

export async function updateInviteLabel(inviteId: string, label: string | null) {
  return prisma.workspaceInvite.update({
    where: { id: inviteId },
    data: { label: label?.trim() || null },
  });
}

export async function acceptInvite(token: string, userId: string) {
  const invite = await prisma.workspaceInvite.findUnique({ where: { token } });
  if (!invite || invite.status !== "PENDING") return null;
  if (invite.expiresAt && invite.expiresAt < new Date()) return null;

  // Ensure the user is a member of this workspace
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
    update: {},
    create: { workspaceId: invite.workspaceId, userId, role: "STAFF", permissions: [] },
  });

  return prisma.workspaceInvite.update({
    where: { id: invite.id },
    data: { status: "ACCEPTED", acceptedById: userId },
  });
}

export async function getInviteByToken(token: string) {
  return prisma.workspaceInvite.findUnique({
    where: { token },
    include: { workspace: { select: { name: true } } },
  });
}

export interface MergeAccountsResult {
  keepEmail: string;
  mergeEmail: string;
  transferred: {
    clientAssignments: number;
    tasks: number;
    taskAssignees: number;
    leaveRequests: number;
    expenses: number;
    dailyUpdates: number;
    taskComments: number;
    slackLogs: number;
    candidateEmailUpdated: boolean;
  };
  membershipAction: "transferred" | "merged_role" | "kept" | "none";
}

/**
 * Merge two user accounts. All data from `mergeEmail` is transferred to `keepEmail`,
 * then the `mergeEmail` account is deleted. Super Admin only.
 *
 * Use case: a dev was provisioned with a placeholder/old email, later got a gitwork
 * email, and logged in — creating a second bare account. This collapses the two.
 */
export async function mergeUserAccounts(
  keepEmail: string,
  mergeEmail: string,
): Promise<MergeAccountsResult> {
  if (keepEmail.toLowerCase() === mergeEmail.toLowerCase()) {
    throw new Error("Cannot merge an account with itself.");
  }

  const workspace = await getWorkspace();

  const [keepUser, mergeUser] = await Promise.all([
    prisma.user.findUnique({
      where: { email: keepEmail },
      include: {
        memberships: { where: { workspaceId: workspace.id }, take: 1 },
      },
    }),
    prisma.user.findUnique({
      where: { email: mergeEmail },
      include: {
        memberships: { where: { workspaceId: workspace.id }, take: 1 },
      },
    }),
  ]);

  if (!keepUser) throw new Error(`No account found for ${keepEmail}`);
  if (!mergeUser) throw new Error(`No account found for ${mergeEmail}`);

  const keepMembership = keepUser.memberships[0] ?? null;
  const mergeMembership = mergeUser.memberships[0] ?? null;

  const ROLE_RANK: Record<string, number> = {
    SUPER_ADMIN: 4,
    ADMIN: 3,
    STAFF: 2,
    DEVELOPER: 1,
  };

  const result: MergeAccountsResult = {
    keepEmail,
    mergeEmail,
    transferred: {
      clientAssignments: 0,
      tasks: 0,
      taskAssignees: 0,
      leaveRequests: 0,
      expenses: 0,
      dailyUpdates: 0,
      taskComments: 0,
      slackLogs: 0,
      candidateEmailUpdated: false,
    },
    membershipAction: "none",
  };

  await prisma.$transaction(async (tx) => {
    // ── Membership ──────────────────────────────────────────────────────────
    if (mergeMembership && keepMembership) {
      const mergeRank = ROLE_RANK[mergeMembership.role] ?? 0;
      const keepRank = ROLE_RANK[keepMembership.role] ?? 0;
      if (mergeRank > keepRank) {
        // Merge account has a higher role — promote the keep account
        await tx.workspaceMember.update({
          where: { id: keepMembership.id },
          data: {
            role: mergeMembership.role,
            permissions: mergeMembership.permissions as Prisma.InputJsonValue,
            permissionOverrides: mergeMembership.permissionOverrides as Prisma.InputJsonValue,
          },
        });
        result.membershipAction = "merged_role";
      } else {
        result.membershipAction = "kept";
      }
      await tx.workspaceMember.delete({ where: { id: mergeMembership.id } });
    } else if (mergeMembership && !keepMembership) {
      // Keep account has no membership — reassign merge's membership
      await tx.workspaceMember.update({
        where: { id: mergeMembership.id },
        data: { userId: keepUser.id },
      });
      result.membershipAction = "transferred";
    }

    // ── ClientAssignment ────────────────────────────────────────────────────
    // Delete any keep-user assignments that would conflict with merge-user's
    const mergeAssignments = await tx.clientAssignment.findMany({
      where: { userId: mergeUser.id },
      select: { clientId: true },
    });
    const mergeClientIds = mergeAssignments.map((r) => r.clientId);
    if (mergeClientIds.length > 0) {
      await tx.clientAssignment.deleteMany({
        where: { userId: keepUser.id, clientId: { in: mergeClientIds } },
      });
      const { count } = await tx.clientAssignment.updateMany({
        where: { userId: mergeUser.id },
        data: { userId: keepUser.id },
      });
      result.transferred.clientAssignments = count;
    }

    // ── Tasks (legacy single assignee) ──────────────────────────────────────
    const { count: taskCount } = await tx.task.updateMany({
      where: { assigneeId: mergeUser.id },
      data: { assigneeId: keepUser.id },
    });
    result.transferred.tasks = taskCount;

    // Creator FK — SetNull on delete handles it, but transfer so history stays
    await tx.task.updateMany({
      where: { createdById: mergeUser.id },
      data: { createdById: keepUser.id },
    });

    // ── Task m-n assignees (implicit join table _TaskAssignees) ─────────────
    // A = Task id, B = User id (Task < User alphabetically → A=Task, B=User)
    const assigneeRows = await tx.$executeRaw`
      INSERT INTO "_TaskAssignees" ("A", "B")
      SELECT "A", ${keepUser.id}
      FROM "_TaskAssignees"
      WHERE "B" = ${mergeUser.id}
      ON CONFLICT DO NOTHING
    `;
    result.transferred.taskAssignees = Number(assigneeRows);
    await tx.$executeRaw`DELETE FROM "_TaskAssignees" WHERE "B" = ${mergeUser.id}`;

    // ── Leave requests ───────────────────────────────────────────────────────
    const { count: lrReq } = await tx.leaveRequest.updateMany({
      where: { userId: mergeUser.id },
      data: { userId: keepUser.id },
    });
    await tx.leaveRequest.updateMany({
      where: { approvedById: mergeUser.id },
      data: { approvedById: keepUser.id },
    });
    result.transferred.leaveRequests = lrReq;

    // ── Expenses ─────────────────────────────────────────────────────────────
    const { count: expClaim } = await tx.expense.updateMany({
      where: { userId: mergeUser.id },
      data: { userId: keepUser.id },
    });
    await tx.expense.updateMany({
      where: { reviewedById: mergeUser.id },
      data: { reviewedById: keepUser.id },
    });
    result.transferred.expenses = expClaim;

    // ── DailyUpdate (unique on userId+workDate — skip dates keepUser already owns)
    const conflictDates = await tx.dailyUpdate.findMany({
      where: { userId: keepUser.id },
      select: { workDate: true },
    });
    const conflictDateValues = conflictDates.map((r) => r.workDate);
    if (conflictDateValues.length > 0) {
      await tx.dailyUpdate.deleteMany({
        where: { userId: mergeUser.id, workDate: { in: conflictDateValues } },
      });
    }
    const { count: duCount } = await tx.dailyUpdate.updateMany({
      where: { userId: mergeUser.id },
      data: { userId: keepUser.id },
    });
    result.transferred.dailyUpdates = duCount;

    // ── TaskComment (authorId nullable — transfer, don't null) ───────────────
    const { count: tcCount } = await tx.taskComment.updateMany({
      where: { authorId: mergeUser.id },
      data: { authorId: keepUser.id },
    });
    result.transferred.taskComments = tcCount;

    // ── SlackUpdateLog ───────────────────────────────────────────────────────
    const { count: slCount } = await tx.slackUpdateLog.updateMany({
      where: { userId: mergeUser.id },
      data: { userId: keepUser.id },
    });
    result.transferred.slackLogs = slCount;

    // ── Candidate email backfill ─────────────────────────────────────────────
    const candidateUpdate = await tx.candidate.updateMany({
      where: { email: mergeUser.email },
      data: { email: keepUser.email },
    });
    result.transferred.candidateEmailUpdated = candidateUpdate.count > 0;

    // ── Delete the merged user (cascades DeviceToken, oauth tokens, etc.) ────
    await tx.user.delete({ where: { id: mergeUser.id } });
  });

  return result;
}
