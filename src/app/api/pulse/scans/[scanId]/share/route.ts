import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPulseScan } from "@/server/pulse";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
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

    return apiOk({ shareToken: updated.shareToken, isShared: true });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    await prisma.pulseScan.update({
      where: { id: scanId },
      data: { shareToken: null, isShared: false },
    });
    return apiOk({ isShared: false });
  } catch (error) {
    return fromError(error);
  }
}
