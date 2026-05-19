import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPulseScan, deletePulseScan } from "@/server/pulse";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const scan = await getPulseScan(scanId);
    if (!scan) {
      return apiError("Scan not found.", 404);
    }
    return apiOk({ scan });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const scan = await getPulseScan(scanId);
    if (!scan) {
      return apiError("Scan not found.", 404);
    }
    await deletePulseScan(scanId);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
