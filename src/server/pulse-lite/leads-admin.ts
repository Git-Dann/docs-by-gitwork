/**
 * Admin-side lead operations (authed). Kept separate from leads.ts so the public
 * unlock route doesn't transitively bundle the AI pipeline (pulse.ts → pulse-ai).
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPulseScanRecord, runAnalysis } from "@/server/pulse";
import type { PulseScanCheckInput } from "@/types/pulse";
import { parseCapture } from "@/lib/pulse-capture";

export interface PulseLeadView {
  id: string;
  email: string;
  name: string | null;
  business: string | null;
  targetUrl: string;
  healthScore: number | null;
  source: string;
  criticalCount: number | null;
  createdAt: string;
  importedScanId: string | null;
  /** Status of that full scan: RUNNING while the report is being prepared. */
  importedScanStatus: string | null;
  /**
   * Where the visitor's report is. "preparing" while the full scan runs (it takes a few
   * minutes, and opening the scan then shows it mid-run), "sent", "failed" with the
   * reason, or "none" for a lead from before reports were emailed.
   */
  report: { state: "none" | "preparing" | "sent" | "failed" | "untracked"; sentAt: string | null; error: string | null };
}

/** A report not sent this long after the unlock was interrupted (a deploy restarts the server). */
const REPORT_STALE_MS = 30 * 60 * 1000;

/**
 * When Foundry started recording report emails (PulseLead.reportSentAt / reportError went
 * live in the 22 Oct 2026 deploy). A lead that unlocked before this has no record either way:
 * its report may well have gone (the dan+pdf test one did), so it must not be called "not
 * sent" just because nothing was written down.
 */
export const REPORT_TRACKING_SINCE = new Date("2026-10-22T15:10:00Z");

export function reportState(
  l: { termsAcceptedAt: Date | null; reportSentAt: Date | null; reportError: string | null; scanStatus: string | null },
  now = Date.now(),
): PulseLeadView["report"] {
  const sentAt = l.reportSentAt?.toISOString() ?? null;
  if (l.reportSentAt) return { state: "sent", sentAt, error: null };
  if (l.reportError) return { state: "failed", sentAt, error: l.reportError };
  if (l.scanStatus === "FAILED") return { state: "failed", sentAt, error: "The full scan failed, so no report was sent." };
  if (!l.termsAcceptedAt) return { state: "none", sentAt, error: null };
  // No record because recording hadn't started: say so rather than guess.
  if (l.termsAcceptedAt < REPORT_TRACKING_SINCE) return { state: "untracked", sentAt, error: null };
  if (now - l.termsAcceptedAt.getTime() > REPORT_STALE_MS) {
    return { state: "failed", sentAt, error: "No report was sent; it was probably interrupted by a server restart." };
  }
  return { state: "preparing", sentAt, error: null };
}

export async function listPulseLeads(): Promise<PulseLeadView[]> {
  const leads = await prisma.pulseLead.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const liteIds = leads.map((l) => l.liteScanId).filter((v): v is string => Boolean(v));
  const lites = liteIds.length
    ? await prisma.pulseLiteScan.findMany({ where: { id: { in: liteIds } }, select: { id: true, importedScanId: true, checks: true } })
    : [];
  const liteById = new Map(lites.map((l) => [l.id, l]));
  const scanIds = lites.map((l) => l.importedScanId).filter((v): v is string => Boolean(v));
  const scans = scanIds.length
    ? await prisma.pulseScan.findMany({ where: { id: { in: scanIds } }, select: { id: true, status: true } })
    : [];
  const scanStatus = new Map(scans.map((s) => [s.id, s.status as string]));
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
      importedScanStatus: lite?.importedScanId ? scanStatus.get(lite.importedScanId) ?? null : null,
      name: l.name,
      business: l.business,
      report: reportState({
        termsAcceptedAt: l.termsAcceptedAt,
        reportSentAt: l.reportSentAt,
        reportError: l.reportError,
        scanStatus: lite?.importedScanId ? scanStatus.get(lite.importedScanId) ?? null : null,
      }),
    };
  });
}

export interface PulseLeadPreview {
  id: string;
  email: string;
  name: string | null;
  business: string | null;
  source: string;
  createdAt: string;
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
    name: lead.name,
    business: lead.business,
    source: lead.source,
    createdAt: lead.createdAt.toISOString(),
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

/**
 * Correct a lead's name, business or email. The same rules as the unlock form, so an edit
 * can't store something the form would have refused. An email already used by another lead
 * that unlocked a report is refused, because that address has had its report.
 */
export async function updatePulseLead(
  leadId: string,
  patch: { name?: string; business?: string; email?: string },
): Promise<void> {
  const lead = await prisma.pulseLead.findUnique({ where: { id: leadId } });
  if (!lead) throw Object.assign(new Error("Lead not found."), { status: 404 });
  const next = {
    name: patch.name ?? lead.name ?? "",
    business: patch.business ?? lead.business ?? "",
    email: patch.email ?? lead.email,
  };
  const parsed = parseCapture({ ...next, termsAccepted: true });
  if (!parsed.ok) throw Object.assign(new Error(parsed.error), { status: 400 });
  if (parsed.value.email !== lead.email) {
    const clash = await prisma.pulseLead.findFirst({
      where: { email: parsed.value.email, termsAcceptedAt: { not: null }, id: { not: leadId } },
      select: { id: true },
    });
    if (clash) throw Object.assign(new Error("Another lead already has that email address."), { status: 409 });
  }
  await prisma.pulseLead.update({ where: { id: leadId }, data: parsed.value });
}

/**
 * Delete a lead. Its email address can then unlock a report again, which is how the team
 * re-tests the flow with their own address. The free scan stays (it is anonymous) but is no
 * longer marked unlocked; a full scan that was run for the report stays in the scan list.
 */
export async function deletePulseLead(leadId: string): Promise<void> {
  const lead = await prisma.pulseLead.findUnique({ where: { id: leadId }, select: { id: true, liteScanId: true } });
  if (!lead) throw Object.assign(new Error("Lead not found."), { status: 404 });
  await prisma.$transaction([
    prisma.pulseLiteScan.updateMany({ where: { leadId }, data: { emailCaptured: false, leadId: null } }),
    prisma.pulseLead.delete({ where: { id: leadId } }),
  ]);
}
