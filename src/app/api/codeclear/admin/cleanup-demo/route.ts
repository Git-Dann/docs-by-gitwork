import { auth } from "@/auth";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { applyDemoCleanup, previewDemoCleanup } from "@/server/demo-cleanup";
import { isAtLeast } from "@/types/auth";

export const dynamic = "force-dynamic";

async function requireAdminSession() {
  const session = await auth();
  if (!session?.user) return null;
  if (!isAtLeast(session.user.role, "ADMIN")) return null;
  return session;
}

/**
 * GET /api/codeclear/admin/cleanup-demo
 *
 * Returns a dry-run preview of the demo-data cleanup: lists the exact
 * candidates and rate-card people that would be deleted. Admin only.
 */
export async function GET() {
  try {
    const session = await requireAdminSession();
    if (!session) return apiError("Forbidden", 403);

    const { workspace } = await ensureBaseRecords();
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
export async function POST() {
  try {
    const session = await requireAdminSession();
    if (!session) return apiError("Forbidden", 403);

    const { workspace } = await ensureBaseRecords();
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
