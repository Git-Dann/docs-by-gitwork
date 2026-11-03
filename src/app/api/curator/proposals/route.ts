import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { applyProposal, dismissProposal } from "@/server/curator/apply";
import { curatorProposalActionSchema } from "@/server/validators";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

/** Apply or dismiss an LLM proposal. Body: { runId, proposalId, action }. */
export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "act on curator proposals");
    const body = await request.json();
    const { runId, proposalId, action } = curatorProposalActionSchema.parse(body);
    const workspaceId = await workspaceIdForRequest(request);
    const outcome =
      action === "apply"
        ? await applyProposal(workspaceId, runId, proposalId)
        : await dismissProposal(workspaceId, runId, proposalId);
    if (!outcome.ok) return apiError(outcome.reason ?? "Could not process proposal", 400);
    return apiOk({ proposal: outcome.proposal });
  } catch (error) {
    return fromError(error);
  }
}
