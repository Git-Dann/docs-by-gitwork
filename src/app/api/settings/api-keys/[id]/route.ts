import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { presentsApiKey } from "@/lib/api-key-token";
import { assertAtLeastAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { revokeApiKey } from "@/server/api-keys";
import { recordAuditEntry } from "@/server/audit-log";

export const dynamic = "force-dynamic";

/** Revoke one of this workspace's keys. Another workspace's id reads as not found. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (presentsApiKey(request)) return apiError("API keys are revoked by a person, not by another key.", 403);
    const user = await requireAuthedUser(request);
    assertAtLeastAdmin(user);
    const { id } = await params;
    if (!(await revokeApiKey(user.workspaceId, id))) return apiError("Key not found.", 404);
    recordAuditEntry({ workspaceId: user.workspaceId, actorId: user.id, action: "api_key.revoked", target: `workspaceApiKey.${id}` });
    return apiOk({ revoked: true });
  } catch (error) {
    return fromError(error);
  }
}
