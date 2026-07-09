// Per-user MCP self-service endpoint.
//   GET → { setup, connections }
// Returns the user's own active connections plus the copy-paste snippets they
// need to wire Foundry into Claude. The route derives origin from the
// request's Host header (see src/lib/request-origin.ts) so dev / preview /
// prod all return correct URLs without an env-var dance.

import { apiOk, fromError } from "@/lib/api-response";
import { originFrom } from "@/lib/request-origin";
import { requireAuthedUser, assertCan, canConnectMcp } from "@/server/auth/effective-user";
import {
  buildSetupContext,
  getMcpAdminState,
  listOwnConnections,
} from "@/server/mcp/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    // Gated on the mcp.connect permission — Admins/Super Admins hold it by
    // default; Staff/Developers can be granted it via the matrix. Same gate the
    // OAuth consent + authorize flow enforces, and the settings-shell nav.
    assertCan(user, canConnectMcp, "connect Claude (MCP)");
    const { enabled } = await getMcpAdminState();
    const origin = originFrom(req);
    const setup = buildSetupContext(origin, enabled);
    const connections = await listOwnConnections(user);
    return apiOk({ setup, connections });
  } catch (e) {
    return fromError(e);
  }
}
