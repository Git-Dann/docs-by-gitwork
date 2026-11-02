/**
 * Which workspace a Docs request may read or write (docs/multi-tenant-roadmap.md, Phase 2.2b).
 *
 * Every Docs route used to find a document or template by `id` alone, so a member of one
 * business could open, edit, share or delete another business's document by guessing its id.
 * Each lookup now carries the caller's workspace, and a row in another workspace reads as
 * "not found" (404), exactly like an id that doesn't exist.
 *
 * The workspace is the one the server already serves the caller (`requireAuthedUser`), not the
 * token's claim, so for Gitwork every row that matched before still matches.
 */

import type { Prisma } from "@prisma/client";
import type { EffectiveUser } from "@/server/auth/effective-user";
import { ensureBaseRecords } from "@/server/bootstrap";

/**
 * The caller's workspace. A null caller is the workspace API key, which belongs to Gitwork
 * today, so it falls back to Gitwork's workspace exactly as these routes always behaved.
 * Per-workspace API keys (Phase 2) replace this fallback.
 */
export async function docsWorkspaceId(user: Pick<EffectiveUser, "workspaceId"> | null): Promise<string> {
  if (user) return user.workspaceId;
  return (await ensureBaseRecords()).workspace.id;
}

/** Templates a workspace can see: its own, plus Foundry's stock templates (workspaceId null). */
export function templateVisibleWhere(workspaceId: string): Prisma.DocumentTemplateWhereInput {
  return { OR: [{ workspaceId }, { workspaceId: null }] };
}
