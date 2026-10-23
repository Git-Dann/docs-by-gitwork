import { prisma } from "@/lib/prisma";
import { blendedDayRateGbp, resolvePricingConfig } from "@/server/pulse-pricing";
import type { CodeHealthReport } from "@/types/code-health";
import { diffReports } from "./trend";

/** Effort is a planning range, not a quote: −30% / +50% around the estimate. */
const RANGE = { low: 0.7, high: 1.5 } as const;

/**
 * The parts of the report that need the database: the trend against the last measured
 * scan of the same repository, and the effort priced at this workspace's own day rate
 * (the same rate the scan's engagement estimate uses). Best-effort: a failure here
 * leaves the measure itself untouched.
 */
export async function enrichCodeHealth(
  report: CodeHealthReport,
  ctx: { scanId: string; workspaceId: string; repo: string },
): Promise<CodeHealthReport> {
  const out: CodeHealthReport = { ...report };
  try {
    const recent = await prisma.pulseScan.findMany({
      where: { workspaceId: ctx.workspaceId, inputGithubRepo: ctx.repo, status: "COMPLETED", id: { not: ctx.scanId } },
      orderBy: { completedAt: "desc" },
      select: { id: true, agentData: true },
      take: 5,
    });
    const prev = recent
      .map((s) => ({ id: s.id, report: (s.agentData as { codeHealth?: CodeHealthReport | null } | null)?.codeHealth ?? null }))
      .find((s) => s.report && s.report.commit !== report.commit);
    out.trend = prev?.report ? diffReports(prev.report, report, prev.id) : null;
  } catch (e) {
    console.warn("[code-health] trend unavailable:", (e as Error).message);
  }
  try {
    if (report.effort) {
      const ws = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, select: { pulsePricingConfig: true } });
      const rate = await blendedDayRateGbp(ctx.workspaceId, resolvePricingConfig(ws?.pulsePricingConfig ?? null));
      const round = (n: number) => Math.round(n / 100) * 100;
      out.effort = {
        ...report.effort,
        dayRateGbp: rate,
        gbpLow: round(report.effort.days * rate * RANGE.low),
        gbpHigh: round(report.effort.days * rate * RANGE.high),
      };
    }
  } catch (e) {
    console.warn("[code-health] costing unavailable:", (e as Error).message);
  }
  return out;
}
