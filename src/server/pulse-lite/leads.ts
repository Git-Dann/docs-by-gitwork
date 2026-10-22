/**
 * Pulse lead capture + Foundry funnel.
 *
 * When a visitor unlocks the detailed findings on the public scanner, we record
 * a PulseLead, mark the lite scan unlocked, and notify the team. `importLeadToFoundry`
 * turns that lead into a real workspace scan (full AI) + optional client, making
 * the public scanner the top of the Foundry funnel.
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_WORKSPACE_SLUG } from "@/server/proposals";
import { sendWorkspaceEmail, escapeHtml } from "@/server/email";
import { isAtLeast } from "@/types/auth";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import { summarise, triage } from "./public-scan";
import { renderReportEmail } from "./report-email";
import { buildReportPdf } from "./report-pdf";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { freeKeysFor } from "@/lib/pulse-free-tier";
import { getPulseEmbedWorkspaceConfig } from "@/server/pulse-embed-workspace";
import type { PulseScanCheckInput } from "@/types/pulse";
import { ACTIVE_MEMBER } from "@/server/auth/member-status";

function notFound(message: string): Error {
  return Object.assign(new Error(message), { status: 404 });
}

/** Thrown when an email has already claimed its one lifetime free unlock. */
export class EmailAlreadyUsedError extends Error {
  status = 409;
  constructor(message = "This email has already used its free scan.") {
    super(message);
    this.name = "EmailAlreadyUsedError";
  }
}

/**
 * Capture an email against a lite scan. Called at scan-START time now (email is
 * required up front to run a scan at all) — so this does NOT send notifications
 * itself, since the scan hasn't produced results yet. Call `notifyLeadOfScanResult`
 * once the scan actually completes. Idempotent per scan; each email gets exactly
 * ONE lifetime capture across ALL scans — a second attempt (even a different URL)
 * is rejected with EmailAlreadyUsedError.
 */
export async function capturePulseLead(params: {
  liteScanId: string;
  email: string;
  source?: string;
  name?: string;
  business?: string;
  termsAcceptedAt?: Date;
}): Promise<{ leadId: string; created: boolean }> {
  const lite = await prisma.pulseLiteScan.findUnique({
    where: { id: params.liteScanId },
    select: { id: true, targetUrl: true, healthScore: true, emailCaptured: true, leadId: true },
  });
  if (!lite) throw notFound("Scan not found.");
  if (lite.emailCaptured && lite.leadId) return { leadId: lite.leadId, created: false };

  const existingForEmail = await prisma.pulseLead.findFirst({ where: { email: params.email }, select: { id: true } });
  if (existingForEmail) throw new EmailAlreadyUsedError();

  const lead = await prisma.pulseLead.create({
    data: {
      email: params.email,
      liteScanId: lite.id,
      targetUrl: lite.targetUrl,
      healthScore: lite.healthScore,
      source: params.source ?? "embed",
      name: params.name ?? null,
      business: params.business ?? null,
      termsAcceptedAt: params.termsAcceptedAt ?? null,
    },
    select: { id: true },
  });
  await prisma.pulseLiteScan.update({
    where: { id: lite.id },
    data: { emailCaptured: true, leadId: lead.id },
  });

  return { leadId: lead.id, created: true };
}

/**
 * Fires both notification emails (internal admin + visitor) — call once the scan has
 * actually finished, so the visitor's copy and PulseLead.healthScore reflect the real
 * result instead of the null/in-progress state captured at scan-start.
 */
export async function notifyLeadOfScanResult(leadId: string): Promise<void> {
  const lead = await prisma.pulseLead.findUnique({ where: { id: leadId }, select: { liteScanId: true } });
  if (lead?.liteScanId) {
    const lite = await prisma.pulseLiteScan.findUnique({ where: { id: lead.liteScanId }, select: { healthScore: true } });
    if (lite) await prisma.pulseLead.update({ where: { id: leadId }, data: { healthScore: lite.healthScore } }).catch(() => {});
  }
  void notifyTeamOfLead(leadId).catch(() => {});
  void notifyVisitorOfResults(leadId).catch(() => {});
}

async function notifyTeamOfLead(leadId: string): Promise<void> {
  const lead = await prisma.pulseLead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  const workspace = await prisma.workspace.findFirst({ where: { slug: DEFAULT_WORKSPACE_SLUG }, select: { id: true } });
  if (!workspace) return;

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, ...ACTIVE_MEMBER },
    include: { user: { select: { email: true } } },
  });
  const admins = members.filter((m) => isAtLeast(m.role, "ADMIN")).map((m) => m.user.email).filter(Boolean);
  if (admins.length === 0) return;

  const score = lead.healthScore ?? "—";
  const res = await sendWorkspaceEmail({
    workspaceId: workspace.id,
    to: admins,
    subject: `New Pulse lead — ${lead.email}`,
    html: `<p>A new lead just ran the public Pulse scanner.</p>
      <ul>
        ${lead.name ? `<li><strong>Name:</strong> ${escapeHtml(lead.name)}</li>` : ""}
        ${lead.business ? `<li><strong>Business:</strong> ${escapeHtml(lead.business)}</li>` : ""}
        <li><strong>Email:</strong> ${escapeHtml(lead.email)}</li>
        <li><strong>Scanned:</strong> ${escapeHtml(lead.targetUrl)}</li>
        <li><strong>Health score:</strong> ${score}/100</li>
      </ul>
      <p>Open Foundry → Pulse to import this lead into a full AI scan + proposal.</p>`,
  });
  if (res.ok) {
    await prisma.pulseLead.update({ where: { id: leadId }, data: { notifiedAt: new Date() } }).catch(() => {});
  }
}

/**
 * Emails the VISITOR a copy of their own results — separate from notifyTeamOfLead's
 * internal-admin notification. Filtered to the workspace's curated embed check set (§2
 * of the plan) so the email matches exactly what the widget showed, never more.
 */
function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "your site"; }
}

async function notifyVisitorOfResults(leadId: string): Promise<void> {
  const lead = await prisma.pulseLead.findUnique({ where: { id: leadId } });
  if (!lead || !lead.liteScanId) return;
  const workspace = await prisma.workspace.findFirst({ where: { slug: DEFAULT_WORKSPACE_SLUG }, select: { id: true } });
  if (!workspace) return;
  const config = await getPulseEmbedWorkspaceConfig();

  const lite = await prisma.pulseLiteScan.findUnique({ where: { id: lead.liteScanId }, select: { checks: true, updatedAt: true } });
  const allChecks = (lite?.checks as PulseScanCheckInput[] | null) ?? [];
  // ⚠️ ONE score per scan. This used to rescore a curated ~10-check subset with
  // `calculateHealthScore`, so the same visitor was emailed a DIFFERENT number from
  // the one on their screen and on /scan/[id] — same person, same scan, two scores.
  // `computeScoreBreakdown` over the full set is what every other surface uses.
  const score = computeScoreBreakdown(allChecks).finalScore;
  // And the same triage as the page, so the email echoes the report rather than
  // inventing its own selection.
  // The visitor has unlocked the report (they gave name, business, email and agreed to the
  // terms), so their copy is the FULL triaged report — the workspace's free-set limit
  // applies to strangers, not to them.
  const { actionable, advisoryCount, notEstablished } = triage(allChecks, freeKeysFor(true, config.freeCheckKeys));
  const { pass, warn, fail } = summarise(allChecks);
  // Absolute, because this is an email.
  const base = (process.env.NEXTAUTH_URL ?? "https://foundry.gitwork.co.uk").replace(/\/$/, "");
  const applied = allChecks.filter((c) => c.status !== "SKIPPED" && c.status !== "NOT_APPLICABLE");
  const { subject, html } = renderReportEmail({
    name: lead.name,
    targetUrl: lead.targetUrl,
    score,
    pass,
    warn,
    fail,
    findings: actionable,
    advisoryCount,
    notEstablishedCount: notEstablished.length,
    checkCount: applied.length,
    bookingUrl: config.bookingUrl,
    logoUrl: `${base}/email/gitwork-wordmark-ink.png`,
  });

  // The full report: every check, with its evidence. If it cannot be built the summary
  // still goes, because the email on its own is useful and a missing PDF is recoverable.
  let pdf: Uint8Array | null = null;
  try {
    pdf = await buildReportPdf({
      targetUrl: lead.targetUrl,
      preparedFor: [lead.name, lead.business].filter(Boolean).join(", ") || null,
      scannedAt: lite?.updatedAt ?? new Date(),
      score,
      pass,
      warn,
      fail,
      findings: actionable,
      checks: allChecks.map((c) => ({ category: c.category, label: c.label, status: c.status, detail: c.detail ?? null })),
      logoPng: await readFile(join(process.cwd(), "public/email/gitwork-wordmark-ink.png")).catch(() => null),
    });
  } catch (e) {
    console.error("[pulse] report PDF failed", e);
  }

  const res = await sendWorkspaceEmail({
    workspaceId: workspace.id,
    to: [lead.email],
    subject,
    html,
    attachments: pdf ? [{ filename: `Pulse report - ${hostOf(lead.targetUrl)}.pdf`, content: pdf }] : undefined,
  });
  // Say why when it does not go. A send that fails quietly is how "the emails aren't
  // triggering" went unnoticed.
  if (!res.ok) console.error(`[pulse] report email to lead ${leadId} not sent: ${res.error}`);
}
