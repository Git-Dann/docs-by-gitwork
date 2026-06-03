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

function notFound(message: string): Error {
  return Object.assign(new Error(message), { status: 404 });
}

/** Capture an email against a lite scan → unlocks detail + records the lead. Idempotent. */
export async function capturePulseLead(params: { liteScanId: string; email: string }): Promise<{ leadId: string }> {
  const lite = await prisma.pulseLiteScan.findUnique({
    where: { id: params.liteScanId },
    select: { id: true, targetUrl: true, healthScore: true, emailCaptured: true, leadId: true },
  });
  if (!lite) throw notFound("Scan not found.");
  if (lite.emailCaptured && lite.leadId) return { leadId: lite.leadId };

  const lead = await prisma.pulseLead.create({
    data: {
      email: params.email,
      liteScanId: lite.id,
      targetUrl: lite.targetUrl,
      healthScore: lite.healthScore,
      source: "embed",
    },
    select: { id: true },
  });
  await prisma.pulseLiteScan.update({
    where: { id: lite.id },
    data: { emailCaptured: true, leadId: lead.id },
  });

  // Fire-and-forget — never block the unlock response on email delivery.
  void notifyTeamOfLead(lead.id).catch(() => {});
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
