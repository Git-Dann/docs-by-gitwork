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
import { rankFindings } from "@/server/pulse-checks/priority";
import { recordScanInCorpus } from "./corpus";
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
  /**
   * The triaged report. FREE and always present — the facts are not the gate.
   * What is gated is the AI interpretation ("what this means", the prioritised
   * roadmap, the fix brief) and the P3 advisory tail, which is where both the
   * token cost and the expertise actually sit.
   */
  triage: PublicTriage;
  /**
   * Full per-check array. Retained for the in-depth view; still gated, because
   * this is the ~960-row tail rather than the report.
   */
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

/** A finding as shown to the public — evidence included, no interpretation. */
export interface PublicFinding {
  checkKey: string;
  category: string;
  label: string;
  status: string;
  /** What we actually observed. Never an LLM paraphrase. */
  detail: string;
  tier: "P1" | "P2";
}

/** A check that did not reach a verdict, and why. Shown FREE — this is the differentiator. */
export interface PublicNotEstablished {
  checkKey: string;
  category: string;
  label: string;
  reason: string;
}

export interface PublicTriage {
  /** P1/P2 — the defensible, actionable report. Free, in full, with evidence. */
  actionable: PublicFinding[];
  /** P3 advisory count. The long tail belongs to the in-depth review. */
  advisoryCount: number;
  advisoryByCategory: { category: string; count: number }[];
  /** Could not be established, with reasons. Free. */
  notEstablished: PublicNotEstablished[];
}

/**
 * Split a full scan into what a stranger should see for free.
 *
 * ⚠️ Measured on real sites BEFORE designing this:
 *
 *   site                        score  FAIL  WARN   P1+P2    P3
 *   example.com (blank page)       72     5   716       -  ~700
 *   gitwork.co.uk                  71     3   635       -  ~630
 *   stripe.com                     90     2   603      14   591
 *
 * stripe.com — one of the best engineering organisations on the internet — emits
 * 603 warnings, of which 588 are LOW severity, 591 are P3, and 395 already do not
 * score at all. A number that barely moves between a blank placeholder (716) and
 * Stripe (603) is not a signal about the site; it is an artefact of carrying ~960
 * checks, most of which are advisory by nature.
 *
 * So "show everything" would be a wall of ~600 yellow rows on every site including
 * excellent ones — worse than useless, because it would discredit the score above
 * it. `rankFindings` already grades severity × certainty × category weight
 * correctly (verified: Stripe's top 12 are privacy policy, terms, http_redirect,
 * permissions_policy, secure_cookie_attributes, cors_policy, COEP/CORP and
 * rate-limit headers — every one real and defensible). The report simply never
 * used it.
 *
 * Free therefore means the TRIAGED answer — typically 5–20 items with evidence —
 * plus an honest count of the advisory tail and an honest list of what could not
 * be established. That is more valuable than the wall, not less, which is exactly
 * what makes gating the interpretation fair rather than mean.
 */
export function triage(checks: PulseScanCheckInput[]): PublicTriage {
  const actionable: PublicFinding[] = [];
  let advisoryCount = 0;
  const advisoryCats = new Map<string, number>();

  for (const { check, priority } of rankFindings(checks)) {
    if (priority.tier === "P1" || priority.tier === "P2") {
      actionable.push({
        checkKey: check.checkKey,
        category: check.category,
        label: check.label,
        status: check.status,
        detail: check.detail ?? "",
        tier: priority.tier,
      });
    } else if (priority.tier === "P3") {
      advisoryCount++;
      advisoryCats.set(check.category, (advisoryCats.get(check.category) ?? 0) + 1);
    }
  }

  // Only checks that say WHY. A bare SKIPPED with no reason is not informative, and
  // shipping it would recreate the silence this section exists to remove.
  const notEstablished: PublicNotEstablished[] = checks
    .filter((c) =>
      (c.status === "SKIPPED" || c.status === "NOT_APPLICABLE" || UNRESOLVED_STATUSES.has(c.status))
      && (c.detail ?? "").trim().length > 0,
    )
    .map((c) => ({
      checkKey: c.checkKey,
      category: c.category,
      label: c.label,
      reason: (c.detail ?? "").trim(),
    }));

  return {
    actionable,
    advisoryCount,
    advisoryByCategory: [...advisoryCats.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    notEstablished,
  };
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

    // Fold this scan into the anonymous corpus BEFORE anything can prune the raw row.
    // Done here rather than in the reconcile cron on purpose: several crons in this
    // deployment have never run, and a corpus that depends on one stays empty. Holds
    // no URL, host, IP or email — see corpus.ts.
    // segment: null → the all-segments row. `LiteScanResult` does not surface the
    // resolved project shape, and recording a GUESSED segment would be worse than
    // recording none — a percentile is only meaningful if the cohort is real. The
    // column and the widening logic are in place for when the shape is threaded
    // through; until then every scan lands in the honest cross-segment bucket.
    void recordScanInCorpus({ score: result.healthScore, segment: null }).catch(() => {});

    // Email is now OPTIONAL, so a lead exists only when the visitor asked for the
    // in-depth review — either up front or later via the enquiry endpoint. This is
    // where the visitor + internal notifications fire, with real results.
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
