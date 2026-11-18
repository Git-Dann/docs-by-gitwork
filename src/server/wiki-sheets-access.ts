/**
 * The team-side gate for a client's wiki settings: a permission AND access to THIS client.
 *
 * Written for Sheets (CLAUDE.md §73); Sheets is retired (§127) but this resolver is kept under
 * its old name because the Board's settings route and the sheets-to-board move use it.
 */

import { prisma } from "@/lib/prisma";
import { requestWorkspaceId } from "@/server/workspaces/scope";
import { assertClientAccessBySlug } from "@/server/client-assignments";
import {
  ForbiddenError,
  assertCan,
  canManageClients,
  getEffectiveUserOrNull,
  type EffectiveUser,
} from "@/server/auth/effective-user";
import { isAtLeast } from "@/types/auth";

/** Who made a change from the team side, as it is recorded. */
export interface SheetActor {
  kind: "TEAM";
  name: string;
  userId: string | null;
}

/**
 * What an internal request changes, which decides who may make it:
 *  - "rows":      day-to-day work. Anyone on the team (Developer and up) with access to THIS
 *                 client.
 *  - "structure": settings and anything that reshapes the client's wiki. 'Manage clients'.
 */
export type SheetScope = "rows" | "structure";

/**
 * The scope's permission AND access to THIS client (a developer scoped to other clients gets
 * 403, §71). Returns the client id and the team actor. An API-key caller (null user) is
 * trusted, as everywhere else, and is named "Gitwork".
 *
 * ⚠️ A client GUEST never passes.
 */
export async function resolveInternalSheets(
  req: Request,
  slug: string,
  action: string,
  scope: SheetScope = "structure",
): Promise<{ clientId: string | null; actor: SheetActor; user: EffectiveUser | null }> {
  const user = await getEffectiveUserOrNull(req);
  if (scope === "rows") {
    if (user && !isAtLeast(user.role, "DEVELOPER")) {
      throw new ForbiddenError(`You don't have permission to ${action}.`);
    }
  } else {
    assertCan(user, canManageClients, action);
  }
  await assertClientAccessBySlug(user, slug);
  const client = await prisma.workspaceClient.findUnique({
    where: { workspaceId_slug: { workspaceId: await requestWorkspaceId(user), slug } },
    select: { id: true },
  });
  return {
    clientId: client?.id ?? null,
    user,
    actor: { kind: "TEAM", name: user?.name?.trim() || user?.email || "Gitwork", userId: user?.id ?? null },
  };
}
