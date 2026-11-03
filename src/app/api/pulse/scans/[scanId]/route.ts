import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { canViewPulseScan, getPulseScan, deletePulseScan, renamePulseScan } from "@/server/pulse";
import { pulseScanRenameSchema } from "@/server/validators";
import { assertCan, canManagePulse, canSeeAllClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assignedClientIds } from "@/server/tasks";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> },
) {
  try {
    const { scanId } = await params;
    const scan = await getPulseScan(scanId);
    if (!scan) {
      return apiError("Scan not found.", 404);
    }

    // ⚠️ This had NO check at all. The LIST is scoped (assigned clients, or scans you
    // ran), but the detail was reachable by id alone — so any signed-in account,
    // including a guest, could read any scan in the workspace given its id. The
    // scoping of a list means nothing if the row behind it is open.
    //
    // 404 rather than 403 on purpose: "that scan exists and you may not see it" is
    // itself a disclosure when the id is the only thing being probed.
    const viewer = await getEffectiveUserOrNull(request);
    if (viewer && !canSeeAllClients(viewer)) {
      const visible = await canViewPulseScan(viewer, scanId, () => assignedClientIds(viewer));
      if (!visible) return apiError("Scan not found.", 404);
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
