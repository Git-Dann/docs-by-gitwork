import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getScanHistory, requireScanAccess } from "@/server/pulse";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    await requireScanAccess(request, scanId);
    const history = await getScanHistory(scanId);
    return apiOk({ history });
  } catch (error) {
    return fromError(error);
  }
}
