/**
 * Public lite-scan runner + view shaping.
 *
 * Anonymous scans from the /embed/pulse widget run the AI-free core and persist
 * results onto the standalone PulseLiteScan row (checks stored inline as JSON).
 * A single throttled flusher writes snapshots while the scan runs so the widget
 * can fill category tiles live, then a final authoritative write lands the
 * de-duplicated, ordered set.
 */

import { prisma } from "@/lib/prisma";
import { runLiteScan } from "./run-lite-scan";
import { notifyLeadOfScanResult } from "./leads";
import type { PulseScanCheckInput } from "@/types/pulse";

export interface LiteCategorySummary {
  category: string;
  pass: number;
  warn: number;
  fail: number;
}

export interface PublicScanView {
  id: string;
  status: string;
  targetUrl: string;
  healthScore: number | null;
  techStack: string[];
  totalChecks: number;
  pass: number;
  warn: number;
  fail: number;
  categories: LiteCategorySummary[];
  emailCaptured: boolean;
  /** Per-check detail — only present once an email has been captured (gated). */
  checks: PulseScanCheckInput[] | null;
  errorMessage: string | null;
}

/** Per-category + overall PASS/WARN/FAIL counts (SKIPPED excluded). Free to show. */
export function summarise(checks: PulseScanCheckInput[]): {
  categories: LiteCategorySummary[];
  pass: number;
  warn: number;
  fail: number;
} {
  const byCat = new Map<string, LiteCategorySummary>();
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const c of checks) {
    if (c.status === "SKIPPED") continue;
    const s = byCat.get(c.category) ?? { category: c.category, pass: 0, warn: 0, fail: 0 };
    if (c.status === "PASS") { s.pass++; pass++; }
    else if (c.status === "WARN") { s.warn++; warn++; }
    else if (c.status === "FAIL") { s.fail++; fail++; }
    byCat.set(c.category, s);
  }
  const categories = [...byCat.values()].sort((a, b) => (b.fail + b.warn) - (a.fail + a.warn));
  return { categories, pass, warn, fail };
}

export async function runPublicLiteScan(liteScanId: string, url: string): Promise<void> {
  const acc: PulseScanCheckInput[] = [];
  let dirty = false;
  let writing = false;

  // Single throttled writer → no read-modify-write races on the JSON column.
  const flush = async () => {
    if (!dirty || writing) return;
    writing = true;
    dirty = false;
    try {
      await prisma.pulseLiteScan.update({
        where: { id: liteScanId },
        data: { checks: acc as unknown as object },
      });
    } catch {
      /* transient — next flush retries */
    } finally {
      writing = false;
    }
  };
  const flusher = setInterval(() => { void flush(); }, 1500);

  try {
    const result = await runLiteScan({
      inputType: "URL",
      url,
      includePageSpeed: false, // public path stays fast + avoids PSI quota pressure
      skipUrlGuard: true, // already validated at the POST boundary
      onChecks: (batch) => { acc.push(...batch); dirty = true; },
    });
    clearInterval(flusher);
    const updated = await prisma.pulseLiteScan.update({
      where: { id: liteScanId },
      data: {
        status: "COMPLETED",
        checks: result.checks as unknown as object,
        healthScore: result.healthScore,
        techStack: result.techStack as unknown as object,
      },
      select: { leadId: true },
    });
    // Email is required up front now, so a lead almost always exists by completion —
    // this is where the visitor + internal notifications actually fire, with real results.
    if (updated.leadId) void notifyLeadOfScanResult(updated.leadId).catch(() => {});
  } catch (e) {
    clearInterval(flusher);
    await prisma.pulseLiteScan
      .update({
        where: { id: liteScanId },
        data: { status: "FAILED", errorMessage: e instanceof Error ? e.message : "Scan failed" },
      })
      .catch(() => {});
  }
}
