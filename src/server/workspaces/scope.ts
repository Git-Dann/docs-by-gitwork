/**
 * Which workspace a request may read or write (docs/multi-tenant-roadmap.md, Phase 2.2b).
 *
 * Routes used to look rows up in Gitwork's workspace (`ensureBaseRecords()`) whoever was
 * asking, so a member of another business reached Gitwork's clients by slug. Each lookup now
 * carries the caller's own workspace, and a row elsewhere reads as "not found".
 *
 * The workspace is the one the server already serves the caller (`requireAuthedUser`), not the
 * token's claim, so for Gitwork every row that matched before still matches.
 */

import type { EffectiveUser } from "@/server/auth/effective-user";
import { getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { ensureBaseRecords } from "@/server/bootstrap";

/**
 * The caller's workspace. A null caller is the workspace API key, which belongs to Gitwork
 * today, so it falls back to Gitwork's workspace exactly as these routes always behaved.
 * Per-workspace API keys (Phase 2) replace this fallback.
 */
export async function requestWorkspaceId(user: Pick<EffectiveUser, "workspaceId"> | null): Promise<string> {
  if (user) return user.workspaceId;
  return (await ensureBaseRecords()).workspace.id;
}

/** `requestWorkspaceId` for a route that hasn't resolved its caller yet. */
export async function workspaceIdForRequest(req: Request): Promise<string> {
  return requestWorkspaceId(await getEffectiveUserOrNull(req));
}

/**
 * The caller's workspace and who to credit for what they do. A signed-in caller is credited
 * by name; the workspace API key (no user) is credited to the workspace owner, as these routes
 * always were.
 */
export async function requestActor(
  req: Request,
): Promise<{ workspace: { id: string }; user: { name: string | null; email: string } }> {
  const caller = await getEffectiveUserOrNull(req);
  if (caller) return { workspace: { id: caller.workspaceId }, user: { name: caller.name, email: caller.email } };
  const base = await ensureBaseRecords();
  return { workspace: { id: base.workspace.id }, user: { name: base.user.name, email: base.user.email } };
}
