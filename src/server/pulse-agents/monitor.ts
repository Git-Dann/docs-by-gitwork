import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { ensureBaseRecords } from "@/server/bootstrap";
import { createPulseScanRecord, runAnalysis } from "@/server/pulse";
import { githubHeaders } from "@/lib/github";
import { sendWorkspaceEmail, listBackstageApproverEmails, escapeHtml } from "@/server/email";
import { getSlackBotToken } from "@/server/slack/client";

export type MonitorFrequency = "DAILY" | "WEEKLY" | "OFF";

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
  frequency: MonitorFrequency;
  lastRunAt: string | null;
  createdAt: string;
  webhookUrl: string;
}

function serializeMonitor(record: {
  id: string; workspaceId: string; projectName: string; inputType: string;
  inputUrl: string | null; inputGithubRepo: string | null; clientId: string | null;
  webhookSecret: string; lastScanId: string | null; lastHealthScore: number | null;
  alertThreshold: number; isActive: boolean; frequency: string; lastRunAt: Date | null; createdAt: Date;
}, appUrl: string): MonitorRecord {
  return {
    ...record,
    inputType: record.inputType as "URL" | "GITHUB_REPO" | "FREE_TEXT",
    frequency: (record.frequency as MonitorFrequency) ?? "DAILY",
    lastRunAt: record.lastRunAt?.toISOString() ?? null,
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
  frequency?: MonitorFrequency;
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
      frequency: input.frequency ?? "DAILY",
    },
  });
  return serializeMonitor(monitor, appUrl);
}

export async function updateMonitor(
  monitorId: string,
  input: { frequency?: MonitorFrequency; isActive?: boolean; alertThreshold?: number },
  appUrl: string,
): Promise<MonitorRecord | null> {
  const { workspace } = await ensureBaseRecords();
  const result = await prisma.pulseMonitor.updateMany({
    where: { id: monitorId, workspaceId: workspace.id },
    data: {
      ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.alertThreshold !== undefined ? { alertThreshold: input.alertThreshold } : {}),
    },
  });
  if (result.count === 0) return null;
  const monitor = await prisma.pulseMonitor.findUnique({ where: { id: monitorId } });
  return monitor ? serializeMonitor(monitor, appUrl) : null;
}

export async function deleteMonitor(monitorId: string): Promise<void> {
  const { workspace } = await ensureBaseRecords();
  await prisma.pulseMonitor.deleteMany({
    where: { id: monitorId, workspaceId: workspace.id },
  });
}

const FREQUENCY_MS: Record<MonitorFrequency, number | null> = {
  DAILY: 22 * 60 * 60 * 1000, // slightly under 24h so a daily cron never skips a day
  WEEKLY: 7 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000,
  OFF: null,
};

/** Active monitors whose next scheduled run is due (for the cron). `now` is passed
 *  in so the decision is testable. */
export async function listDueMonitorIds(now: number = Date.now(), cap = 5): Promise<string[]> {
  const monitors = await prisma.pulseMonitor.findMany({
    where: { isActive: true, frequency: { not: "OFF" } },
    select: { id: true, frequency: true, lastRunAt: true },
    orderBy: { lastRunAt: { sort: "asc", nulls: "first" } },
    take: cap * 4,
  });
  const due = monitors.filter((m) => {
    const interval = FREQUENCY_MS[(m.frequency as MonitorFrequency) ?? "DAILY"];
    if (interval === null) return false;
    if (!m.lastRunAt) return true;
    return now - m.lastRunAt.getTime() >= interval;
  });
  return due.slice(0, cap).map((m) => m.id);
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
           (workspace.anthropicModel ?? "claude-sonnet-5"),
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

  // Evaluate alerts: score regression OR a new CONFIRMED-critical finding (e.g. RLS off).
  const completedScan = await prisma.pulseScan.findUnique({
    where: { id: scan.id },
    select: {
      healthScore: true, status: true,
      checks: { where: { status: "FAIL", trustBucket: "CONFIRMED" }, select: { checkKey: true } },
    },
  });

  if (completedScan?.status === "COMPLETED" && completedScan.healthScore !== null) {
    const prevScore = monitor.lastHealthScore;
    const newScore = completedScan.healthScore;
    const prevCriticalKeys = Array.isArray(monitor.lastCriticalKeys)
      ? (monitor.lastCriticalKeys as string[]).filter((k): k is string => typeof k === "string")
      : [];
    const newCriticalKeys = completedScan.checks.map((c) => c.checkKey);

    const decision = evaluateMonitorAlert({ prevScore, newScore, alertThreshold: monitor.alertThreshold, prevCriticalKeys, newCriticalKeys });
    if (decision.alert) {
      await sendMonitorAlert(monitor, { ...decision, prevScore, newScore, scanId: scan.id });
    }

    await prisma.pulseMonitor.update({
      where: { id: monitorId },
      data: { lastScanId: scan.id, lastHealthScore: newScore, lastRunAt: new Date(), lastCriticalKeys: newCriticalKeys },
    });
  } else {
    await prisma.pulseMonitor.update({
      where: { id: monitorId },
      data: { lastScanId: scan.id, lastRunAt: new Date() },
    });
  }
}

/** PURE alert decision — fire on a score drop ≥ threshold OR a newly-appeared
 *  CONFIRMED-critical finding. Pulled out so it's unit-testable. */
export function evaluateMonitorAlert(args: {
  prevScore: number | null;
  newScore: number;
  alertThreshold: number;
  prevCriticalKeys: string[];
  newCriticalKeys: string[];
}): { alert: boolean; scoreDrop: number; newCriticals: string[]; reasons: string[] } {
  const scoreDrop = args.prevScore !== null ? args.prevScore - args.newScore : 0;
  const scoreDropAlert = args.prevScore !== null && scoreDrop >= args.alertThreshold;
  const prev = new Set(args.prevCriticalKeys);
  const newCriticals = args.newCriticalKeys.filter((k) => !prev.has(k));
  const reasons: string[] = [];
  if (scoreDropAlert) reasons.push(`Health score dropped ${scoreDrop} points (${args.prevScore} → ${args.newScore})`);
  if (newCriticals.length > 0) reasons.push(`${newCriticals.length} new confirmed critical issue(s): ${newCriticals.join(", ")}`);
  return { alert: scoreDropAlert || newCriticals.length > 0, scoreDrop, newCriticals, reasons };
}

async function sendMonitorAlert(
  monitor: { workspaceId: string; inputGithubRepo: string | null; projectName: string },
  alert: { reasons: string[]; newCriticals: string[]; prevScore: number | null; newScore: number; scanId: string },
): Promise<void> {
  const appUrl = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL ?? "";
  const scanUrl = appUrl ? `${appUrl}/app/pulse/${alert.scanId}` : null;
  const headline = alert.reasons.join(" · ") || `Pulse change on ${monitor.projectName}`;
  const reasonsHtml = alert.reasons.map((r) => `<li style="margin:0 0 4px">${escapeHtml(r)}</li>`).join("");

  // 1. Email the team (every monitor type). Best-effort.
  try {
    const recipients = await listBackstageApproverEmails(monitor.workspaceId);
    if (recipients.length > 0) {
      await sendWorkspaceEmail({
        workspaceId: monitor.workspaceId,
        to: recipients,
        subject: `Pulse alert: ${monitor.projectName} — ${headline}`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:520px">
            <h2 style="margin:0 0 8px">⚠️ Pulse monitoring alert</h2>
            <p style="margin:0 0 4px"><strong>Project:</strong> ${escapeHtml(monitor.projectName)}</p>
            <ul style="margin:0 0 12px;padding-left:18px">${reasonsHtml}</ul>
            <p style="margin:0 0 16px">Continuous monitoring flagged this on the latest scan. Review it before it reaches users.</p>
            ${scanUrl ? `<p style="margin:0"><a href="${scanUrl}" style="background:#4f46e5;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">View full report →</a></p>` : ""}
          </div>`,
        text: `Pulse alert: ${monitor.projectName} — ${headline}.${scanUrl ? ` View: ${scanUrl}` : ""}`,
      });
    }
  } catch {
    // best-effort
  }

  // 2. Slack (best-effort) via the workspace bot token + channelRoutes["pulse.alert"].
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: monitor.workspaceId },
      select: { slackBotToken: true, slackBotTokenEncrypted: true, channelRoutes: true },
    });
    const token = getSlackBotToken(ws);
    const routes = (ws?.channelRoutes ?? {}) as Record<string, string>;
    const channel = typeof routes["pulse.alert"] === "string" ? routes["pulse.alert"] : null;
    if (token && channel) {
      await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel, text: `⚠️ *Pulse alert · ${monitor.projectName}*\n${alert.reasons.map((r) => `• ${r}`).join("\n")}${scanUrl ? `\n<${scanUrl}|View full report>` : ""}` }),
      }).catch(() => {});
    }
  } catch {
    // best-effort
  }

  // 3. GitHub Issue for repo monitors.
  if (!monitor.inputGithubRepo) return;
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) return;
  const [owner, repo] = monitor.inputGithubRepo.includes("/")
    ? monitor.inputGithubRepo.split("/").slice(-2)
    : [null, null];
  if (!owner || !repo) return;

  const body = `## ⚠️ Pulse monitoring alert

**Project:** ${monitor.projectName}

${alert.reasons.map((r) => `- ${r}`).join("\n")}

Detected by [Gitwork Pulse](https://gitwork.io) continuous monitoring${scanUrl ? ` — [view full report](${scanUrl})` : ""}. Review the latest scan and address before it affects users.`;

  await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: "POST",
    headers: { ...githubHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ title: `Pulse Alert: ${headline}`, body, labels: ["pulse-alert"] }),
  });
}
