import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { getPulseScan, deletePulseScan, renamePulseScan } from "@/server/pulse";
import { pulseScanRenameSchema } from "@/server/validators";
import { assertCan, canManagePulse, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const scan = await getPulseScan(scanId);
    if (!scan) {
      return apiError("Scan not found.", 404);
    }
    return apiOk({ scan });
  } catch (error) {
    return fromError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManagePulse, "rename Pulse scans");
    const { scanId } = await params;
    const existing = await getPulseScan(scanId);
    if (!existing) {
      return apiError("Scan not found.", 404);
    }
    const { projectName } = pulseScanRenameSchema.parse(await request.json());
    const scan = await renamePulseScan(scanId, projectName);
    return apiOk({ scan });
  } catch (error) {
    return fromError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManagePulse, "delete Pulse scans");
    const { scanId } = await params;
    const scan = await getPulseScan(scanId);
    if (!scan) {
      return apiError("Scan not found.", 404);
    }
    await deletePulseScan(scanId);
    return apiOk({ deleted: true });
  } catch (error) {
    return fromError(error);
  }
}
