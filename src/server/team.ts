import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dispatchNotification } from "@/server/notifications";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { ForbiddenError } from "@/server/auth/effective-user";
import { recomputeMember } from "@/server/permissions";
import { seedAccountUserWhere, isSeedAccount } from "@/server/seed-accounts";
import { canManageRole, normalizeOverrides, type PermissionOverrides, type RoleId } from "@/types/auth";
import {
  ACTIVE_MEMBER,
  ARCHIVE_RETENTION_DAYS,
  canRestore,
  daysUntilPurge,
  memberStatus,
  purgeCutoff,
} from "@/server/auth/member-status";

export async function getWorkspace() {
  return prisma.workspace.findUniqueOrThrow({ where: { slug: DEFAULT_WORKSPACE_SLUG } });
}

export async function listMembers() {
  const workspace = await getWorkspace();
  // includes-archived: this IS the user-management table. It has to see archived
  // members to show them, count down their retention and restore them.
  const rows = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: workspace.id,
      user: seedAccountUserWhere(),
    },
    // `googleOAuthEmail` is captured on a member's first successful Google sign-in (the auth
    // jwt callback writes it whenever Google returns a refresh token — which `prompt: "consent"`
    // forces every sign-in). Its presence is therefore a reliable "has actually signed in"
    // signal, separating active members from those only provisioned/invited so far.
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, googleOAuthEmail: true } } },
    orderBy: { createdAt: "asc" },
  });
  // Open work per person, so archiving someone shows what they still own and can be
  // reassigned first. Top-level, not archived, not done — the same definition every
  // other progress figure in the app uses.
  const userIds = rows.map((r) => r.userId);
  const open = userIds.length
    ? await prisma.task.findMany({
        where: {
          workspaceId: workspace.id,
          parentId: null,
          archivedAt: null,
          status: { not: "DONE" },
          OR: [{ assignees: { some: { id: { in: userIds } } } }, { assigneeId: { in: userIds } }],
        },
        select: { assigneeId: true, assignees: { select: { id: true } } },
      })
    : [];
  const openTasks = new Map<string, number>();
  for (const t of open) {
    const owners = new Set<string>(t.assignees.map((a) => a.id));
    if (t.assigneeId) owners.add(t.assigneeId);
    for (const id of owners) openTasks.set(id, (openTasks.get(id) ?? 0) + 1);
  }

  const archiverIds = [...new Set(rows.map((r) => r.archivedById).filter((v): v is string => !!v))];
  const archivers = new Map<string, string>();
  if (archiverIds.length) {
    const people = await prisma.user.findMany({
      where: { id: { in: archiverIds } },
      select: { id: true, name: true, email: true },
    });
    for (const p of people) archivers.set(p.id, p.name ?? p.email);
  }

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
      status: memberStatus(row),
      daysUntilPurge: daysUntilPurge(row),
      openTaskCount: openTasks.get(row.userId) ?? 0,
      archivedByName: row.archivedById ? (archivers.get(row.archivedById) ?? null) : null,
      permissions: Array.isArray(row.permissions)
        ? (row.permissions as unknown[]).filter((p): p is string => typeof p === "string")
        : [],
    };
  });
}

export interface MemberActor {
  id: string;
  role: string;
}

/**
 * Archive a member: they lose all access immediately and disappear from every
 * roster, but nothing about them is changed, so `restoreMember` within
 * ARCHIVE_RETENTION_DAYS brings back their role, permissions and overrides exactly.
 *
 * ⚠️ This replaces the old `removeMember`, which DELETED the membership. That was
 * the unsafe operation: the person's Google account still worked, and a User with
 * no membership was handed a STAFF session and then treated as a trusted
 * full-access caller by every `getEffectiveUserOrNull` route. See
 * `RevokedAccessError` in src/server/auth/effective-user.ts.
 *
 * Guardrails: the same rank rule as every other member edit (an Admin archives
 * Staff/Developers/Guests; only a Super Admin archives an Admin or Super Admin);
 * you cannot archive yourself; and you cannot archive the last ACTIVE Super Admin.
 */
export async function archiveMember(memberId: string, actor: MemberActor) {
  const existing = await prisma.workspaceMember.findUnique({
    where: { id: memberId },
    select: { id: true, workspaceId: true, role: true, userId: true, archivedAt: true },
  });
  if (!existing) return null;
  if (existing.archivedAt) return existing; // idempotent: a second click is a no-op

  if (existing.userId === actor.id) {
    throw new ForbiddenError("You can't archive yourself.");
  }
  if (!canManageRole(actor.role, existing.role)) {
    throw new ForbiddenError("You can't archive a member at or above your own role.");
  }
  if (existing.role === "SUPER_ADMIN") {
    await assertNotLastSuperAdmin(existing.workspaceId, memberId);
  }

  return prisma.workspaceMember.update({
    where: { id: memberId },
    data: { archivedAt: new Date(), archivedById: actor.id },
  });
}

/**
 * Restore an archived member. Their role and overrides were never touched, so this
 * is the whole operation — and it is refused once the retention window has passed,
 * even if the purge job has not removed the row yet. That is what keeps the purge
 * job a tidy-up rather than a security control.
 */
export async function restoreMember(memberId: string, actor: MemberActor) {
  const existing = await prisma.workspaceMember.findUnique({
    where: { id: memberId },
    select: { id: true, role: true, archivedAt: true },
  });
  if (!existing) return null;
  if (!existing.archivedAt) return existing;

  if (!canManageRole(actor.role, existing.role)) {
    throw new ForbiddenError("You can't restore a member at or above your own role.");
  }
  if (!canRestore(existing)) {
    throw new ForbiddenError(
      `This person was archived more than ${ARCHIVE_RETENTION_DAYS} days ago and can no longer be restored. Reinstate them instead.`,
    );
  }

  const restored = await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { archivedAt: null, archivedById: null },
  });
  // Their cached effective permissions are recomputed in case the role matrix
  // changed while they were away.
  await recomputeMember(memberId);
  return restored;
}

/**
 * Bring back someone whose membership has gone — archived past the window and
 * purged, or removed before archiving existed. They have a User row and no
 * membership, which sign-in now refuses outright (it no longer re-provisions), so
 * this is the only way back in. Without it, a returning hire would be locked out
 * of their own email address for good.
 */
export async function reinstateMemberByEmail(email: string, role: RoleId, actor: MemberActor) {
  const workspace = await getWorkspace();
  if (!canManageRole(actor.role, role)) {
    throw new ForbiddenError("You can't reinstate someone into a role at or above your own.");
  }
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: {
      id: true,
      memberships: { where: { workspaceId: workspace.id }, select: { id: true, archivedAt: true } },
    },
  });
  if (!user) return { status: "not-found" as const };
  const existing = user.memberships[0];
  if (existing && !existing.archivedAt) return { status: "already-active" as const };
  if (existing) return { status: "archived" as const, memberId: existing.id }; // use Restore

  const member = await prisma.workspaceMember.create({
    data: { workspaceId: workspace.id, userId: user.id, role, permissions: [] },
  });
  await recomputeMember(member.id);
  return { status: "reinstated" as const, memberId: member.id };
}

/**
 * Delete memberships archived longer than the retention window. Run daily by
 * GET /api/cron/member-purge.
 *
 * ⚠️ Deletes the MEMBERSHIP, never the User. A User row is referenced by tasks,
 * leave, expenses, meetings, documents and the audit log; deleting it would
 * cascade through all of them and erase who did what. Removing the membership is
 * what takes them out of the workspace; their history stays attributed.
 *
 * If this never runs, nobody regains access and nobody can be restored past the
 * window (`memberStatus` reports them `expired`). It only tidies rows.
 */
export async function purgeExpiredMembers(now: Date = new Date()) {
  // includes-archived: the purge job exists to find archived members.
  const result = await prisma.workspaceMember.deleteMany({
    where: { archivedAt: { not: null, lt: purgeCutoff(now) } },
  });
  return { purged: result.count };
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
  // ⚠️ ACTIVE Super Admins only. Counting archived ones would let you archive one
  // Super Admin and then demote or archive the other, and the guard would see "one
  // left" when there were none — a workspace nobody can edit the role matrix of.
  const others = await prisma.workspaceMember.count({
    where: {
      workspaceId,
      role: "SUPER_ADMIN",
      id: { not: memberId },
      user: seedAccountUserWhere(),
      ...ACTIVE_MEMBER,
    },
  });
  if (others === 0) {
    throw new Error(
      "Can't remove or archive the last active Super Admin — promote someone else first or this workspace becomes uneditable.",
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
  const alreadyMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
    select: { id: true },
  });
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
    update: {},
    create: { workspaceId: invite.workspaceId, userId, role: "STAFF", permissions: [] },
  });

  // Only on a genuine first join (not a re-accept) — let admins know.
  if (!alreadyMember) {
    const joiner = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const joinerName = joiner?.name?.trim() || joiner?.email || "A new teammate";
    dispatchNotification({
      event: "team.member_added",
      workspaceId: invite.workspaceId,
      target: { kind: "admins" },
      title: `${joinerName} joined the workspace`,
      actionUrl: "/app/settings/team",
      groupKey: "team.member_added",
    });
  }

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
