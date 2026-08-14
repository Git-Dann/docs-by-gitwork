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
  /** Ran, but could not establish an answer. Counted so a category is never shown as 0/0/0. */
  inconclusive: number;
}

/**
 * Statuses that mean "we asked and could not answer". Kept out of pass/warn/fail — an
 * inconclusive control is not a pass — but counted, because dropping them silently is how a
 * scan that measured three quarters of a page reports as if it measured all of it.
 */
const UNRESOLVED_STATUSES = new Set(["INCONCLUSIVE", "ERROR", "NOT_TESTED", "EVIDENCE_REQUIRED"]);

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
  /** Controls that ran without reaching a verdict — most often a client-rendered page whose
   *  content is not in the static HTML. Shown to the visitor so the score is read in context. */
  inconclusive: number;
  categories: LiteCategorySummary[];
  emailCaptured: boolean;
  /** Per-check detail — only present once an email has been captured (gated). */
  checks: PulseScanCheckInput[] | null;
  errorMessage: string | null;
}

/**
 * Per-category + overall counts. SKIPPED and NOT_APPLICABLE are excluded entirely — the control
 * did not apply, so there is nothing to report. Everything else is counted somewhere.
 *
 * ⚠️ An unresolved status must never fall through into no bucket at all. It used to: only SKIPPED
 * was excluded, so an INCONCLUSIVE check was silently dropped from pass/warn/fail while still
 * counting toward `totalChecks` and still creating an all-zero category row. That was tolerable at
 * ~5 per scan and stopped being so the moment client-rendered pages started reclassifying ~24 SEO
 * controls — on the exact population this widget is aimed at.
 */
export function summarise(checks: PulseScanCheckInput[]): {
  categories: LiteCategorySummary[];
  pass: number;
  warn: number;
  fail: number;
  inconclusive: number;
} {
  const byCat = new Map<string, LiteCategorySummary>();
  let pass = 0;
  let warn = 0;
  let fail = 0;
  let inconclusive = 0;
  for (const c of checks) {
    if (c.status === "SKIPPED" || c.status === "NOT_APPLICABLE") continue;
    const s = byCat.get(c.category)
      ?? { category: c.category, pass: 0, warn: 0, fail: 0, inconclusive: 0 };
    if (c.status === "PASS") { s.pass++; pass++; }
    else if (c.status === "WARN") { s.warn++; warn++; }
    else if (c.status === "FAIL") { s.fail++; fail++; }
    else if (UNRESOLVED_STATUSES.has(c.status)) { s.inconclusive++; inconclusive++; }
    else continue; // a status nobody has taught this function about — do not invent a bucket
    byCat.set(c.category, s);
  }
  const categories = [...byCat.values()].sort((a, b) => (b.fail + b.warn) - (a.fail + a.warn));
  return { categories, pass, warn, fail, inconclusive };
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
