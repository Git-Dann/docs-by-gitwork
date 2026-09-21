import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPulseScan, reanalysePulseScan, requireScanAccess } from "@/server/pulse";
import { getEffectiveUserOrNull, assertCan, canGenerateAi } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    // Visibility is not permission: it re-runs the AI phase and spends tokens, which is a
    // separate grant from being allowed to look at the scan.
    assertCan(await getEffectiveUserOrNull(request), canGenerateAi, "reanalyse");
    await requireScanAccess(request, scanId);

    const existing = await getPulseScan(scanId);
    if (!existing) return apiError("Scan not found.", 404);
    if (existing.status === "RUNNING") return apiError("Scan is still running.", 409);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const context = typeof body.context === "string" ? body.context.trim() : undefined;

    const scan = await reanalysePulseScan(scanId, context || undefined);
    return apiOk({ scan });
  } catch (error) {
    return fromError(error);
  }
}
