/**
 * GET /api/platform/workspace-shadow — Phase 2 shadow-mode counts for this server process:
 * how many requests carried a workspace in their token, and how many named a different
 * one from the workspace they were actually served. Platform admins only. Ids only, no
 * names or content. Counts reset on every deploy.
 */

import { apiOk, fromError } from "@/lib/api-response";
import { requirePlatformAdmin } from "@/server/platform/admin";
import { workspaceShadowStats } from "@/server/auth/request-workspace";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    return apiOk(workspaceShadowStats());
  } catch (error) {
    return fromError(error);
  }
}
