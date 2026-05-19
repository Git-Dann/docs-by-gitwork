import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { updateConnection, deleteConnection } from "@/server/support";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; connId: string }> },
) {
  try {
    const { connId } = await params;
    const body = await request.json();
    const connection = await updateConnection(connId, body);
    return apiOk({ connection });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string; connId: string }> },
) {
  try {
    const { connId } = await params;
    await deleteConnection(connId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
