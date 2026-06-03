/**
 * DELETE /api/snippets/[id] — remove a saved snippet (gated by docs.manage, workspace-scoped).
 */

import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageDocs, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { deleteSnippet } from "@/server/snippets";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageDocs, "delete snippets");
    const workspaceId = user?.workspaceId ?? (await ensureBaseRecords()).workspace.id;
    const { id } = await context.params;
    await deleteSnippet(workspaceId, id);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
