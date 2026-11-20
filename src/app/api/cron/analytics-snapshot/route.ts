import { NextRequest } from "next/server";
import { apiOk, fromError } from "@/lib/api-response";
import { assertCron } from "@/server/auth/cron";
import { prisma } from "@/lib/prisma";
import { nextConnectorHealth, readHealthState } from "@/lib/care-connector-health";
import { decryptScraperConfig } from "@/server/support";
import { runAnalytics, type AnalyticsConnectionConfig } from "@/server/support-analytics";
import { forEachWorkspace } from "@/server/workspaces/for-each";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Captures each client's analytics metrics for the current month so the monthly
// report has reliable, historical month-over-month trends. CRON_SECRET-guarded.
// Runs once per workspace with Care clients; each connector carries its own credentials and
// writes only its own client's snapshot.
export async function GET(request: NextRequest) {
  try {
    assertCron(request);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const period = `${year}-${String(month).padStart(2, "0")}`;

    const runs = await forEachWorkspace(
      { where: { supportClients: { some: {} } }, select: { id: true } },
      (workspace) => snapshotWorkspace(workspace.id, year, month, period),
    );

    let total = 0;
    let captured = 0;
    const errors: string[] = [];
    for (const run of runs) {
      if (!run.ok) {
        errors.push(`[${run.workspaceId}] ${run.error}`);
        continue;
      }
      total += run.result.total;
      captured += run.result.captured;
      errors.push(...run.result.errors);
    }

    return apiOk({ period, total, captured, errors });
  } catch (error) {
    return fromError(error);
  }
}

async function snapshotWorkspace(
  workspaceId: string,
  year: number,
  month: number,
  period: string,
): Promise<{ total: number; captured: number; errors: string[] }> {
  const connections = await prisma.accountConnection.findMany({
    where: { source: "ANALYTICS", client: { workspaceId } },
    include: { client: { select: { id: true, name: true } } },
  });

  let captured = 0;
  const errors: string[] = [];

  for (const conn of connections) {
    try {
      // scraperConfig contains encrypted API credentials. Decrypt only in this
      // server-side job before passing it to the analytics adapter.
      const config = (decryptScraperConfig(conn.scraperConfig as Record<string, unknown> | null) ?? {}) as AnalyticsConnectionConfig;
      const snapshot = await runAnalytics(config, year, month);
      // ⚠️ Never store an empty month: it reads as "nothing happened", and once the month
      // ends it would count as that month's final figures (CLAUDE.md §35).
      if (snapshot.metrics.length === 0) {
        throw new Error("The connector answered, but returned no numbers for this month.");
      }
      await prisma.supportAnalyticsSnapshot.upsert({
        where: { clientId_period: { clientId: conn.clientId, period } },
        create: { clientId: conn.clientId, period, metrics: snapshot.metrics as object },
        update: { metrics: snapshot.metrics as object, capturedAt: new Date() },
      });
      const ok = nextConnectorHealth({
        previousHealth: conn.health,
        previous: readHealthState(conn.lastSyncStats),
        errors: [],
      });
      await prisma.accountConnection.update({
        where: { id: conn.id },
        data: {
          lastSyncedAt: new Date(),
          lastSyncStats: {
            ingested: snapshot.metrics.length,
            filtered: 0,
            errors: [],
            at: new Date().toISOString(),
            consecutiveFailures: ok.consecutiveFailures,
            failingSince: ok.failingSince,
          } as object,
          health: ok.health,
        },
      });
      captured++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${conn.client.name}: ${msg}`);
      /*
       * ⚠️ One failed run is not a broken connector — this used to flip straight to ERROR, so a
       * single provider hiccup painted the badge red until the next day. The badge has to mean
       * the same thing on every connector, so it goes through the same two-failure rule as the
       * mail sync (`care-connector-health.ts`).
       */
      const bad = nextConnectorHealth({
        previousHealth: conn.health,
        previous: readHealthState(conn.lastSyncStats),
        errors: [msg],
      });
      await prisma.accountConnection.update({
        where: { id: conn.id },
        data: {
          lastSyncStats: {
            ingested: 0,
            filtered: 0,
            errors: [msg],
            at: new Date().toISOString(),
            consecutiveFailures: bad.consecutiveFailures,
            failingSince: bad.failingSince,
          } as object,
          health: bad.health,
        },
      }).catch(() => {});
    }
  }

  return { total: connections.length, captured, errors };
}
