import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { listDueMonitorIds, triggerMonitorScan } from "@/server/pulse-agents/monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // each monitor runs a full scan; cap how many per run

// Continuous monitoring — runs due monitors on a schedule and re-scans their target.
// triggerMonitorScan re-scans, then evaluates alerts (score drop OR a new CONFIRMED
// critical) and stamps lastRunAt.
//
// NOTE: Vercel Hobby only permits DAILY crons (see CLAUDE.md). On Pro, bump the
// vercel.json schedule to hourly for tighter monitoring. We cap monitors per run so
// the function stays within maxDuration; heavier volumes want a real queue (future).
const MONITORS_PER_RUN = 3;

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${secret}`) return apiError("Unauthorized", 401);
    }

    const due = await listDueMonitorIds(Date.now(), MONITORS_PER_RUN);
    // Run the due monitors concurrently within the function budget.
    const results = await Promise.allSettled(due.map((id) => triggerMonitorScan(id)));
    const ran = results.filter((r) => r.status === "fulfilled").length;
    const errored = results.filter((r) => r.status === "rejected").length;

    return apiOk({ due: due.length, ran, errored });
  } catch (error) {
    return fromError(error);
  }
}
