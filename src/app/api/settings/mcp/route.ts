// Workspace-level MCP admin endpoint (Super Admin only).
//   GET   → { state, connections }
//   PATCH → { enabled: boolean }  → toggles the workspace mcpEnabled flag

import { z } from "zod";
import { apiOk, fromError } from "@/lib/api-response";
import { requireAuthedUser } from "@/server/auth/effective-user";
import {
  getMcpAdminState,
  listConnectionsForWorkspace,
  setMcpEnabled,
} from "@/server/mcp/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const state = await getMcpAdminState();
    const connections = await listConnectionsForWorkspace(user);
    return apiOk({ state, connections });
  } catch (e) {
    return fromError(e);
  }
}

const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(req: Request) {
  try {
    const user = await requireAuthedUser(req);
    const body = patchSchema.parse(await req.json());
    const state = await setMcpEnabled(user, body.enabled);
    return apiOk({ state });
  } catch (e) {
    return fromError(e);
  }
}
