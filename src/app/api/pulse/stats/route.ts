import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { getPulseStats } from "@/server/pulse";
import { assertInternal, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/pulse/stats — workspace-wide Pulse figures (scan count, average health,
 * the healthy/moderate/at-risk split).
 *
 * Internal-only: it describes GITWORK's whole client portfolio, not the caller's own
 * work, so a guest reading it learns how many clients we have and how they are doing.
 */
export async function GET(request: NextRequest) {
  try {
    assertInternal(await getEffectiveUserOrNull(request));
    const stats = await getPulseStats();
    return apiOk(stats);
  } catch (error) {
    return fromError(error);
  }
}
