/**
 * Shared shaping for the public lite-scan result page.
 *
 * Kept out of the page component so the HTML page, the Markdown variant and any
 * future JSON view are guaranteed to describe the same scan the same way. When a
 * report exists in several representations, the only way they cannot drift is to
 * derive all of them from one function.
 */

import { prisma } from "@/lib/prisma";
import { summarise, triage, type PublicTriage, type LiteCategorySummary } from "./public-scan";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import { scoreGrade } from "@/lib/badge/pulse-badge";
import type { PulseScanCheckInput } from "@/types/pulse";

export interface PublicReport {
  id: string;
  status: string;
  targetUrl: string;
  /** Host only — what a human recognises, and safe to put in a page title. */
  targetHost: string;
  score: number | null;
  /** "GOOD", "NEEDS WORK" … — the same band the badge and the internal report use. */
  band: string;
  techStack: string[];
  scannedAt: string | null;
  measured: number;
  pass: number;
  warn: number;
  fail: number;
  inconclusive: number;
  categories: LiteCategorySummary[];
  triage: PublicTriage;
  /** True once someone has asked for the in-depth review against this scan. */
  enquired: boolean;
  errorMessage: string | null;
}

export async function getPublicReport(id: string): Promise<PublicReport | null> {
  const lite = await prisma.pulseLiteScan.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      targetUrl: true,
      targetHost: true,
      healthScore: true,
      techStack: true,
      checks: true,
      emailCaptured: true,
      errorMessage: true,
      updatedAt: true,
      createdAt: true,
    },
  });
  if (!lite) return null;

  const checks = (lite.checks as PulseScanCheckInput[] | null) ?? [];
  const { categories, pass, warn, fail, inconclusive } = summarise(checks);
  // Same function as the internal report, the badge and Provenance. A second
  // formula here is how a public number starts quietly disagreeing with the paid one.
  const score = checks.length > 0 ? computeScoreBreakdown(checks).finalScore : lite.healthScore;

  return {
    id: lite.id,
    status: lite.status,
    targetUrl: lite.targetUrl,
    targetHost: lite.targetHost,
    score,
    band: score == null ? "PENDING" : scoreGrade(score),
    techStack: (lite.techStack as string[] | null) ?? [],
    // PulseLiteScan has no completedAt; updatedAt is set by the final authoritative
    // write in runPublicLiteScan, so it is the scan-finished time.
    scannedAt: (lite.updatedAt ?? lite.createdAt)?.toISOString() ?? null,
    measured: pass + warn + fail + inconclusive,
    pass,
    warn,
    fail,
    inconclusive,
    categories,
    triage: triage(checks),
    enquired: lite.emailCaptured,
    errorMessage: lite.errorMessage,
  };
}

/**
 * Markdown representation of the same report.
 *
 * Served from the same canonical URL under `Accept: text/markdown`, so an agent
 * reading the page gets structured text instead of scraping the HTML — and gets
 * exactly what a human sees, because both come from `getPublicReport`.
 */
export function renderReportMarkdown(r: PublicReport): string {
  const lines: string[] = [
    `# Pulse report for ${r.targetHost}`,
    ``,
    `Score: ${r.score ?? "—"}/100 — ${r.band}`,
    r.scannedAt ? `Scanned: ${r.scannedAt}` : "",
    r.techStack.length > 0 ? `Detected stack: ${r.techStack.join(", ")}` : "",
    ``,
    `${r.measured} checks were measured — ${r.pass} passed, ${r.warn} warnings, ${r.fail} failures`
      + (r.inconclusive > 0 ? `, ${r.inconclusive} inconclusive` : "")
      + `. ${r.triage.notEstablished.length} could not be established (listed below).`,
    ``,
  ];

  if (r.triage.actionable.length > 0) {
    lines.push(`## What to fix (${r.triage.actionable.length})`, ``);
    lines.push(`Ranked worst-first by severity and certainty.`, ``);
    r.triage.actionable.forEach((f, i) => {
      lines.push(`### ${i + 1}. ${f.label}`, ``);
      lines.push(`- Priority: ${f.tier}`);
      lines.push(`- Result: ${f.status}`);
      lines.push(`- Category: ${f.category}`);
      if (f.detail) lines.push(`- Evidence: ${f.detail}`);
      lines.push(``);
    });
  } else {
    lines.push(`## What to fix`, ``, `Nothing reached the actionable threshold on this scan.`, ``);
  }

  if (r.triage.advisoryCount > 0) {
    const byCat = r.triage.advisoryByCategory.slice(0, 6).map((a) => `${a.category} (${a.count})`).join(", ");
    lines.push(
      `## Advisory`,
      ``,
      `${r.triage.advisoryCount} further lower-priority checks did not pass. `
        + `Largest groups: ${byCat}. These are included in the in-depth review.`,
      ``,
    );
  }

  if (r.triage.notEstablished.length > 0) {
    lines.push(`## Could not be established (${r.triage.notEstablished.length})`, ``);
    lines.push(
      `These are neither passes nor failures — the scan could not reach a verdict, and `
        + `they are excluded from the score rather than counted either way.`,
      ``,
    );
    for (const n of r.triage.notEstablished.slice(0, 40)) {
      lines.push(`- **${n.label}** — ${n.reason}`);
    }
    if (r.triage.notEstablished.length > 40) {
      lines.push(`- …and ${r.triage.notEstablished.length - 40} more.`);
    }
    lines.push(``);
  }

  lines.push(
    `## Scope`,
    ``,
    `This is an unauthenticated scan of a single public URL at one point in time. It `
      + `inspects responses, headers, HTML and DNS; it does not sign in, exercise payments, `
      + `attempt authorisation, or run the site's JavaScript. Anything requiring a repository, `
      + `a session or a rendered page is reported above as not established rather than guessed.`,
    ``,
    `Produced by Gitwork Pulse. The in-depth review — what these findings mean, the order to `
      + `address them in, and an implementation brief — is available on request.`,
    ``,
  );

  return lines.filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");
}
