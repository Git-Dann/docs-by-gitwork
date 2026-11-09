import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getClientHealthScore } from "@/server/support";
import { requireSupportClient } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    await requireSupportClient(request, clientId);
    const health = await getClientHealthScore(clientId);
    return apiOk({ health });
  } catch (error) {
    return fromError(error);
  }
}
