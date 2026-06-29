import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { canSeeAllClients, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { assignedClientIds } from "@/server/tasks";
import { getPulsePortfolio } from "@/server/pulse";

export const dynamic = "force-dynamic";

// Client-grouped portfolio for the Pulse dashboard. Same scoping as the scan list:
// a restricted developer only sees the clients they're assigned to.
export async function GET(request: NextRequest) {
  try {
    const user = await getEffectiveUserOrNull(request);
    const clientIds = user && !canSeeAllClients(user) ? await assignedClientIds(user) : null;
    const portfolio = await getPulsePortfolio({ clientIds });
    return apiOk({ portfolio });
  } catch (error) {
    return fromError(error);
  }
}
