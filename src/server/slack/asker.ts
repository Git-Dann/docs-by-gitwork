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

/** Why a Slack account couldn't be matched to a Foundry member, said to the person in plain words. */
export type AskerProblem =
  | { kind: "slack_error"; error: string; needed?: string }
  | { kind: "no_email" }
  | { kind: "no_member"; email: string }
  | { kind: "not_active"; email: string };

export async function resolveSlackAskerDetailed(
  botToken: string,
  workspaceId: string,
  slackUserId: string | null | undefined,
): Promise<{ user: EffectiveUser } | { problem: AskerProblem }> {
  if (!slackUserId) return { problem: { kind: "slack_error", error: "no_user_on_event" } };
  try {
    const info = await usersInfo(botToken, slackUserId);
    if (!info.ok) {
      const needed = (info.data as { needed?: unknown }).needed;
      return { problem: { kind: "slack_error", error: info.error ?? "unknown", ...(typeof needed === "string" ? { needed } : {}) } };
    }
    const email = info.data.user?.profile?.email;
    if (!email) return { problem: { kind: "no_email" } };
    const user = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        memberships: { some: { workspaceId } },
      },
      select: { id: true },
    });
    if (!user) return { problem: { kind: "no_member", email } };
    // Loaded lazily so the pure Slack triage helpers stay importable without the auth stack.
    const { resolveEffectiveUserById } = await import("@/server/mcp/auth");
    const effective = await resolveEffectiveUserById(user.id, workspaceId, { onlyThisWorkspace: true });
    return effective ? { user: effective } : { problem: { kind: "not_active", email } };
  } catch (err) {
    return { problem: { kind: "slack_error", error: err instanceof Error ? err.message.slice(0, 120) : "lookup_failed" } };
  }
}

/** The plain-English reply for each problem (what Dispatch says in Slack). */
export function askerProblemMessage(p: AskerProblem): string {
  switch (p.kind) {
    case "no_email":
      return "Slack didn't give Foundry your email address, so I can't tell which Foundry account is yours. A Slack admin needs to give the Foundry app the users:read.email permission and reinstall it.";
    case "no_member":
      return `I couldn't find a Foundry account for ${p.email}. Check that's the email you sign in to Foundry with.`;
    case "not_active":
      return `The Foundry account for ${p.email} isn't active, so I can't answer for it.`;
    case "slack_error":
      return p.error === "missing_scope"
        ? `The Foundry Slack app is missing a permission${p.needed ? ` (${p.needed})` : ""}. A Slack admin needs to add it and reinstall the app.`
        : `Slack wouldn't tell me who you are (${p.error}), so I can't answer. It's logged in Foundry.`;
  }
}

export async function resolveSlackAsker(
  botToken: string,
  workspaceId: string,
  slackUserId: string | null | undefined,
): Promise<EffectiveUser | null> {
  const out = await resolveSlackAskerDetailed(botToken, workspaceId, slackUserId);
  return "user" in out ? out.user : null;
}
