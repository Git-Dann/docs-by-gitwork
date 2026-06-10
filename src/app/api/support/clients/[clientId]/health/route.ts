import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getClientHealthScore } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const health = await getClientHealthScore(clientId);
    return apiOk({ health });
  } catch (error) {
    return fromError(error);
  }
}
