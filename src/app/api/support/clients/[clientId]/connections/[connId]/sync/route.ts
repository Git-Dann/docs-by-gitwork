import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { buildSyncContext, syncConnection } from "@/server/support-sync";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string; connId: string }> },
) {
  try {
    const { connId } = await params;
    const ctx = await buildSyncContext(connId);
    const result = await syncConnection(ctx);
    return apiOk(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("coming soon")) {
      return apiError(error.message, 400);
    }
    return fromError(error);
  }
}
