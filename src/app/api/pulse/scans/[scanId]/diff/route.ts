import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getScanDiff, requireScanAccess } from "@/server/pulse";

export const dynamic = "force-dynamic";

/**
 * GET /api/pulse/scans/[scanId]/diff[?against=<scanId>] — what changed against the previous
 * scan of the same target, or against any chosen scan. Both scans pass the access check:
 * comparing against a scan you cannot see would disclose its findings.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    await requireScanAccess(request, scanId);
    const against = request.nextUrl.searchParams.get("against");
    if (against) await requireScanAccess(request, against);
    const diff = await getScanDiff(scanId, against);
    return apiOk({ diff });
  } catch (error) {
    return fromError(error);
  }
}
