import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { createPulseScanRecord, runAnalysis } from "@/server/pulse";
import { githubHeaders } from "@/lib/github";
import { sendWorkspaceEmail, listBackstageApproverEmails, escapeHtml } from "@/server/email";
import { dispatchNotification } from "@/server/notifications";

export interface MonitorRecord {
  id: string;
  workspaceId: string;
  projectName: string;
  inputType: "URL" | "GITHUB_REPO" | "FREE_TEXT";
  inputUrl: string | null;
  inputGithubRepo: string | null;
  clientId: string | null;
  webhookSecret: string;
  lastScanId: string | null;
  lastHealthScore: number | null;
  alertThreshold: number;
  isActive: boolean;
  createdAt: string;
  webhookUrl: string;
}

function serializeMonitor(record: {
  id: string; workspaceId: string; projectName: string; inputType: string;
  inputUrl: string | null; inputGithubRepo: string | null; clientId: string | null;
  webhookSecret: string; lastScanId: string | null; lastHealthScore: number | null;
  alertThreshold: number; isActive: boolean; createdAt: Date;
}, appUrl: string): MonitorRecord {
  return {
    ...record,
    inputType: record.inputType as "URL" | "GITHUB_REPO" | "FREE_TEXT",
    createdAt: record.createdAt.toISOString(),
    webhookUrl: `${appUrl}/api/webhooks/github/${record.id}`,
  };
}

export async function listMonitors(appUrl: string): Promise<MonitorRecord[]> {
  const { workspace } = await ensureBaseRecords();
  const monitors = await prisma.pulseMonitor.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });
  return monitors.map((m) => serializeMonitor(m, appUrl));
}

export async function createMonitor(input: {
  projectName: string;
  inputType: "URL" | "GITHUB_REPO" | "FREE_TEXT";
  inputUrl?: string;
  inputGithubRepo?: string;
  clientId?: string;
  alertThreshold?: number;
}, appUrl: string): Promise<MonitorRecord> {
  const { workspace } = await ensureBaseRecords();
  const monitor = await prisma.pulseMonitor.create({
    data: {
      workspaceId: workspace.id,
      projectName: input.projectName,
      inputType: input.inputType,
      inputUrl: input.inputUrl ?? null,
      inputGithubRepo: input.inputGithubRepo ?? null,
      clientId: input.clientId ?? null,
      alertThreshold: input.alertThreshold ?? 10,
    },
  });
  return serializeMonitor(monitor, appUrl);
}

export async function deleteMonitor(monitorId: string): Promise<void> {
  const { workspace } = await ensureBaseRecords();
  await prisma.pulseMonitor.deleteMany({
    where: { id: monitorId, workspaceId: workspace.id },
  });
}

// Verify GitHub webhook HMAC-SHA256 signature.
export function verifyGithubSignature(body: string, secret: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Triggered by a webhook event — runs a new scan and checks for score regression.
export async function triggerMonitorScan(monitorId: string): Promise<void> {
  const monitor = await prisma.pulseMonitor.findUnique({ where: { id: monitorId } });
  if (!monitor || !monitor.isActive) return;

  const { workspace } = await ensureBaseRecords();
  const p = (workspace.aiProvider ?? "ANTHROPIC") as "ANTHROPIC" | "OPENAI" | "GEMINI" | "LOCAL";
  const aiConfig = {
    provider: p,
    apiKey: (() => {
      if (p === "OPENAI") return process.env.OPENAI_API_KEY ?? workspace.openaiApiKey ?? null;
      if (p === "GEMINI") return process.env.GEMINI_API_KEY ?? workspace.geminiApiKey ?? null;
      if (p === "LOCAL") return workspace.openaiApiKey ?? "local";
      return process.env.ANTHROPIC_API_KEY ?? workspace.anthropicApiKey ?? null;
    })(),
    model: p === "OPENAI" ? (workspace.openaiModel ?? "gpt-4o") :
           p === "GEMINI" ? (workspace.geminiModel ?? "gemini-2.0-flash") :
           p === "LOCAL" ? (workspace.localLlmModel ?? "llama3.1") :
           (workspace.anthropicModel ?? "claude-sonnet-4-6"),
    baseUrl: p === "GEMINI" ? "https://generativelanguage.googleapis.com/v1beta/openai/" :
             p === "LOCAL" ? (workspace.localLlmUrl ?? "http://localhost:11434/v1") :
             null,
  };

  const { scan } = await createPulseScanRecord({
    projectName: monitor.projectName,
    inputType: monitor.inputType as "URL" | "GITHUB_REPO" | "FREE_TEXT",
    inputUrl: monitor.inputUrl ?? undefined,
    inputGithubRepo: monitor.inputGithubRepo ?? undefined,
    clientId: monitor.clientId ?? undefined,
  });

  await runAnalysis(scan.id, {
    inputType: monitor.inputType as "URL" | "GITHUB_REPO" | "FREE_TEXT",
    inputUrl: monitor.inputUrl ?? undefined,
    inputGithubRepo: monitor.inputGithubRepo ?? undefined,
    projectName: monitor.projectName,
    clientId: monitor.clientId ?? undefined,
  }, aiConfig);

  // Check for score regression
  const completedScan = await prisma.pulseScan.findUnique({
    where: { id: scan.id },
    select: { healthScore: true, status: true },
  });

  if (completedScan?.status === "COMPLETED" && completedScan.healthScore !== null) {
    const prevScore = monitor.lastHealthScore;
    const newScore = completedScan.healthScore;

    if (prevScore !== null && prevScore - newScore >= monitor.alertThreshold) {
      await sendScoreDropAlert(monitor, prevScore, newScore, scan.id);
    }

    await prisma.pulseMonitor.update({
      where: { id: monitorId },
      data: { lastScanId: scan.id, lastHealthScore: newScore },
    });
  } else {
    await prisma.pulseMonitor.update({
      where: { id: monitorId },
      data: { lastScanId: scan.id },
    });
  }
}

async function sendScoreDropAlert(
  monitor: { workspaceId: string; inputGithubRepo: string | null; projectName: string },
  prevScore: number,
  newScore: number,
  scanId: string,
): Promise<void> {
  const drop = prevScore - newScore;
  const appUrl = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL ?? "";
  const scanUrl = appUrl ? `${appUrl}/app/pulse/${scanId}` : null;

  // In-app bell for Pulse managers (alongside the email below — different channel).
  dispatchNotification({
    event: "pulse.monitor_drift",
    workspaceId: monitor.workspaceId,
    target: { kind: "permission", permission: "pulse.manage" },
    title: `${monitor.projectName} health dropped ${drop} pts (${prevScore} → ${newScore})`,
    actionUrl: `/app/pulse/${scanId}`,
    groupKey: `pulse.monitor_drift:${scanId}`,
  });

  // 1. Email the team (works for every monitor type — URL or GitHub). Best-effort.
  try {
    const recipients = await listBackstageApproverEmails(monitor.workspaceId);
    if (recipients.length > 0) {
      const safeName = escapeHtml(monitor.projectName);
      await sendWorkspaceEmail({
        workspaceId: monitor.workspaceId,
        to: recipients,
        subject: `Pulse alert: ${monitor.projectName} health dropped ${drop} points (${prevScore} → ${newScore})`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:520px">
            <h2 style="margin:0 0 8px">⚠️ Pulse score drop detected</h2>
            <p style="margin:0 0 4px"><strong>Project:</strong> ${safeName}</p>
            <p style="margin:0 0 12px"><strong>Health score:</strong> ${prevScore} → ${newScore} (down ${drop} points)</p>
            <p style="margin:0 0 16px">Continuous monitoring flagged a regression. Review the latest scan to find what changed before it reaches users.</p>
            ${scanUrl ? `<p style="margin:0"><a href="${scanUrl}" style="background:#4f46e5;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">View full report →</a></p>` : ""}
          </div>`,
        text: `Pulse alert: ${monitor.projectName} health dropped ${drop} points (${prevScore} → ${newScore}).${scanUrl ? ` View: ${scanUrl}` : ""}`,
      });
    }
  } catch {
    // email is best-effort — never block the GitHub-issue path or the scan
  }

  // 2. Open a GitHub Issue for repo monitors (unchanged behaviour).
  if (!monitor.inputGithubRepo) return;
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return;

  const [owner, repo] = monitor.inputGithubRepo.includes("/")
    ? monitor.inputGithubRepo.split("/").slice(-2)
    : [null, null];
  if (!owner || !repo) return;

  const body = `## ⚠️ Pulse Score Drop Detected

**Project:** ${monitor.projectName}
**Score changed:** ${prevScore} → ${newScore} (drop of ${drop} points)

This regression was detected by [Gitwork Pulse](https://gitwork.io) continuous monitoring${scanUrl ? ` — [view full report](${scanUrl})` : ""}.

Review the latest scan to identify what caused this regression and address it before it affects your users.`;

  await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: { ...githubHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `Pulse Alert: Health score dropped ${drop} points (${prevScore} → ${newScore})`,
      body,
      labels: ["pulse-alert"],
    }),
  });
}
