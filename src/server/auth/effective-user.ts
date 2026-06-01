import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { getRequestUser } from "@/server/auth/request-user";

export type EffectiveUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  permissions: string[];
  workspaceId: string;
  membershipId: string;
};

export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

// Resolve the authenticated user for an API route. Bridges:
//   • Mobile JWT path (headers set by middleware after verifyMobileToken)
//   • Web NextAuth session
//
// Looks up the user's WorkspaceMember for the default workspace so callers
// get role + permissions + workspaceId in one go. Throws UnauthorizedError
// when no identity can be resolved — route handlers catch via fromError.
export async function requireAuthedUser(req: Request): Promise<EffectiveUser> {
  let userIdOrEmail: { id?: string; email?: string } = {};

  const mobileUser = getRequestUser(req);
  if (mobileUser) {
    userIdOrEmail = { id: mobileUser.id, email: mobileUser.email };
  } else {
    const session = await auth();
    const sessionUser = session?.user;
    if (sessionUser?.id || sessionUser?.email) {
      userIdOrEmail = {
        id: sessionUser.id ?? undefined,
        email: sessionUser.email ?? undefined,
      };
    }
  }

  if (!userIdOrEmail.id && !userIdOrEmail.email) {
    throw new UnauthorizedError();
  }

  const dbUser = await prisma.user.findFirst({
    where: userIdOrEmail.id
      ? { id: userIdOrEmail.id }
      : { email: userIdOrEmail.email! },
    include: {
      memberships: {
        where: { workspace: { slug: DEFAULT_WORKSPACE_SLUG } },
        take: 1,
      },
    },
  });

  if (!dbUser || dbUser.memberships.length === 0) {
    throw new UnauthorizedError("No workspace membership");
  }

  const membership = dbUser.memberships[0];
  const permissions = Array.isArray(membership.permissions)
    ? (membership.permissions as string[])
    : [];

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    avatarUrl: dbUser.avatarUrl,
    role: membership.role,
    permissions,
    workspaceId: membership.workspaceId,
    membershipId: membership.id,
  };
}

export function canApproveBackstage(user: EffectiveUser): boolean {
  return user.role === "ADMIN" || user.permissions.includes("backstage.approve");
}

export function assertCanApproveBackstage(user: EffectiveUser): void {
  if (!canApproveBackstage(user)) {
    throw new ForbiddenError("Backstage approval permission required");
  }
}

// Expenses are opt-in per account (decoupled from role): the `backstage.expenses`
// feature flag. Admins bypass (consistent with every other permission check), so
// the flag is the way to grant HR/finance access WITHOUT making them an Admin.
export function canManageExpenses(user: EffectiveUser): boolean {
  return user.role === "ADMIN" || user.permissions.includes("backstage.expenses");
}
