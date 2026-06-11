// Self-revoke for the signed-in user's MCP connections.
//   DELETE /api/me/mcp/connections/:id

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser, assertAtLeastAdmin } from "@/server/auth/effective-user";
import { revokeOwnConnection } from "@/server/mcp/admin";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    // Matches the page-level Admin+ gate. A user can only revoke their own
    // connection anyway (revokeOwnConnection enforces that), but we gate at
    // the route too so a Staff user can't reach the surface at all for now.
    assertAtLeastAdmin(user);
    const { id } = await params;
    await revokeOwnConnection(user, id);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
