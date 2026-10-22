import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createPulseScanRecord, pulseInclude, runAnalysis, serializePulseScan } from "@/server/pulse";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import { sendWorkspaceEmail } from "@/server/email";
import { getPulseEmbedWorkspaceConfig } from "@/server/pulse-embed-workspace";
import { summarise, triage } from "./public-scan";
import { renderReportEmail } from "./report-email";
import type { PulseScanCheckInput } from "@/types/pulse";

/**
 * What a visitor gets once they unlock their report on the public scanner: the full
 * Pulse report, the same designed report the team exports from the app, sent as a
 * summary email with one link to it as a PDF.
 *
 * The free scan is the fast, AI-free one. The report is the full scan, so this runs
 * one (minutes, and the AI pass costs a few pence), shares it so the PDF link resolves,
 * and builds the email from that same scan, so the numbers in the email are the
 * numbers in the PDF.
 *
 * The share link is never sent on its own: the email links the PDF, not the web page.
 */
export async function deliverFullReport(input: {
  to: string;
  name: string | null;
  targetUrl: string;
  /** The free scan this came from, so a second unlock reuses the full scan. */
  liteScanId?: string | null;
}): Promise<{ ok: true; scanId: string } | { ok: false; error: string }> {
  const scanId = await fullScanFor(input.targetUrl, input.liteScanId ?? null);
  const record = await prisma.pulseScan.findUnique({ where: { id: scanId }, include: pulseInclude });
  if (!record) return { ok: false, error: `Full scan ${scanId} not found` };
  const scan = serializePulseScan(record);
  if (scan.status !== "COMPLETED") {
    return { ok: false, error: `Full scan ${scanId} ended ${scan.status}${scan.errorMessage ? `: ${scan.errorMessage}` : ""}` };
  }

  let token = record.isShared ? record.shareToken : null;
  if (!token) {
    token = record.shareToken ?? randomUUID().replace(/-/g, "");
    await prisma.pulseScan.update({ where: { id: scanId }, data: { shareToken: token, isShared: true } });
  }

  const config = await getPulseEmbedWorkspaceConfig();
  const checks = scan.checks as unknown as PulseScanCheckInput[];
  const { actionable, advisoryCount, notEstablished } = triage(checks, null);
  const { pass, warn, fail } = summarise(checks);
  // Absolute, because this is an email.
  const base = (process.env.NEXTAUTH_URL ?? "https://foundry.gitwork.co.uk").replace(/\/$/, "");
  const { subject, html } = renderReportEmail({
    name: input.name,
    targetUrl: input.targetUrl,
    // The number on the PDF's cover.
    score: scan.healthScore ?? computeScoreBreakdown(checks).finalScore,
    pass,
    warn,
    fail,
    findings: actionable,
    advisoryCount,
    notEstablishedCount: notEstablished.length,
    reportPdfUrl: `${base}/api/public/pulse/report/${token}/pdf`,
    bookingUrl: config.bookingUrl,
    logoUrl: `${base}/email/gitwork-wordmark-ink.png`,
  });

  const res = await sendWorkspaceEmail({ workspaceId: record.workspaceId, to: [input.to], subject, html });
  return res.ok ? { ok: true, scanId } : { ok: false, error: res.error };
}

/** Runs the full scan for this URL, or reuses the one already run for this free scan. */
async function fullScanFor(targetUrl: string, liteScanId: string | null): Promise<string> {
  if (liteScanId) {
    const lite = await prisma.pulseLiteScan.findUnique({ where: { id: liteScanId }, select: { importedScanId: true } });
    if (lite?.importedScanId) {
      const existing = await prisma.pulseScan.findUnique({ where: { id: lite.importedScanId }, select: { status: true } });
      if (existing?.status === "COMPLETED") return lite.importedScanId;
    }
  }

  let projectName = targetUrl;
  try { projectName = new URL(targetUrl).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
  const { scan, aiConfig } = await createPulseScanRecord({ projectName, inputType: "URL", inputUrl: targetUrl });
  if (liteScanId) {
    await prisma.pulseLiteScan.update({ where: { id: liteScanId }, data: { importedScanId: scan.id } }).catch(() => {});
  }
  // runAnalysis records its own failure on the scan, which the caller reads back.
  await runAnalysis(scan.id, { inputType: "URL", inputUrl: targetUrl, projectName }, aiConfig).catch((e) => {
    console.error(`[pulse] full scan ${scan.id} for report delivery threw`, e);
  });
  return scan.id;
}
