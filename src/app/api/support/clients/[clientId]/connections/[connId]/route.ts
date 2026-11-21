import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { updateConnection, deleteConnection } from "@/server/support";
import { requireSupportClient, requireSupportRow } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; connId: string }> },
) {
  try {
    const { clientId, connId } = await params;
    await requireSupportClient(request, clientId, "manage");
    await requireSupportRow("connection", connId, clientId);
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
    const { clientId, connId } = await params;
    await requireSupportClient(request, clientId, "manage");
    await requireSupportRow("connection", connId, clientId);
    await deleteConnection(connId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
