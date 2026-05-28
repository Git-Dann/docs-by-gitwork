import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, fromError } from "@/lib/api-response";
import { getRequestUser } from "@/server/auth/request-user";
import { unregisterDeviceToken } from "@/server/push/devices";

export const dynamic = "force-dynamic";

const unregisterSchema = z.object({
  token: z.string().regex(/^[a-fA-F0-9]+$/, "Device token must be hex"),
});

// DELETE /api/devices/me
// Called by iOS on explicit sign-out (LocalDataWipe). We don't auto-unregister
// on app uninstall — APNs returns Unregistered on the next send and the row
// soft-deletes itself.
export async function DELETE(req: NextRequest) {
  try {
    const user = getRequestUser(req);
    if (!user) {
      return apiError("Sign in required", 401);
    }

    const body = unregisterSchema.parse(await req.json());
    await unregisterDeviceToken(user.id, body.token);
    return apiOk({ ok: true });
  } catch (error) {
    return fromError(error);
  }
}
