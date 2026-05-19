import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { generateProposalFromScan } from "@/server/pulse";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const proposalId = await generateProposalFromScan(scanId);
    return apiOk({ proposalId });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return apiError(error.message, 404);
    }
    return fromError(error);
  }
}
