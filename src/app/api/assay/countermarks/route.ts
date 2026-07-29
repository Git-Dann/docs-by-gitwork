import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canIssueCountermark, requireAuthedUser } from "@/server/auth/effective-user";
import { issueCountermark, listCountermarks } from "@/server/assay/issue";
import { canSeal } from "@/server/assay/digest";
import { countermarkIssueSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

/** List the workspace's countermarks, newest first. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    const countermarks = await listCountermarks(user.workspaceId);
    // Surfaced so the UI can warn BEFORE issuing that marks will come out unsealed, rather
    // than after the fact on a certificate someone has already sent to a client.
    return apiOk({ countermarks, sealingConfigured: canSeal() });
  } catch (error) {
    return fromError(error);
  }
}

/**
 * Issue a countermark from a completed Pulse scan.
 *
 * Gated on `assay.issue`, not on the `assay` module: reading the register is a different
 * act from certifying, so holding the module alone leaves Assay read-only.
 *
 * `requireAuthedUser` rather than the OrDefault variant, deliberately — that helper falls
 * back to the default workspace owner, so an identity-less caller would issue a certificate
 * in a Super Admin's name. Here that is not merely a privilege bug, it is a forged
 * signature on an artifact a third party relies on.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    assertCan(user, canIssueCountermark, "issue countermarks");
    const { scanId, standardId } = countermarkIssueSchema.parse(await request.json());
    const countermark = await issueCountermark({
      workspaceId: user.workspaceId,
      scanId,
      standardId,
      // `|| email` not `?? email`: a member with a blank name would otherwise put an empty
      // issuer on the certificate, and the issuer is the whole basis for relying on it.
      issuerName: user.name?.trim() || user.email,
    });
    return apiOk({ countermark, sealingConfigured: canSeal() }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
