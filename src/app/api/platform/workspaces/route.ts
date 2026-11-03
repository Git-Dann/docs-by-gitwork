/**
 * GET /api/platform/workspaces — one page of businesses on Foundry. Platform admins only.
 * Query: q, page (0-based), pageSize (≤50), sort (name|created|members), dir, modules
 * (any|every|chosen), ai (any|gitwork|own). A bad value is a 400 naming it.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { parsePlatformWorkspaceQuery } from "@/lib/platform-rules";
import { requirePlatformAdmin } from "@/server/platform/admin";
import { listPlatformWorkspaces } from "@/server/platform/workspaces";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const query = parsePlatformWorkspaceQuery(new URL(request.url).searchParams);
    return apiOk(await listPlatformWorkspaces(query));
  } catch (error) {
    return fromError(error);
  }
}
