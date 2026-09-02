/**
 * Admin-side lead operations (authed). Kept separate from leads.ts so the public
 * unlock route doesn't transitively bundle the AI pipeline (pulse.ts → pulse-ai).
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPulseScanRecord, runAnalysis } from "@/server/pulse";
import type { PulseScanCheckInput } from "@/types/pulse";

export interface PulseLeadView {
  id: string;
  email: string;
  targetUrl: string;
  healthScore: number | null;
  source: string;
  criticalCount: number | null;
  createdAt: string;
  importedScanId: string | null;
}

export async function listPulseLeads(): Promise<PulseLeadView[]> {
  const leads = await prisma.pulseLead.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const liteIds = leads.map((l) => l.liteScanId).filter((v): v is string => Boolean(v));
  const lites = liteIds.length
    ? await prisma.pulseLiteScan.findMany({ where: { id: { in: liteIds } }, select: { id: true, importedScanId: true, checks: true } })
    : [];
  const liteById = new Map(lites.map((l) => [l.id, l]));
  return leads.map((l) => {
    const lite = l.liteScanId ? liteById.get(l.liteScanId) : undefined;
    // Deliberately the FULL, unfiltered scan — the team triaging leads should see the
    // real severity, not the curated subset the public widget teased. See the plan's
    // note on this split in src/app/api/public/pulse/scan/[id]/route.ts.
    const checks = (lite?.checks as PulseScanCheckInput[] | null) ?? null;
    return {
      id: l.id,
      email: l.email,
      targetUrl: l.targetUrl,
      healthScore: l.healthScore,
      source: l.source,
      criticalCount: checks ? checks.filter((c) => c.status === "FAIL").length : null,
      createdAt: l.createdAt.toISOString(),
      importedScanId: lite?.importedScanId ?? null,
    };
  });
}

export interface PulseLeadPreview {
  id: string;
  email: string;
  targetUrl: string;
  healthScore: number | null;
  checks: PulseScanCheckInput[];
}

/**
 * Read-only preview of what the lead's own scan actually found — the same FULL,
 * unfiltered checks `listPulseLeads` derives `criticalCount` from, just returned
 * in full so the team can triage before committing to `importLeadToFoundry`
 * (which kicks off a real, billable AI pipeline run). Never mutates anything.
 */
export async function getPulseLeadPreview(leadId: string): Promise<PulseLeadPreview> {
  const lead = await prisma.pulseLead.findUnique({ where: { id: leadId } });
  if (!lead) throw Object.assign(new Error("Lead not found."), { status: 404 });

  const lite = lead.liteScanId
    ? await prisma.pulseLiteScan.findUnique({ where: { id: lead.liteScanId }, select: { checks: true } })
    : null;

  return {
    id: lead.id,
    email: lead.email,
    targetUrl: lead.targetUrl,
    healthScore: lead.healthScore,
    checks: (lite?.checks as PulseScanCheckInput[] | null) ?? [],
  };
}

/**
 * Turn a public lead into a real workspace scan — runs the FULL AI pipeline on
 * the lead's URL. The public scanner thus becomes the top of the Foundry funnel:
 * free scan → email → full internal scan → proposal (via generateProposalFromScan).
 * Idempotent per lite scan (re-import returns the existing scan).
 */
export async function importLeadToFoundry(leadId: string): Promise<{ scanId: string }> {
  const lead = await prisma.pulseLead.findUnique({ where: { id: leadId } });
  if (!lead) throw Object.assign(new Error("Lead not found."), { status: 404 });

  const lite = lead.liteScanId
    ? await prisma.pulseLiteScan.findUnique({ where: { id: lead.liteScanId }, select: { importedScanId: true } })
    : null;
  if (lite?.importedScanId) return { scanId: lite.importedScanId };

  let projectName = lead.targetUrl;
  try { projectName = new URL(lead.targetUrl).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }

  const { scan, aiConfig } = await createPulseScanRecord({
    projectName,
    inputType: "URL",
    inputUrl: lead.targetUrl,
  });

  after(() =>
    runAnalysis(scan.id, { inputType: "URL", inputUrl: lead.targetUrl, projectName }, aiConfig),
  );

  if (lead.liteScanId) {
    await prisma.pulseLiteScan
      .update({ where: { id: lead.liteScanId }, data: { importedScanId: scan.id } })
      .catch(() => {});
  }
  return { scanId: scan.id };
}
