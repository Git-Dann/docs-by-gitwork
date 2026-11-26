/**
 * Who is asking, about which client, and what they may see. Built once per question and
 * re-checked on every tool call, so access removed mid-chat takes effect at once.
 *
 * ⚠️ `user` is never null. The older client-access helpers treat a null user as the trusted
 * workspace API key and let it through; Dispatch always acts as a real person.
 */

import { prisma } from "@/lib/prisma";
import {
  canViewClientFinancials,
  canViewCosts,
  canViewRates,
  type EffectiveUser,
} from "@/server/auth/effective-user";
import { ForbiddenError } from "@/server/auth/effective-user";
import { isAtLeast, isSuperAdmin } from "@/types/auth";
import { documentTypesFor } from "@/server/dispatch/access";
import { allowedDocTypes } from "@/lib/templates";

export interface DispatchScope {
  user: EffectiveUser;
  client: { id: string; name: string; slug: string };
  surface: "web" | "slack";
  /** Costs, prices, rates or client financials: any one of them is enough to see figures. */
  canSeeMoney: boolean;
  /** Admins see Foreman's delivery findings; everyone else sees the work itself. */
  isAdmin: boolean;
  documentTypes: ReturnType<typeof documentTypesFor>;
  /** The asker's IANA timezone (§174), set by the loop; tools that show times use it. */
  timeZone?: string;
  /** Answering in a Slack channel (forChannel): the chat stays on the channel's client. */
  inChannel?: boolean;
}

export class DispatchAccessError extends ForbiddenError {}

/** May this person use Dispatch at all? The permission plus Portal (Dispatch reads Portal data). */
export function canUseDispatch(user: EffectiveUser): boolean {
  if (isSuperAdmin(user.role)) return true;
  return user.permissions.includes("dispatch.use") && user.permissions.includes("clients");
}

export async function openScope(
  user: EffectiveUser,
  client: { id?: string; slug?: string },
  surface: DispatchScope["surface"],
): Promise<DispatchScope> {
  if (!canUseDispatch(user)) throw new DispatchAccessError("Dispatch isn't switched on for your account.");
  const row = await prisma.workspaceClient.findFirst({
    where: { workspaceId: user.workspaceId, ...(client.id ? { id: client.id } : { slug: client.slug ?? "" }) },
    select: { id: true, name: true, slug: true },
  });
  if (!row) throw new DispatchAccessError("I can't find that client.");
  await assertStillAllowed(user, row.id);
  return {
    user,
    client: row,
    surface,
    canSeeMoney: canViewCosts(user) || canViewRates(user) || canViewClientFinancials(user),
    isAdmin: isAtLeast(user.role, "ADMIN"),
    documentTypes: documentTypesFor(user),
  };
}

/**
 * The scope for an answer posted in a Slack CHANNEL rather than to one person. Everyone in the
 * channel reads it, and they may not share the asker's access, so the answer gets the narrowest
 * view: no figures, and only the document types every developer may see.
 */
export function forChannel(scope: DispatchScope): DispatchScope {
  return { ...scope, canSeeMoney: false, documentTypes: allowedDocTypes(false), inChannel: true };
}

/** Throws unless this person can still open this client. Called before every tool runs. */
export async function assertStillAllowed(user: EffectiveUser, clientId: string): Promise<void> {
  const { assertClientInScope } = await import("@/server/tasks");
  try {
    await assertClientInScope(user, clientId);
  } catch {
    throw new DispatchAccessError("You don't have access to this client any more.");
  }
}
