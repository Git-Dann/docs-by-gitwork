import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { recordHeartbeatPing } from "@/server/wiki-monitors";

// Public: the token IS the credential (a heartbeat monitor's ping URL). GET or POST, so a
// plain `curl` at the end of a cron line works. Add /fail to report a failed run.
async function ping(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!(await recordHeartbeatPing(token, true))) return apiError("Unknown heartbeat", 404);
    return apiOk({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}

export const GET = ping;
export const POST = ping;
export const HEAD = ping;
