import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendWorkspaceEmail } from "@/server/email";
import { diffReports } from "@/server/code-health/trend";
import { renderWeeklyDigestEmail } from "@/server/pulse-lite/report-email";
import type { CodeHealthReport } from "@/types/code-health";

/**
 * The weekly summary email for a monitored project. Rides on the monitor's own
 * scheduled re-scan (the `pulse-run-monitors` cron, already on the box), so it needs no
 * cron of its own: after a re-scan, if a week has passed since the last digest and the
 * monitor has recipients, it sends one comparing this scan with the one the last digest
 * described.
 */

/** A week, less a margin so a daily 05:00 run never slides to day 8. */
export const DIGEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000;
export const MAX_DIGEST_RECIPIENTS = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseDigestEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const e = v.trim().toLowerCase();
    if (EMAIL.test(e)) seen.add(e);
  }
  return [...seen].slice(0, MAX_DIGEST_RECIPIENTS);
}

export function isDigestDue(now: number, lastDigestAt: Date | null, recipients: string[]): boolean {
  return recipients.length > 0 && (!lastDigestAt || now - lastDigestAt.getTime() >= DIGEST_INTERVAL_MS);
}

/** Confirmed failing checks, as their labels: what a client reads as "an issue". */
export function issueDiff(prev: { checkKey: string }[] | null, cur: { checkKey: string; label: string }[]) {
  const before = new Set((prev ?? []).map((c) => c.checkKey));
  const after = new Set(cur.map((c) => c.checkKey));
  return {
    open: cur.map((c) => c.label),
    // The first digest has nothing to compare with, so nothing is "new" yet.
    added: prev ? cur.filter((c) => !before.has(c.checkKey)).map((c) => c.label) : [],
    fixed: prev ? [...before].filter((k) => !after.has(k)) : [],
  };
}

export async function maybeSendWeeklyDigest(monitorId: string, scanId: string, now = Date.now()): Promise<"sent" | "not_due" | "failed"> {
  const monitor = await prisma.pulseMonitor.findUnique({ where: { id: monitorId } });
  if (!monitor) return "not_due";
  const recipients = parseDigestEmails(monitor.digestEmails);
  if (!isDigestDue(now, monitor.lastDigestAt, recipients)) return "not_due";

  const failing = { where: { status: "FAIL" as const, trustBucket: "CONFIRMED" as const }, select: { checkKey: true, label: true }, orderBy: { sortOrder: "asc" as const } };
  const [scan, prev] = await Promise.all([
    prisma.pulseScan.findUnique({ where: { id: scanId }, select: { id: true, status: true, healthScore: true, shareToken: true, isShared: true, agentData: true, createdAt: true, workspaceId: true, checks: failing } }),
    monitor.lastDigestScanId
      ? prisma.pulseScan.findUnique({ where: { id: monitor.lastDigestScanId }, select: { id: true, healthScore: true, agentData: true, createdAt: true, checks: failing } })
      : null,
  ]);
  if (!scan || scan.status !== "COMPLETED") return "not_due";

  // The report link is the shared PDF, as in the report email: token-gated, never the app.
  let token = scan.isShared ? scan.shareToken : null;
  if (!token) {
    token = scan.shareToken ?? randomUUID().replace(/-/g, "");
    await prisma.pulseScan.update({ where: { id: scan.id }, data: { shareToken: token, isShared: true } });
  }

  const issues = issueDiff(prev?.checks ?? null, scan.checks);
  const prevLabels = new Map((prev?.checks ?? []).map((c) => [c.checkKey, c.label]));
  const health = (s: { agentData: unknown } | null) => (s?.agentData as { codeHealth?: CodeHealthReport | null } | null)?.codeHealth ?? null;
  const ch = health(scan);
  const prevCh = health(prev);
  const chTrend = ch && prevCh ? diffReports(prevCh, ch, prev!.id) : null;

  const base = (process.env.NEXTAUTH_URL ?? "https://foundry.gitwork.co.uk").replace(/\/$/, "");
  const { subject, html } = renderWeeklyDigestEmail({
    projectName: monitor.projectName,
    subject: monitor.inputGithubRepo ?? monitor.inputUrl ?? monitor.projectName,
    score: scan.healthScore,
    scoreDelta: prev?.healthScore != null && scan.healthScore != null ? scan.healthScore - prev.healthScore : null,
    since: (monitor.lastDigestAt ?? prev?.createdAt ?? null)?.toISOString() ?? null,
    openIssues: issues.open,
    newIssues: issues.added,
    fixedIssues: issues.fixed.map((k) => prevLabels.get(k) ?? k),
    codeHealth: ch
      ? {
          score: ch.score,
          scoreDelta: chTrend ? chTrend.scoreDelta : null,
          effortDays: ch.effort?.days ?? null,
          resolvedDebt: chTrend?.resolvedDebt ?? 0,
          newDebt: chTrend?.newDebt ?? 0,
          hotspots: (ch.history?.hotspots ?? []).slice(0, 3).map((h) => `${h.path} (${h.changes} changes this year, complexity ${h.complexity})`),
          libraries: ch.dependencies?.status === "checked"
            ? ch.dependencies.vulnerable
                .filter((p) => p.severity === "critical" || p.severity === "high")
                .map((p) => {
                  const before = prevCh?.dependencies?.status === "checked" && !prevCh.dependencies.vulnerable.some((q) => q.name === p.name && q.version === p.version);
                  return `${p.name} ${p.version} (${p.severity})${before ? " · new" : ""}`;
                })
            : null,
          cycles: ch.structure ? { now: ch.structure.cycleCount, before: prevCh?.structure ? prevCh.structure.cycleCount : null } : null,
        }
      : null,
    reportPdfUrl: `${base}/api/public/pulse/report/${token}/pdf`,
    logoUrl: `${base}/email/gitwork-wordmark-ink.png`,
  });

  // One email per person: recipients are often different people at a client, and one
  // shared To line would hand every one of them the others' addresses.
  const results = await Promise.all(recipients.map((to) => sendWorkspaceEmail({ workspaceId: scan.workspaceId, to: [to], subject, html })));
  const sent = results.filter((r) => r.ok).length;
  if (sent === 0) {
    console.warn(`[monitor-digest] ${monitorId}: no digest delivered`, results.map((r) => (r.ok ? "ok" : r.error)));
    return "failed";
  }
  await prisma.pulseMonitor.update({ where: { id: monitorId }, data: { lastDigestAt: new Date(now), lastDigestScanId: scan.id } });
  return "sent";
}
