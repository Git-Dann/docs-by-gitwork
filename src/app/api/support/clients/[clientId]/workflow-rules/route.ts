import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listWorkflowRules, createWorkflowRule } from "@/server/support";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const rules = await listWorkflowRules(clientId);
    return apiOk({ rules });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care workflow rules");
    const { clientId } = await params;
    const body = await request.json();
    const rule = await createWorkflowRule(clientId, body);
    return apiOk({ rule }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
