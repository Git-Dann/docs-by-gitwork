import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPerformanceMetricsForPeriod } from "@/server/support";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const start = request.nextUrl.searchParams.get("start");
    const end = request.nextUrl.searchParams.get("end");
    if (!start || !end) return apiError("start and end query params required", 400);
    const slaParam = request.nextUrl.searchParams.get("slaHours");
    const slaHours = slaParam ? Number(slaParam) : undefined;
    const metrics = await getPerformanceMetricsForPeriod(
      clientId,
      start,
      end,
      slaHours && slaHours > 0 ? slaHours : undefined,
    );
    return apiOk({ metrics });
  } catch (error) {
    return fromError(error);
  }
}
