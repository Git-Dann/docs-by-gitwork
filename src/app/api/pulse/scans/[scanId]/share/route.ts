import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { revalidateTag } from "next/cache";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPulseScan } from "@/server/pulse";
import { assertCan, canManagePulse, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManagePulse, "share Pulse scans");
    const { scanId } = await params;
    const scan = await getPulseScan(scanId);
    if (!scan) return apiError("Scan not found.", 404);
    if (scan.status !== "COMPLETED") return apiError("Only completed scans can be shared.", 400);

    const token = randomUUID().replace(/-/g, "");
    const updated = await prisma.pulseScan.update({
      where: { id: scanId },
      data: { shareToken: token, isShared: true },
      select: { shareToken: true },
    });

    // Bust the cached report for any rotated-out token so old links stop resolving.
    if (scan.shareToken && scan.shareToken !== token) revalidateTag(`pulse-report-${scan.shareToken}`);
    revalidateTag(`pulse-report-${token}`);

    return apiOk({ shareToken: updated.shareToken, isShared: true });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManagePulse, "unshare Pulse scans");
    const { scanId } = await params;
    const existing = await prisma.pulseScan.findUnique({ where: { id: scanId }, select: { shareToken: true } });
    await prisma.pulseScan.update({
      where: { id: scanId },
      data: { shareToken: null, isShared: false },
    });
    // Invalidate the cached report so the un-shared link 404s immediately.
    if (existing?.shareToken) revalidateTag(`pulse-report-${existing.shareToken}`);
    return apiOk({ isShared: false });
  } catch (error) {
    return fromError(error);
  }
}
