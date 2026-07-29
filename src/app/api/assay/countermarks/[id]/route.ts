import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { assertCan, canIssueCountermark, requireAuthedUser } from "@/server/auth/effective-user";
import { getCountermark, revokeCountermark } from "@/server/assay/issue";
import { countermarkRevokeSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    const { id } = await params;
    const countermark = await getCountermark(user.workspaceId, id);
    if (!countermark) return apiError("Countermark not found", 404);
    return apiOk({ countermark });
  } catch (error) {
    return fromError(error);
  }
}

/**
 * Withdraw a countermark. PATCH, not DELETE, and that is deliberate: a revoked mark must stay
 * publicly resolvable and report REVOKED. Deleting the row would make the certificate URL
 * 404, which reads to whoever holds it as a broken link rather than as a withdrawal — so
 * the one thing revocation exists to communicate would be the one thing it fails to say.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canIssueCountermark, "revoke countermarks");
    const { id } = await params;
    const { reason } = countermarkRevokeSchema.parse(await request.json());
    const countermark = await revokeCountermark({
      workspaceId: user.workspaceId,
      id,
      reason,
      byName: user.name?.trim() || user.email,
    });
    return apiOk({ countermark });
  } catch (error) {
    return fromError(error);
  }
}
