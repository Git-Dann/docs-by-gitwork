import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { updateReport, deleteReport } from "@/server/support";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string; reportId: string }> },
) {
  try {
    const { reportId } = await params;
    const body = await request.json();
    const report = await updateReport(reportId, body);
    return apiOk({ report });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string; reportId: string }> },
) {
  try {
    const { reportId } = await params;
    await deleteReport(reportId);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
