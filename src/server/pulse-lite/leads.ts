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
import { calculateHealthScore } from "@/server/pulse-scan";
import { resolveEmbedCheckKeys, filterToEmbedChecks } from "@/server/pulse-embed-config";
import type { PulseScanCheckInput } from "@/types/pulse";

const CALENDLY_URL = "https://calendly.com/gitworkgroup/30min";

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
 * Capture an email against a lite scan → unlocks detail + records the lead. Idempotent
 * per scan (re-polling the same scan with the same email just returns the existing lead).
 * But each email gets exactly ONE lifetime unlock across ALL scans — a second email
 * capture attempt (even against a different URL) is rejected with EmailAlreadyUsedError.
 */
export async function capturePulseLead(params: { liteScanId: string; email: string; source?: string }): Promise<{ leadId: string }> {
  const lite = await prisma.pulseLiteScan.findUnique({
    where: { id: params.liteScanId },
    select: { id: true, targetUrl: true, healthScore: true, emailCaptured: true, leadId: true },
  });
  if (!lite) throw notFound("Scan not found.");
  if (lite.emailCaptured && lite.leadId) return { leadId: lite.leadId };

  const existingForEmail = await prisma.pulseLead.findFirst({ where: { email: params.email }, select: { id: true } });
  if (existingForEmail) throw new EmailAlreadyUsedError();

  const lead = await prisma.pulseLead.create({
    data: {
      email: params.email,
      liteScanId: lite.id,
      targetUrl: lite.targetUrl,
      healthScore: lite.healthScore,
      source: params.source ?? "embed",
    },
    select: { id: true },
  });
  await prisma.pulseLiteScan.update({
    where: { id: lite.id },
    data: { emailCaptured: true, leadId: lead.id },
  });

  // Fire-and-forget — never block the unlock response on email delivery.
  void notifyTeamOfLead(lead.id).catch(() => {});
  void notifyVisitorOfResults(lead.id).catch(() => {});
  return { leadId: lead.id };
}

async function notifyTeamOfLead(leadId: string): Promise<void> {
  const lead = await prisma.pulseLead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  const workspace = await prisma.workspace.findFirst({ where: { slug: DEFAULT_WORKSPACE_SLUG }, select: { id: true } });
  if (!workspace) return;

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id },
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
  if (!lead || !lead.liteScanId) return;
  const workspace = await prisma.workspace.findFirst({
    where: { slug: DEFAULT_WORKSPACE_SLUG },
    select: { id: true, pulseEmbedCheckKeys: true },
  });
  if (!workspace) return;

  const lite = await prisma.pulseLiteScan.findUnique({ where: { id: lead.liteScanId }, select: { checks: true } });
  const allChecks = (lite?.checks as PulseScanCheckInput[] | null) ?? [];
  const checkKeys = resolveEmbedCheckKeys(workspace.pulseEmbedCheckKeys);
  const embedChecks = filterToEmbedChecks(allChecks, checkKeys);
  const score = calculateHealthScore(embedChecks);
  const findings = embedChecks
    .filter((c) => c.status === "FAIL" || c.status === "WARN")
    .sort((a, b) => (a.status === "FAIL" ? 0 : 1) - (b.status === "FAIL" ? 0 : 1));
  const criticalCount = embedChecks.filter((c) => c.status === "FAIL").length;

  const findingsHtml = findings.length
    ? `<ul>${findings
        .map(
          (f) =>
            `<li><strong>${f.status === "FAIL" ? "✕" : "!"} ${escapeHtml(f.label)}</strong>${f.detail ? `<br/>${escapeHtml(f.detail)}` : ""}</li>`,
        )
        .join("")}</ul>`
    : "<p>No issues found in the checks we ran — nice work.</p>";

  await sendWorkspaceEmail({
    workspaceId: workspace.id,
    to: [lead.email],
    subject: `Your Pulse results for ${lead.targetUrl}`,
    html: `<p>Thanks for scanning your site with Gitwork Pulse. Here's what we found:</p>
      <p><strong>Health score:</strong> ${score}/100</p>
      <p><strong>Critical issues:</strong> ${criticalCount}</p>
      ${findingsHtml}
      <p>Want help fixing these, or a full deep-dive across 100+ checks?
        <a href="${CALENDLY_URL}">Book a call</a> with Gitwork.</p>`,
  });
}
