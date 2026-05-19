import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listAuditLogs } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const logs = await listAuditLogs(clientId);
    return apiOk({ logs });
  } catch (error) {
    return fromError(error);
  }
}
