import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { apiOk, apiError, fromError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { originFrom } from "@/lib/request-origin";
import { assertCan, canManagePulse, getEffectiveUserOrNull } from "@/server/auth/effective-user";
import { sendWorkspaceEmail, escapeHtml } from "@/server/email";
import type { PulseAnalysisOutput } from "@/types/pulse";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  to: z.string().email(),
  message: z.string().max(2000).optional(),
});

// Email a prospect the audit: report link + executive summary + proposal hook.
// Auto-shares the scan if needed (the public /report/[token] link must resolve).
export async function POST(request: NextRequest, context: { params: Promise<{ scanId: string }> }) {
  try {
    assertCan(await getEffectiveUserOrNull(request), canManagePulse, "email Pulse audits");
    const { scanId } = await context.params;
    const body = bodySchema.parse(await request.json());

    const scan = await prisma.pulseScan.findUnique({
      where: { id: scanId },
      select: { workspaceId: true, projectName: true, status: true, shareToken: true, isShared: true, llmAnalysis: true },
    });
    if (!scan) return apiError("Scan not found", 404);
    if (scan.status !== "COMPLETED") return apiError("Scan not complete yet.", 409);

    // Auto-share so the public report link resolves.
    let shareToken = scan.shareToken;
    if (!scan.isShared || !shareToken) {
      shareToken = randomUUID().replace(/-/g, "");
      await prisma.pulseScan.update({ where: { id: scanId }, data: { shareToken, isShared: true } });
    }

    const llm = scan.llmAnalysis as PulseAnalysisOutput | null;
    const origin = originFrom(request);
    const reportUrl = `${origin}/report/${shareToken}`;
    const intro = body.message?.trim();

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px;color:#111827">
        ${intro ? `<p style="margin:0 0 16px;white-space:pre-wrap">${escapeHtml(intro)}</p>` : ""}
        <h2 style="margin:0 0 8px">${escapeHtml(scan.projectName)} — production-readiness audit</h2>
        ${llm?.proposalHook ? `<p style="margin:0 0 12px;font-weight:600;color:#4f46e5">${escapeHtml(llm.proposalHook)}</p>` : ""}
        ${llm?.executiveSummary ? `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(llm.executiveSummary)}</p>` : ""}
        <p style="margin:0"><a href="${reportUrl}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">View the full report →</a></p>
      </div>`;
    const text = `${intro ? intro + "\n\n" : ""}${scan.projectName} — production-readiness audit.${llm?.proposalHook ? "\n\n" + llm.proposalHook : ""}\n\nView the full report: ${reportUrl}`;

    const result = await sendWorkspaceEmail({
      workspaceId: scan.workspaceId,
      to: body.to,
      subject: `${scan.projectName} — your production-readiness audit`,
      html,
      text,
    });
    if (!result.ok) return apiError(`Email not sent: ${result.error}`, 502);

    return apiOk({ sent: true, reportUrl });
  } catch (error) {
    return fromError(error);
  }
}
