import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { updateWorkflowRule, deleteWorkflowRule } from "@/server/support";
import { requireSupportClient, requireSupportRow } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; ruleId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care workflow rules");
    const { clientId, ruleId } = await params;
    await requireSupportClient(request, clientId);
    await requireSupportRow("workflowRule", ruleId, clientId);
    const body = await request.json();
    const rule = await updateWorkflowRule(ruleId, body);
    return apiOk({ rule });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; ruleId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care workflow rules");
    const { clientId, ruleId } = await params;
    await requireSupportClient(request, clientId);
    await requireSupportRow("workflowRule", ruleId, clientId);
    await deleteWorkflowRule(ruleId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
