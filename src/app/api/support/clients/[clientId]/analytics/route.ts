import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { decryptScraperConfig } from "@/server/support";
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

    // Connector secrets are encrypted at rest. Analytics adapters need the decrypted
    // config on the server, otherwise they see an encrypted token (and no adapter
    // config) and the report falls back to an empty analytics table.
    const config = (decryptScraperConfig(conn.scraperConfig as Record<string, unknown> | null) ?? {}) as AnalyticsConnectionConfig;

    // Prefer a stored snapshot of the previous month for reliable trends.
    const prevDate = new Date(year, month - 2, 1);
    const prevPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const prevRow = await prisma.supportAnalyticsSnapshot.findUnique({
      where: { clientId_period: { clientId, period: prevPeriod } },
    });
    const prevSnapshot = Array.isArray(prevRow?.metrics)
      ? (prevRow!.metrics as Array<{ key: string; value: number }>)
      : undefined;

    const snapshot = await runAnalytics(config, year, month, prevSnapshot);

    // Persist this month's capture so future runs (and trends) have real history.
    const period = `${year}-${String(month).padStart(2, "0")}`;
    await prisma.supportAnalyticsSnapshot.upsert({
      where: { clientId_period: { clientId, period } },
      create: { clientId, period, metrics: snapshot.metrics as object },
      update: { metrics: snapshot.metrics as object, capturedAt: new Date() },
    });

    return apiOk(snapshot);
  } catch (error) {
    return fromError(error);
  }
}
