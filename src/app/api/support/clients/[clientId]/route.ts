import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull, requireAuthedUser } from "@/server/auth/effective-user";
import { getSupportClient, updateSupportClient, deleteSupportClient } from "@/server/support";
import { requireSupportClient, requireWorkspaceClientInWorkspace } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const user = await requireAuthedUser(request);
    const { clientId } = await params;
    await requireSupportClient(request, clientId);
    const client = await getSupportClient(clientId, user);
    return apiOk({ client });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care clients");
    const { clientId } = await params;
    const workspaceId = await requireSupportClient(request, clientId);
    const body = await request.json();
    if (typeof body?.workspaceClientId === "string" && body.workspaceClientId) {
      await requireWorkspaceClientInWorkspace(body.workspaceClientId, workspaceId);
    }
    const client = await updateSupportClient(clientId, body);
    return apiOk({ client });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care clients");
    const { clientId } = await params;
    await requireSupportClient(request, clientId);
    await deleteSupportClient(clientId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
