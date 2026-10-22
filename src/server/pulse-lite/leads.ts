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
async function notifyVisitorOfResults(leadId: string): Promise<void> {
  const lead = await prisma.pulseLead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  // Loaded here, not at the top: delivery runs the full scan, which pulls in the AI
  // pipeline, and this file is imported by the public routes, which must stay light.
  const { deliverFullReport } = await import("./report-delivery");
  const res = await deliverFullReport({
    to: lead.email,
    name: lead.name,
    targetUrl: lead.targetUrl,
    liteScanId: lead.liteScanId,
  });
  // Say why when it does not go. A send that fails quietly is how "the emails aren't
  // triggering" went unnoticed.
  if (!res.ok) console.error(`[pulse] report for lead ${leadId} not sent: ${res.error}`);
}
