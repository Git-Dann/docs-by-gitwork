import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertAtLeastAdmin, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { getCheckStatMap } from "@/server/curator/queries";

export const dynamic = "force-dynamic";

// Read-only per-check usage stats for the Settings → Checks signal column. Admin-or-above (same
// audience as the Checks panel), unlike the curator controls which are Super-Admin only.
export async function GET(request: NextRequest) {
  try {
    assertAtLeastAdmin(await getEffectiveUserOrNull(request));
    const stats = await getCheckStatMap();
    return apiOk({ stats });
  } catch (error) {
    return fromError(error);
  }
}
