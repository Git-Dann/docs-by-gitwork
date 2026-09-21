import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getEffectiveUserOrNull, assertCan, canManageDocs } from "@/server/auth/effective-user";
import { generateProposalFromScan, requireScanAccess } from "@/server/pulse";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    // Visibility is not permission: it creates a Document in Docs, which is a
    // separate grant from being allowed to look at the scan.
    assertCan(await getEffectiveUserOrNull(request), canManageDocs, "generate proposal");
    await requireScanAccess(request, scanId);
    // Pass the caller through so the generated proposal is owned by / "prepared by" them
    // rather than the default workspace owner. Null for an API-key-only call.
    const actor = await getEffectiveUserOrNull(request);
    const proposalId = await generateProposalFromScan(scanId, actor ?? undefined);
    return apiOk({ proposalId });
  } catch (error) {
    if (error instanceof Error && error.message.includes("not found")) {
      return apiError(error.message, 404);
    }
    return fromError(error);
  }
}
