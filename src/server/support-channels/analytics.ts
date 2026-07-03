import { prisma } from "@/lib/prisma";
import { runAnalytics, type AnalyticsConnectionConfig } from "@/server/support-analytics";
import type { ChannelAdapter, SyncContext, SyncResult } from "./types";

// ─── Analytics API channel ───────────────────────────────────────────────────────
//
// Analytics connectors don't ingest conversations — they feed the monthly report. But the
// connector card still offers "Sync now" and a schedule, and the daily background sync iterates
// every connection. So rather than erroring ("Source ANALYTICS not yet implemented"), a sync here
// fetches the CURRENT month's snapshot and caches it on `SupportAnalyticsSnapshot`. That:
//   - validates the connection (base URL / token / adapter) with a clear success or error, and
//   - run daily, builds up a per-month snapshot history so reports get fast, trend-ready data
//     (each month's figures are captured while that month is current, then preserved).
//
// Reports still work without any sync — the report pull falls back to a live fetch — this just
// warms the cache and gives the card something real to do.

async function run(ctx: SyncContext): Promise<SyncResult> {
  const config = (ctx.connection.scraperConfig ?? {}) as AnalyticsConnectionConfig;

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;

  try {
    // Previous month's stored snapshot (if any) → trends without an extra live fetch.
    const prevDate = new Date(Date.UTC(year, month - 2, 1));
    const prevPeriod = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const prevRow = await prisma.supportAnalyticsSnapshot.findUnique({
      where: { clientId_period: { clientId: ctx.client.id, period: prevPeriod } },
    });
    const prevSnapshot = Array.isArray(prevRow?.metrics)
      ? (prevRow!.metrics as Array<{ key: string; value: number }>)
      : undefined;

    const snapshot = await runAnalytics(config, year, month, prevSnapshot);

    await prisma.supportAnalyticsSnapshot.upsert({
      where: { clientId_period: { clientId: ctx.client.id, period } },
      create: { clientId: ctx.client.id, period, metrics: snapshot.metrics as object },
      update: { metrics: snapshot.metrics as object, capturedAt: new Date() },
    });

    await prisma.accountConnection.update({
      where: { id: ctx.connection.id },
      data: { lastSyncedAt: new Date() },
    });

    const n = snapshot.metrics.length;
    return {
      fetched: n,
      ingested: 0,
      filtered: 0,
      errors: [],
      hints: [
        n > 0
          ? `Cached ${n} metric${n === 1 ? "" : "s"} for ${snapshot.periodLabel}. Analytics fill reports on demand — no conversations are ingested.`
          : `Connected, but the API returned no metrics for ${snapshot.periodLabel} yet.`,
      ],
    };
  } catch (err) {
    return {
      fetched: 0,
      ingested: 0,
      filtered: 0,
      errors: [`Analytics fetch failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

export const analyticsAdapter: ChannelAdapter = {
  key: "analytics",
  run,
};
