import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { requireAuthedUser } from "@/server/auth/effective-user";

/**
 * GET /api/account/workspaces — the businesses this person is an active member of, for the
 * workspace switcher. Switching itself is `useSession().update({ workspaceId })`, which the
 * jwt callback re-checks (src/auth.ts).
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    const rows = await prisma.workspaceMember.findMany({
      where: { userId: user.id, ...ACTIVE_MEMBER },
      select: { workspaceId: true, workspace: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return apiOk({
      workspaces: rows.map((r) => ({ id: r.workspaceId, name: r.workspace.name, current: r.workspaceId === user.workspaceId })),
    });
  } catch (error) {
    return fromError(error);
  }
}
