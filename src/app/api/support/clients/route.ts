import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull, requireAuthedUser } from "@/server/auth/effective-user";
import { listSupportClients, createSupportClient, seedDefaultWorkflowRules } from "@/server/support";
import { supportClientCreateSchema } from "@/server/validators";
import { requestWorkspaceId } from "@/server/workspaces/scope";
import { requireWorkspaceClientInWorkspace } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthedUser(request);
    const clients = await listSupportClients(user.workspaceId, user);
    return apiOk({ clients });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageSupport, "manage Care clients");
    const workspaceId = await requestWorkspaceId(user);
    const body = supportClientCreateSchema.parse(await request.json());
    if (body.workspaceClientId) await requireWorkspaceClientInWorkspace(body.workspaceClientId, workspaceId);
    const client = await createSupportClient(workspaceId, body);
    await seedDefaultWorkflowRules(client.id);
    return apiOk({ client }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
