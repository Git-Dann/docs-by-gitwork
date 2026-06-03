import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { runAnalytics, type AnalyticsConnectionConfig } from "@/server/support-analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/support/clients/[clientId]/analytics?month=YYYY-MM
// Runs the client's analytics connection for the given month (+ previous month for
// trends) and returns a normalised snapshot. Token stays server-side on the connection.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  try {
    const { clientId } = await params;
    const monthParam = request.nextUrl.searchParams.get("month"); // "YYYY-MM"
    const now = new Date();
    const [yStr, mStr] = (monthParam ?? "").split("-");
    const year = Number(yStr) || now.getFullYear();
    const month = Number(mStr) || now.getMonth() + 1;
    if (month < 1 || month > 12) return apiError("Invalid month — expected YYYY-MM", 400);

    const conn = await prisma.accountConnection.findFirst({
      where: { clientId, source: "ANALYTICS" },
      orderBy: { createdAt: "desc" },
    });
    if (!conn) {
      return apiError("No analytics connection configured for this client", 404);
    }

    const config = (conn.scraperConfig ?? {}) as AnalyticsConnectionConfig;
    const snapshot = await runAnalytics(config, year, month);
    return apiOk(snapshot);
  } catch (error) {
    return fromError(error);
  }
}
