import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { updateWorkflowRule, deleteWorkflowRule } from "@/server/support";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; ruleId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care workflow rules");
    const { ruleId } = await params;
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
    const { ruleId } = await params;
    await deleteWorkflowRule(ruleId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
