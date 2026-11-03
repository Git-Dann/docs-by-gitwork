import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { requireSupportReportInWorkspace } from "@/server/support-scope";
import { getReport } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> },
) {
  try {
    const { reportId } = await params;
    await requireSupportReportInWorkspace(request, reportId);
    const report = await getReport(reportId);
    if (!report) return apiError("Report not found", 404);
    return apiOk({ report });
  } catch (error) {
    return fromError(error);
  }
}
