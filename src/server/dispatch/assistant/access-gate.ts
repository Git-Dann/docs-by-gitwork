/**
 * Who may open the Dispatch assistant right now: the person must be allowed (scope.ts), and the
 * workspace must have switched it on (Super Admins can use it before that, to test it).
 */

import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/types/auth";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { resolveDispatchConfig } from "@/server/dispatch/config";
import { canUseDispatch, DispatchAccessError } from "./scope";

export async function assistantAvailable(user: EffectiveUser): Promise<boolean> {
  if (!canUseDispatch(user)) return false;
  if (isSuperAdmin(user.role)) return true;
  const ws = await prisma.workspace.findUnique({ where: { id: user.workspaceId }, select: { dispatchConfig: true } });
  return resolveDispatchConfig(ws?.dispatchConfig).assistantEnabled;
}

export async function assertAssistantAvailable(user: EffectiveUser): Promise<void> {
  if (!(await assistantAvailable(user))) throw new DispatchAccessError("Dispatch isn't switched on for you yet.");
}
