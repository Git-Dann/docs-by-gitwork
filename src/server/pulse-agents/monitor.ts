import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { createPulseScanRecord, runAnalysis } from "@/server/pulse";
import { githubHeaders } from "@/lib/github";

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
  monitor: { inputGithubRepo: string | null; projectName: string },
  prevScore: number,
  newScore: number,
  scanId: string,
): Promise<void> {
  // Create a GitHub Issue if this is a GitHub repo scan
  if (!monitor.inputGithubRepo) return;

  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return;

  const [owner, repo] = monitor.inputGithubRepo.includes("/")
    ? monitor.inputGithubRepo.split("/").slice(-2)
    : [null, null];
  if (!owner || !repo) return;

  const appUrl = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL ?? "";
  const scanUrl = appUrl ? `${appUrl}/app/pulse/${scanId}` : null;

  const body = `## ⚠️ Pulse Score Drop Detected

**Project:** ${monitor.projectName}
**Score changed:** ${prevScore} → ${newScore} (drop of ${prevScore - newScore} points)

This regression was detected by [Gitwork Pulse](https://gitwork.io) continuous monitoring${scanUrl ? ` — [view full report](${scanUrl})` : ""}.

Review the latest scan to identify what caused this regression and address it before it affects your users.`;

  await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: { ...githubHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `Pulse Alert: Health score dropped ${prevScore - newScore} points (${prevScore} → ${newScore})`,
      body,
      labels: ["pulse-alert"],
    }),
  });
}
