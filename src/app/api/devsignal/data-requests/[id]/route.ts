import { NextRequest } from "next/server";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { ensureBaseRecords } from "@/server/bootstrap";
import { assertCan, canManageDevSignal, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { updateDataRequestStatus } from "@/server/devsignal/assessment";
import { devSignalDataRequestUpdateSchema } from "@/server/validators";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getEffectiveUserOrNull(request);
    assertCan(user, canManageDevSignal, "action a DevSignal data request");
    const { workspace } = await ensureBaseRecords();
    const { id } = await params;
    const body = devSignalDataRequestUpdateSchema.parse(await request.json());
    const result = await updateDataRequestStatus(workspace.id, id, body.status, user?.id ?? null);
    if (!result.ok) return apiError("Data request not found.", 404);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
