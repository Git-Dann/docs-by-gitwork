/** GET /api/platform/workspaces — every business on Foundry. Platform admins only. */

import { apiOk, fromError } from "@/lib/api-response";
import { requirePlatformAdmin } from "@/server/platform/admin";
import { listPlatformWorkspaces } from "@/server/platform/workspaces";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    return apiOk({ workspaces: await listPlatformWorkspaces() });
  } catch (error) {
    return fromError(error);
  }
}
