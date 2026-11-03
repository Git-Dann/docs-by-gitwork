import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { readSecret } from "@/server/stored-secret";
import { HOME_WORKSPACE_SLUG } from "@/lib/platform-rules";
import { gettingStartedSteps, showGettingStarted, type GettingStartedFacts } from "@/lib/getting-started";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";
import { assertAtLeastAdmin, requireAuthedUser } from "@/server/auth/effective-user";

/** GET /api/workspace/getting-started — the new-business checklist for the caller's workspace. Admins. */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    assertAtLeastAdmin(user);
    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: user.workspaceId },
      select: { slug: true, branding: true, anthropicApiKey: true, openaiApiKey: true, geminiApiKey: true },
    });
    const [otherPeople, pendingInvites, clients] = await Promise.all([
      prisma.workspaceMember.count({ where: { workspaceId: user.workspaceId, userId: { not: user.id }, ...ACTIVE_MEMBER } }),
      prisma.workspaceInvite.count({ where: { workspaceId: user.workspaceId, status: "PENDING" } }),
      prisma.workspaceClient.count({ where: { workspaceId: user.workspaceId } }),
    ]);
    const branding = (ws.branding ?? {}) as { brandLogoUrl?: unknown };
    const facts: GettingStartedFacts = {
      isHome: ws.slug === HOME_WORKSPACE_SLUG,
      hasLogo: typeof branding.brandLogoUrl === "string" && branding.brandLogoUrl.length > 0,
      otherPeople,
      pendingInvites,
      hasAiKey: Boolean(readSecret(ws.anthropicApiKey) || readSecret(ws.openaiApiKey) || readSecret(ws.geminiApiKey)),
      clients,
    };
    return apiOk({ show: showGettingStarted(facts), steps: gettingStartedSteps(facts) });
  } catch (error) {
    return fromError(error);
  }
}
