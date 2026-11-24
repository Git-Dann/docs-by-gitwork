/**
 * Who is changing Code Handover, for its history (src/server/wiki-code.ts). A guest account is
 * a client; the workspace API key (no user) is shown as "Foundry API".
 */
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { isExternalRole } from "@/types/auth";
import type { CodeActor } from "@/server/wiki-code";

export async function codeActorFor(req: Request): Promise<CodeActor> {
  const user = await getEffectiveUserOrNull(req);
  if (!user) return { userId: null, name: "Foundry API", isClient: false };
  return { userId: user.id, name: user.name?.trim() || user.email, isClient: isExternalRole(user.role) };
}
