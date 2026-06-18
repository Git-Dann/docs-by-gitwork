import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getIndustryBenchmarks } from "@/server/pulse";

export const dynamic = "force-dynamic";

// Wave E3 — industry benchmarks for a scan. Returns null when there aren't yet
// enough peer scans of the same project type to rank against.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const benchmarks = await getIndustryBenchmarks(scanId);
    return apiOk({ benchmarks });
  } catch (error) {
    return fromError(error);
  }
}
