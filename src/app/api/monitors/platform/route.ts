import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { requirePlatformAdmin } from "@/server/platform/admin";
import { readPlatformHealth } from "@/server/platform-health";

export const dynamic = "force-dynamic";

/**
 * GET — Foundry's own health for the Platform popup on /app/monitors: scheduled jobs, disk,
 * database size and growth, the app's memory, backups and alerts.
 *
 * Platform admins only (checked live, like the Platform console): it describes the server every
 * business runs on, so a business's own admins must not see it.
 */
export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin(req);
    return apiOk(await readPlatformHealth());
  } catch (err) {
    return fromError(err);
  }
}
