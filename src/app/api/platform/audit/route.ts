/**
 * GET /api/platform/audit — platform actions, newest first, one page at a time.
 * Optional workspaceId narrows it to one business. Platform admins only.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { parsePlatformAuditQuery } from "@/lib/platform-rules";
import { requirePlatformAdmin } from "@/server/platform/admin";
import { listPlatformAudit } from "@/server/platform/workspaces";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    return apiOk(await listPlatformAudit(parsePlatformAuditQuery(new URL(request.url).searchParams)));
  } catch (error) {
    return fromError(error);
  }
}
