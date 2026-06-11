// Per-user MCP self-service endpoint.
//   GET → { setup, connections }
// Returns the user's own active connections plus the copy-paste snippets they
// need to wire Foundry into Claude. The route derives origin from the request
// so dev / preview / prod all return correct URLs without an env-var dance.

import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser, assertAtLeastAdmin } from "@/server/auth/effective-user";
import {
  buildSetupContext,
  getMcpAdminState,
  listOwnConnections,
} from "@/server/mcp/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    // Restricted to Admin / Super Admin for now (matches the UI gate in the
    // settings shell). Loosen this when STAFF / DEVELOPER should self-connect.
    assertAtLeastAdmin(user);
    const { enabled } = await getMcpAdminState();
    const origin = new URL(req.url).origin;
    const setup = buildSetupContext(origin, enabled);
    const connections = await listOwnConnections(user);
    return apiOk({ setup, connections });
  } catch (e) {
    return fromError(e);
  }
}
