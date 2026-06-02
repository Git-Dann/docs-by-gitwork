import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listConnections, createConnection } from "@/server/support";
import { assertCan, canManageSupport, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const connections = await listConnections(clientId);
    return apiOk({ connections });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageSupport, "manage Care connections");
    const { clientId } = await params;
    const body = await request.json();
    const connection = await createConnection(clientId, body);
    return apiOk({ connection }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
