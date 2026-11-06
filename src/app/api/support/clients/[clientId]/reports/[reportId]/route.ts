import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { updateReport, deleteReport } from "@/server/support";
import { requireSupportClient, requireSupportRow } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; reportId: string }> },
) {
  try {
    const { clientId, reportId } = await params;
    await requireSupportClient(request, clientId);
    await requireSupportRow("report", reportId, clientId);
    const body = await request.json();
    const report = await updateReport(reportId, body);
    return apiOk({ report });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; reportId: string }> },
) {
  try {
    const { clientId, reportId } = await params;
    await requireSupportClient(request, clientId);
    await requireSupportRow("report", reportId, clientId);
    await deleteReport(reportId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
