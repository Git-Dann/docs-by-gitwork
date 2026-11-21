import { apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, requireAuthedUser } from "@/server/auth/effective-user";
import { applyDemoCleanup, previewDemoCleanup } from "@/server/demo-cleanup";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

// ⚠️ Admin is read from the DATABASE, not from `session.user.role`. A session carries the
// role it was minted with, so a just-archived or just-demoted admin kept these three
// routes — which delete demo data, rewrite dev groups and bulk-import candidates — until
// their token turned over. §88 replaced that pattern everywhere else; three byte-identical
// copies of the local helper were left behind here.

/**
 * GET /api/codeclear/admin/cleanup-demo
 *
 * Returns a dry-run preview of the demo-data cleanup: lists the exact
 * candidates and rate-card people that would be deleted. Admin only.
 */
export async function GET(request: Request) {
  try {
    assertAtLeastAdmin(await requireAuthedUser(request));

    const workspace = { id: await workspaceIdForRequest(request) };
    const preview = await previewDemoCleanup(workspace.id);

    return apiOk({
      candidates: preview.candidates,
      ratePeople: preview.ratePeople,
      total: preview.candidates.length + preview.ratePeople.length,
    });
  } catch (error) {
    return fromError(error);
  }
}

/**
 * POST /api/codeclear/admin/cleanup-demo
 *
 * Applies the demo-data cleanup. Idempotent — running it again with nothing
 * left to delete just returns zero counts. Admin only.
 */
export async function POST(request: Request) {
  try {
    assertAtLeastAdmin(await requireAuthedUser(request));

    const workspace = { id: await workspaceIdForRequest(request) };
    const result = await applyDemoCleanup(workspace.id);

    return apiOk({
      deletedCandidates: result.deletedCandidates,
      deletedRatePeople: result.deletedRatePeople,
      candidates: result.candidates,
      ratePeople: result.ratePeople,
    });
  } catch (error) {
    return fromError(error);
  }
}
