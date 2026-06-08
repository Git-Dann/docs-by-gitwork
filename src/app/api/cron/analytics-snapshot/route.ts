import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { runAnalytics, type AnalyticsConnectionConfig } from "@/server/support-analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Captures each client's analytics metrics for the current month so the monthly
// report has reliable, historical month-over-month trends. CRON_SECRET-guarded.
export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${secret}`) return apiError("Unauthorized", 401);
    }

    const workspace = await prisma.workspace.findFirst({
      where: { slug: DEFAULT_WORKSPACE_SLUG },
      select: { id: true },
    });
    if (!workspace) return apiError("Workspace not found", 404);

    const connections = await prisma.accountConnection.findMany({
      where: { source: "ANALYTICS", client: { workspaceId: workspace.id } },
      include: { client: { select: { id: true, name: true } } },
    });

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const period = `${year}-${String(month).padStart(2, "0")}`;

    let captured = 0;
    const errors: string[] = [];

    for (const conn of connections) {
      try {
        const config = (conn.scraperConfig ?? {}) as AnalyticsConnectionConfig;
        const snapshot = await runAnalytics(config, year, month);
        await prisma.supportAnalyticsSnapshot.upsert({
          where: { clientId_period: { clientId: conn.clientId, period } },
          create: { clientId: conn.clientId, period, metrics: snapshot.metrics as object },
          update: { metrics: snapshot.metrics as object, capturedAt: new Date() },
        });
        await prisma.accountConnection.update({
          where: { id: conn.id },
          data: {
            lastSyncedAt: new Date(),
            lastSyncStats: { ingested: snapshot.metrics.length, filtered: 0, errors: [], at: new Date().toISOString() } as object,
            health: "CONNECTED",
          },
        });
        captured++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${conn.client.name}: ${msg}`);
        await prisma.accountConnection.update({
          where: { id: conn.id },
          data: { lastSyncStats: { ingested: 0, filtered: 0, errors: [msg], at: new Date().toISOString() } as object, health: "ERROR" },
        }).catch(() => {});
      }
    }

    return apiOk({ period, total: connections.length, captured, errors });
  } catch (error) {
    return fromError(error);
  }
}
