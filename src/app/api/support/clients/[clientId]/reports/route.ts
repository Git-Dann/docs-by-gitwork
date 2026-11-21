import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listReports, createReport } from "@/server/support";
import { requireSupportClient } from "@/server/support-scope";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    await requireSupportClient(request, clientId);
    const reports = await listReports(clientId);
    return apiOk({ reports });
  } catch (error) {
    return fromError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    await requireSupportClient(request, clientId, "manage");
    const body = await request.json();
    const report = await createReport(clientId, body);
    return apiOk({ report }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
