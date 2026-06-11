// Super Admin revoke for any user's MCP connection.
//   DELETE /api/settings/mcp/connections/:id

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import { revokeConnectionByAdmin } from "@/server/mcp/admin";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(req);
    const { id } = await params;
    await revokeConnectionByAdmin(user, id);
    return apiOk({ ok: true });
  } catch (e) {
    return fromError(e);
  }
}
