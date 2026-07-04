import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { adoptStarterForScan } from "@/server/starters";
import { starterAdoptSchema } from "@/server/validators";
import { assertCan, canManageStarters, getEffectiveUserOrNull } from "@/server/auth/effective-user";

export const dynamic = "force-dynamic";

// Record that a Pulse scan adopted a starter → sets PulseScan.linkedStarterId, flipping the
// scan-results "Starters" slot to "View starter".
export async function POST(request: NextRequest) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManageStarters, "adopt starters");
    const body = await request.json();
    const { scanId, starterId } = starterAdoptSchema.parse(body);
    const result = await adoptStarterForScan(scanId, starterId);
    if (!result) return apiError("Scan or starter not found", 404);
    return apiOk(result);
  } catch (error) {
    return fromError(error);
  }
}
