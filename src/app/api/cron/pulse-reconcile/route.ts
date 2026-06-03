import { NextRequest } from "next/server";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A scan running in `after()` is bounded by the route maxDuration (300s). If it's
// still RUNNING well past that, the function was killed (deploy/crash/timeout)
// and the scan is orphaned. This reconciler is the durability safety net.
//
// Because AI is decoupled from the deterministic checks, recovery is graceful:
//   - died AFTER checksCompletedAt  → checks + score are saved and usable, only
//     the AI synthesis is missing → mark COMPLETED with an aiError note (salvage).
//   - died BEFORE checksCompletedAt → nothing useful persisted → mark FAILED so
//     the user can retry.
//
// NOTE: Vercel Hobby only permits DAILY crons. If on Pro, bump the schedule in
// vercel.json to hourly (`0 * * * *`) for tighter recovery.
const STALE_AFTER_MS = 6 * 60 * 1000; // 6 min — comfortably past the 300s scan budget
const BATCH = 50;

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${secret}`) return apiError("Unauthorized", 401);
    }

    const cutoff = new Date(Date.now() - STALE_AFTER_MS);
    const stale = await prisma.pulseScan.findMany({
      where: { status: "RUNNING", startedAt: { lt: cutoff } },
      select: { id: true, checksCompletedAt: true, agentData: true },
      take: BATCH,
    });

    let salvaged = 0;
    let failed = 0;

    for (const scan of stale) {
      if (scan.checksCompletedAt) {
        // Checks are done & persisted — only AI is missing. Salvage as COMPLETED.
        const prevAgentData = (scan.agentData as Record<string, unknown> | null) ?? {};
        await prisma.pulseScan.update({
          where: { id: scan.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            agentData: {
              ...prevAgentData,
              aiError:
                "AI analysis didn't finish in time — your checks and health score are complete. Re-run the AI analysis from the scan page.",
            } as unknown as object,
          },
        });
        salvaged++;
      } else {
        await prisma.pulseScan.update({
          where: { id: scan.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorCode: "TIMEOUT",
            errorMessage: "Scan stalled before completing and was automatically cancelled. Please retry.",
          },
        });
        failed++;
      }
    }

    // Privacy + hygiene: prune expired raw public lite-scan rows (captured leads
    // are kept — they're the business record). Each PulseLiteScan sets expiresAt
    // on creation.
    const pruned = await prisma.pulseLiteScan.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    return apiOk({ checked: stale.length, salvaged, failed, prunedLiteScans: pruned.count });
  } catch (error) {
    return fromError(error);
  }
}
