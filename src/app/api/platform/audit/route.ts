/** GET /api/platform/audit — the latest platform actions across every business. Platform admins only. */

import { apiOk, fromError } from "@/lib/api-response";
import { requirePlatformAdmin } from "@/server/platform/admin";
import { listPlatformAudit } from "@/server/platform/workspaces";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    return apiOk({ entries: await listPlatformAudit() });
  } catch (error) {
    return fromError(error);
  }
}
