import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { updateConnection, deleteConnection } from "@/server/support";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; connId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care connections");
    const { connId } = await params;
    const body = await request.json();
    const connection = await updateConnection(connId, body);
    return apiOk({ connection });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; connId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care connections");
    const { connId } = await params;
    await deleteConnection(connId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
