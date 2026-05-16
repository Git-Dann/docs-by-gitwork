import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPulseScan, cancelPulseScan } from "@/server/pulse";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const scan = await getPulseScan(scanId);
    if (!scan) return apiError("Scan not found.", 404);
    if (scan.status !== "RUNNING") return apiError("Scan is not running.", 400);
    await cancelPulseScan(scanId);
    return apiOk({ cancelled: true });
  } catch (error) {
    return fromError(error);
  }
}
