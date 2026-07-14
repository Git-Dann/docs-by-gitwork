import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import {
  assertCan,
  canCalibrateDevSignal,
  canManageDevSignal,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";
import { getActiveNotice, updateNotice } from "@/server/devsignal/notice-store";
import { normalizeNoticeContent } from "@/lib/devsignal/processing-notice";
import { devSignalNoticeUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDevSignal, "view the DevSignal notice");
    const { workspace } = await ensureBaseRecords();
    return apiOk({ notice: await getActiveNotice(workspace.id) });
  } catch (error) {
    return fromError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    // Editing the legal/consent notice is a platform-owner action → Super Admin only.
    assertCan(user, canCalibrateDevSignal, "edit the DevSignal consent notice");
    const { workspace } = await ensureBaseRecords();
    const body = devSignalNoticeUpdateSchema.parse(await request.json());
    const notice = await updateNotice(workspace.id, normalizeNoticeContent(body), user?.id ?? null);
    return apiOk({ notice });
  } catch (error) {
    return fromError(error);
  }
}
