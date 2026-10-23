/**
 * Code health in plain English, for the people who read a Pulse report and are not
 * developers: account managers, founders, the client. Every sentence is built from a
 * number in the report, so the summary can never say something the figures below it do
 * not. No AI, no jargon: "complexity", "cycle" and "bus factor" never appear here.
 */

import type { CodeHealthReport } from "@/types/code-health";
import type { BenchmarkComparison } from "@/server/code-health/benchmark";
import { byUrgency, workItemsFor, type PortfolioRepo, type WorkItem } from "@/lib/code-portfolio";
import { actionPlan, type PlanStep } from "@/lib/plain-impact";

export type SummaryTone = "good" | "watch" | "bad";

export interface SummaryLine {
  tone: SummaryTone;
  text: string;
}

export interface PlainSummary {
  /** One sentence a non-developer can repeat in a meeting. */
  headline: string;
  tone: SummaryTone;
  lines: SummaryLine[];
  /** What to do, in order, with time and benefit: at most five steps. Empty when nothing stands out. */
  plan: PlanStep[];
  /** Days, following the plan, until most (80%) of the measured risk is gone. */
  daysToMost: number | null;
}

const n = (x: number) => x.toLocaleString("en-GB");
const plural = (count: number, one: string, many: string) => `${n(count)} ${count === 1 ? one : many}`;

/** Days as people say them: "about half a day", "about 3 days", "about 14 weeks". */
export function humanDays(days: number, opts: { short?: boolean } = {}): string {
  if (days <= 0.5) return "about half a day";
  if (days < 1.5) return "about a day";
  if (days < 15) return `about ${Math.round(days)} days`;
  return `about ${Math.round(days / 5)} weeks${opts.short ? "" : " of one developer's time"}`;
}

/** What the benchmark position means, in words: never a percentile. */
export function comparisonWords(betterThan: number, total: number): string {
  const share = total ? betterThan / total : 0;
  if (share >= 0.75) return "simpler than most";
  if (share >= 0.45) return "about average";
  if (share >= 0.2) return "more complicated than most";
  return "more complicated than almost all";
}

export function summariseCodeHealth(report: CodeHealthReport, benchmark: BenchmarkComparison | null = null): PlainSummary {
  const lines: SummaryLine[] = [];
  const plan = actionPlan(workItemsFor(report));

  // Overall condition.
  const condition =
    report.band === "good" ? "in good shape" : report.band === "fair" ? "in fair shape, with some areas that will slow work down" : "in poor shape: changes will be slow and risky until it is tidied";
  const tone: SummaryTone = report.band === "good" ? "good" : report.band === "fair" ? "watch" : "bad";
  const headline = `The code is ${condition} (${report.score} out of 100).`;

  if (report.trend && report.trend.scoreDelta !== 0) {
    const up = report.trend.scoreDelta > 0;
    lines.push({
      tone: up ? "good" : "bad",
      text: `${up ? "Better" : "Worse"} than last time it was checked: ${up ? "up" : "down"} ${Math.abs(report.trend.scoreDelta)} points, with ${plural(report.trend.resolvedDebt, "problem", "problems")} fixed and ${plural(report.trend.newDebt, "new one", "new ones")}.`,
    });
  }

  // Security of the libraries it is built on.
  const deps = report.dependencies;
  if (deps?.status === "checked") {
    const serious = deps.counts.critical + deps.counts.high;
    if (deps.vulnerable.length === 0) {
      lines.push({ tone: "good", text: `None of the ${n(deps.packages)} outside libraries it uses has a known security hole.` });
    } else {
      lines.push({
        tone: serious > 0 ? "bad" : "watch",
        text:
          `${plural(deps.vulnerable.length, "outside library it uses has", "outside libraries it uses have")} a known security hole` +
          (serious > 0 ? `, ${n(serious)} of them serious` : "") +
          ". These are usually quick to fix: upgrade to the version the warning names.",
      });
    }
  } else if (deps) {
    lines.push({ tone: "watch", text: "Its outside libraries could not be checked for security holes, so nothing is claimed either way." });
  }

  // How hard it is to change.
  if (report.effort && report.effort.days >= 0.5) {
    lines.push({
      tone: report.effort.days > 40 ? "bad" : report.effort.days > 10 ? "watch" : "good",
      text: `Fixing every hard-to-change part would take ${humanDays(report.effort.days)}${
        plan.daysToMost !== null && plan.daysToMost < report.effort.days * 0.6
          ? `, but most of the risk is gone after the first ${humanDays(plan.daysToMost, { short: true }).replace(/^about /, "")}: the plan below puts that work first`
          : ""
      }. An estimate for planning, not a quote.`,
    });
  } else if (report.debt.length === 0) {
    lines.push({ tone: "good", text: "Nothing in it is complicated enough to slow developers down." });
  }

  // The best news in a big estimate is usually that one step does a lot of it: say so.
  const first = plan.steps[0];
  if (first && first.cumulativeShare >= 0.3 && first.days <= 10 && plan.steps.length > 1) {
    lines.push({
      tone: "good",
      text: `The first step alone, ${humanDays(first.days)} of work, removes about ${Math.round(first.cumulativeShare * 100)}% of the risk Pulse measured.`,
    });
  }

  const s = report.structure;
  if (s && s.cycleCount > 0) {
    lines.push({
      tone: s.filesInCycles >= 10 ? "bad" : "watch",
      text: `${plural(s.cycleCount, "group of files depends", "groups of files depend")} on each other in a loop (${plural(s.filesInCycles, "file", "files")}). A change to one can break the others, so those parts are slower and riskier to work on.`,
    });
  }

  // Knowledge concentrated in few people.
  const bus = report.history?.busFactor;
  if (bus === 1 && report.totals.loc >= 2_000) {
    lines.push({ tone: "bad", text: "One person wrote most of the code that changes. If they left, nobody would know it well: worth pairing a second developer on it." });
  } else if (bus === 2) {
    lines.push({ tone: "watch", text: "Two people wrote most of the code that changes, so knowledge of it is concentrated." });
  }

  // Against well-known projects.
  // One verdict from all four measures the comparison table shows, so the summary can never
  // say "simpler than most" above a row that says "more complicated than most".
  if (benchmark) {
    const keys = ["complexityPerKloc", "complexLocShare", "averageComplexity", "debtPerKloc"] as const;
    const total = benchmark.referenceCount;
    const avg = keys.reduce((sum, k) => sum + benchmark.metrics[k].betterThan + benchmark.metrics[k].ties / 2, 0) / keys.length;
    const words = comparisonWords(avg, total);
    lines.push({
      tone: avg / Math.max(1, total) >= 0.45 ? "good" : "watch",
      text: `Compared with ${total} well-known open-source projects measured the same way, it is ${words} overall.`,
    });
  }

  return { headline, tone, lines, plan: plan.steps, daysToMost: plan.daysToMost };
}

/** The portfolio in plain English: which repo needs attention, and what to do first. */
export function summarisePortfolio(repos: PortfolioRepo[], items: WorkItem[]): PlainSummary {
  if (repos.length === 0) return { headline: "No repository has been measured yet.", tone: "watch", lines: [], plan: [], daysToMost: null };
  const lines: SummaryLine[] = [];
  const first = [...repos].sort(byUrgency)[0];
  const poor = repos.filter((r) => r.band === "poor").length;
  const state =
    poor === 0
      ? `All ${plural(repos.length, "codebase is", "codebases are")} in fair or good shape.`
      : `${plural(poor, "of the codebases is", "of the codebases are")} in poor shape.`;
  const headline =
    first.urgency.rank >= 6
      ? `${state} Nothing needs urgent attention.`
      : `${state} First: ${first.repo}. ${first.urgency.reason}.`;

  const serious = repos.reduce((s, r) => s + (r.vulnerable ? r.vulnerable.critical + r.vulnerable.high : 0), 0);
  const seriousRepos = repos.filter((r) => r.vulnerable && r.vulnerable.critical + r.vulnerable.high > 0);
  if (serious > 0) {
    lines.push({ tone: "bad", text: `${plural(serious, "serious security hole", "serious security holes")} in outside libraries, in ${seriousRepos.map((r) => r.repo).join(", ")}. These come first: most are a quick upgrade.` });
  }
  const unchecked = repos.filter((r) => !r.vulnerable).length;
  if (unchecked > 0) lines.push({ tone: "watch", text: `${plural(unchecked, "codebase has", "codebases have")} not had its libraries checked yet. Scan it again to check them.` });

  const worse = repos.filter((r) => r.history.length >= 2 && r.history[r.history.length - 1].score < r.history[r.history.length - 2].score);
  if (worse.length > 0) lines.push({ tone: "bad", text: `Getting worse since the last check: ${worse.map((r) => r.repo).join(", ")}.` });

  const solo = repos.filter((r) => r.knowledgeRisk);
  if (solo.length > 0) lines.push({ tone: "bad", text: `Only one person really knows ${solo.map((r) => r.repo).join(", ")}. If they left, that code would be hard to pick up.` });

  const days = repos.reduce((s, r) => s + (r.debtDays ?? 0), 0);
  if (days > 0) lines.push({ tone: "watch", text: `Clearing every hard-to-change part across all of them would take ${humanDays(days)}. The plan below picks what matters most for the time you have.` });

  const plan = actionPlan(items, 5, { nameRepos: true });
  return { headline, tone: poor > 0 || serious > 0 ? "bad" : "watch", lines, plan: plan.steps, daysToMost: plan.daysToMost };
}
