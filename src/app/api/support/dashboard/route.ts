import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { requireSupportWorkspace } from "@/server/support-scope";
import { getSupportDashboardSummary } from "@/server/support";

export const dynamic = "force-dynamic";

// GET /api/support/dashboard
// Optimised aggregate for the iOS dashboard — replaces a per-client N+1 fan-out
// (listClients → listTickets per client → listConversations per client) with a
// single round-trip backed by indexed Prisma queries.
export async function GET(request: NextRequest) {
  try {
    const summary = await getSupportDashboardSummary(await requireSupportWorkspace(request));
    return apiOk(summary);
  } catch (error) {
    return fromError(error);
  }
}
