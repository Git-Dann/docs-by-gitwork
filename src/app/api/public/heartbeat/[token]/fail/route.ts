import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { recordHeartbeatPing } from "@/server/wiki-monitors";

// The job ran and failed. Marks the heartbeat DOWN at once (src/lib/monitor-expiry.ts).
async function fail(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!(await recordHeartbeatPing(token, false))) return apiError("Unknown heartbeat", 404);
    return apiOk({ ok: true });
  } catch (err) {
    return fromError(err);
  }
}

export const GET = fail;
export const POST = fail;
