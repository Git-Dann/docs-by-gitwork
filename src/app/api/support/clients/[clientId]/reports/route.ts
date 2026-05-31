import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { listReports, createReport } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
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
    const body = await request.json();
    const report = await createReport(clientId, body);
    return apiOk({ report }, { status: 201 });
  } catch (error) {
    return fromError(error);
  }
}
