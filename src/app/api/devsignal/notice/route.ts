import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import {
  assertCan,
  canCalibrateDevSignal,
  canManageDevSignal,
  getEffectiveUserOrNull,
} from "@/server/auth/effective-user";
import { getActiveNotice, updateNotice } from "@/server/devsignal/notice-store";
import { normalizeNoticeContent } from "@/lib/devsignal/processing-notice";
import { devSignalNoticeUpdateSchema } from "@/server/validators";
import { workspaceIdForRequest } from "@/server/workspaces/scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageDevSignal, "view the DevSignal notice");
    const workspace = { id: await workspaceIdForRequest(request) };
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
    const workspace = { id: await workspaceIdForRequest(request) };
    const body = devSignalNoticeUpdateSchema.parse(await request.json());
    const notice = await updateNotice(workspace.id, normalizeNoticeContent(body), user?.id ?? null);
    return apiOk({ notice });
  } catch (error) {
    return fromError(error);
  }
}
