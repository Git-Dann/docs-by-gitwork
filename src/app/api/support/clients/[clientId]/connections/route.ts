import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listConnections, createConnection } from "@/server/support";
import { requireSupportClient } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    await requireSupportClient(request, clientId);
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
    const { clientId } = await params;
    await requireSupportClient(request, clientId, "manage");
    const body = await request.json();
    const connection = await createConnection(clientId, body);
    return apiOk({ connection }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
