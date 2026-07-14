import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canCalibrateDevSignal, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getCalibrationReport } from "@/server/devsignal/calibration-report";

export const dynamic = "force-dynamic";

/** Score-calibration report. Super Admin only — it exposes the scoring model. */
export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canCalibrateDevSignal, "view DevSignal calibration");
    const { workspace } = await ensureBaseRecords();
    return apiOk({ report: await getCalibrationReport(workspace.id) });
  } catch (error) {
    return fromError(error);
  }
}
