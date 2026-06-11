// Self-revoke for the signed-in user's MCP connections.
//   DELETE /api/me/mcp/connections/:id

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { revokeOwnConnection } from "@/server/mcp/admin";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    await revokeOwnConnection(user, id);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
