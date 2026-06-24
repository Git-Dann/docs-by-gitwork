import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getScanDiff } from "@/server/pulse";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const diff = await getScanDiff(scanId);
    return apiOk({ diff });
  } catch (error) {
    return fromError(error);
  }
}
