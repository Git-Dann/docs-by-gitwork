/**
 * Slack user → the Foundry member, with their live role and permissions in THIS workspace.
 * Matched by the Slack profile email. An archived member, someone from another workspace, or a
 * failed lookup all come back null, and Dispatch then refuses rather than acting as nobody.
 *
 * Used for questions (events.ts) and for Confirm/Cancel presses (interactions.ts): a button press
 * is only ever honoured for the Foundry member the Slack account resolves to.
 */

import { prisma } from "@/lib/prisma";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { usersInfo } from "./client";

export async function resolveSlackAsker(
  botToken: string,
  workspaceId: string,
  slackUserId: string | null | undefined,
): Promise<EffectiveUser | null> {
  if (!slackUserId) return null;
  try {
    const info = await usersInfo(botToken, slackUserId);
    const email = info.data.user?.profile?.email;
    if (!email) return null;
    const user = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        memberships: { some: { workspaceId } },
      },
      select: { id: true },
    });
    if (!user) return null;
    // Loaded lazily so the pure Slack triage helpers stay importable without the auth stack.
    const { resolveEffectiveUserById } = await import("@/server/mcp/auth");
    return await resolveEffectiveUserById(user.id, workspaceId, { onlyThisWorkspace: true });
  } catch {
    return null;
  }
}
