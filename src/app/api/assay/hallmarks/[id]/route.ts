import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertCan, canIssueHallmark, requireAuthedUser } from "@/server/auth/effective-user";
import { getHallmark, revokeHallmark } from "@/server/assay/issue";
import { hallmarkRevokeSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    const hallmark = await getHallmark(user.workspaceId, id);
    if (!hallmark) return apiError("Hallmark not found", 404);
    return apiOk({ hallmark });
  } catch (error) {
    return fromError(error);
  }
}

/**
 * Withdraw a hallmark. PATCH, not DELETE, and that is deliberate: a revoked mark must stay
 * publicly resolvable and report REVOKED. Deleting the row would make the certificate URL
 * 404, which reads to whoever holds it as a broken link rather than as a withdrawal — so
 * the one thing revocation exists to communicate would be the one thing it fails to say.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canIssueHallmark, "revoke hallmarks");
    const { id } = await params;
    const { reason } = hallmarkRevokeSchema.parse(await request.json());
    const hallmark = await revokeHallmark({
      workspaceId: user.workspaceId,
      id,
      reason,
      byName: user.name?.trim() || user.email,
    });
    return apiOk({ hallmark });
  } catch (error) {
    return fromError(error);
  }
}
