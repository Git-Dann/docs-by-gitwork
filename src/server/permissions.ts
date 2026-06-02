import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ALL_PERMISSION_IDS,
  DEFAULT_ROLE_PERMISSIONS,
  LEGACY_PERMISSION_ALIASES,
  isSuperAdmin,
  isValidPermissionId,
  normalizeMatrix,
  normalizeOverrides,
  resolveEffectivePermissions,
  type ConfigurableRoleId,
  type PermissionOverrides,
  type RoleMatrix,
} from "@/types/auth";

// ════════════════════════════════════════════════════════════════════════════
// Permission resolution + the role matrix.
//
// Source of truth: Workspace.rolePermissions (the matrix) + each member's
// WorkspaceMember.permissionOverrides (a per-person delta). The resolved set is
// cached on WorkspaceMember.permissions and recomputed here whenever any of those
// change, so middleware / requireAuthedUser / the can* helpers all keep reading
// the single `permissions` field.
// ════════════════════════════════════════════════════════════════════════════

const KNOWN_ROLES = new Set<string>(["SUPER_ADMIN", "ADMIN", "STAFF", "DEVELOPER"]);

/** Emails that are always Super Admins (the workspace owner). Idempotently enforced. */
export const KNOWN_SUPER_ADMIN_EMAILS = ["dan@gitwork.co.uk"];

const asJson = (v: unknown) => v as unknown as Prisma.InputJsonValue;

// ── Matrix get/set ─────────────────────────────────────────────────────────────
export async function getRoleMatrix(workspaceId: string): Promise<RoleMatrix> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { rolePermissions: true },
  });
  return normalizeMatrix(ws?.rolePermissions);
}

/** Persist a new matrix and recompute every member's cached permissions. */
export async function setRoleMatrix(workspaceId: string, matrix: RoleMatrix): Promise<RoleMatrix> {
  const normalized = normalizeMatrix(matrix);
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { rolePermissions: asJson(normalized) },
  });
  await recomputeAllMembers(workspaceId, normalized);
  return normalized;
}

// ── Recompute the cached effective list ──────────────────────────────────────────
export async function recomputeMember(memberId: string, matrix?: RoleMatrix): Promise<string[]> {
  const member = await prisma.workspaceMember.findUnique({
    where: { id: memberId },
    select: { role: true, workspaceId: true, permissionOverrides: true },
  });
  if (!member) return [];
  const m = matrix ?? (await getRoleMatrix(member.workspaceId));
  const resolved = resolveEffectivePermissions(
    member.role,
    m,
    normalizeOverrides(member.permissionOverrides),
  );
  await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { permissions: asJson(resolved) },
  });
  return resolved;
}

export async function recomputeAllMembers(workspaceId: string, matrix?: RoleMatrix): Promise<void> {
  const m = matrix ?? (await getRoleMatrix(workspaceId));
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { id: true, role: true, permissionOverrides: true },
  });
  await Promise.all(
    members.map((member) =>
      prisma.workspaceMember.update({
        where: { id: member.id },
        data: {
          permissions: asJson(
            resolveEffectivePermissions(member.role, m, normalizeOverrides(member.permissionOverrides)),
          ),
        },
      }),
    ),
  );
}

// ── Migration (idempotent, called from ensureBaseRecords) ─────────────────────────
/**
 * Brings an existing workspace onto the role-matrix model without changing anyone's
 * effective access. Runs on boot (memoised by ensureBaseRecords):
 *   1. Always: ensure known super-admin emails carry the SUPER_ADMIN role.
 *   2. Once (when the matrix has never been seeded): seed DEFAULT_ROLE_PERMISSIONS and
 *      give every member a permissionOverrides delta so their resolved permissions
 *      exactly equal what they had before — admins keep their old role-bypass (ALL),
 *      staff keep their explicit array. Dan then edits the matrix to apply new policy.
 */
export async function migratePermissionModel(workspaceId: string): Promise<void> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { rolePermissions: true },
  });
  if (!ws) return;

  await promoteKnownSuperAdmins(workspaceId);

  if (ws.rolePermissions == null) {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { rolePermissions: asJson(DEFAULT_ROLE_PERMISSIONS) },
    });
    await freezeExistingMembers(workspaceId);
  }
}

async function promoteKnownSuperAdmins(workspaceId: string): Promise<void> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, user: { email: { in: KNOWN_SUPER_ADMIN_EMAILS } } },
    select: { id: true, role: true },
  });
  for (const member of members) {
    if (member.role !== "SUPER_ADMIN") {
      await prisma.workspaceMember.update({
        where: { id: member.id },
        data: { role: "SUPER_ADMIN" },
      });
      await recomputeMember(member.id);
    }
  }
}

/** Map an old-model member to the permission set they effectively had. */
function legacyEffective(role: string, permissionsJson: unknown): string[] {
  // Old model: ADMIN (and any super admin) bypassed every check → effectively ALL.
  if (role === "ADMIN" || isSuperAdmin(role)) return [...ALL_PERMISSION_IDS];
  const arr = Array.isArray(permissionsJson)
    ? (permissionsJson as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const expanded = new Set<string>();
  for (const id of arr) {
    const alias = LEGACY_PERMISSION_ALIASES[id];
    if (alias) alias.forEach((a) => expanded.add(a));
    else expanded.add(id);
  }
  return ALL_PERMISSION_IDS.filter((id) => expanded.has(id));
}

async function freezeExistingMembers(workspaceId: string): Promise<void> {
  const matrix = DEFAULT_ROLE_PERMISSIONS;
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { id: true, role: true, permissions: true },
  });

  for (const member of members) {
    const role = KNOWN_ROLES.has(member.role) ? member.role : "STAFF";
    const overrides = deltaOverrides(role, legacyEffective(role, member.permissions), matrix);
    const resolved = resolveEffectivePermissions(role, matrix, overrides);
    await prisma.workspaceMember.update({
      where: { id: member.id },
      data: {
        ...(role !== member.role ? { role } : {}),
        permissionOverrides: asJson(overrides),
        permissions: asJson(resolved),
      },
    });
  }
}

/** Overrides that make resolveEffectivePermissions(role, matrix, …) equal `target`. */
function deltaOverrides(role: string, target: string[], matrix: RoleMatrix): PermissionOverrides {
  if (isSuperAdmin(role)) return { grant: [], revoke: [] };
  const base = new Set(matrix[role as ConfigurableRoleId] ?? []);
  const want = new Set(target.filter(isValidPermissionId));
  const grant = [...want].filter((id) => !base.has(id));
  const revoke = [...base].filter((id) => !want.has(id));
  return { grant, revoke };
}
