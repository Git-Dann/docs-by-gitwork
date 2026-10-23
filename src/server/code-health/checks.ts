import { CATEGORIES } from "@/server/pulse-checks/categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import { THRESHOLDS } from "./rules";
import type { CodeHealthReport, DebtItem, DebtKind } from "@/types/code-health";

/**
 * The code-health measure as Pulse checks. Every one is a measurement of the whole
 * checkout, not a sample, so it is HIGH confidence, unless the measure was cut short or
 * a large share of the code could not be parsed, in which case it says so and drops to
 * MEDIUM. It never claims what it did not measure: there is no "dead code" check,
 * because finding dead code needs the whole program's call graph, which this does not
 * build.
 */

/** Sampled checks the full measure answers better. They are skipped when it succeeds. */
export const SUPERSEDED_BY_CODE_HEALTH = ["clean_file_size", "clean_nesting_depth"] as const;

const QUOTE = 5;

function where(d: DebtItem): string {
  return `${d.path}:${d.line} ${d.symbol}`;
}

function quote(items: DebtItem[]): string | undefined {
  if (items.length === 0) return undefined;
  const lines = items.slice(0, QUOTE).map((d) => `${where(d)} (${Object.entries(d.metrics).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  return lines.join("\n") + (items.length > QUOTE ? `\n…and ${items.length - QUOTE} more in the register.` : "");
}

function ofKind(report: CodeHealthReport, kind: DebtKind): DebtItem[] {
  return report.debt.filter((d) => d.kind === kind);
}

function confidenceOf(report: CodeHealthReport): Pick<PulseScanCheckInput, "confidence" | "confidenceReason"> {
  const c = report.coverage;
  const parsedShare = c.analysedFiles ? c.filesWithParseErrors / c.analysedFiles : 0;
  if (c.truncated) return { confidence: "MEDIUM", confidenceReason: "The measure stopped at its size or time limit, so part of the code was not read." };
  if (parsedShare > 0.25) return { confidence: "MEDIUM", confidenceReason: `${c.filesWithParseErrors} of ${c.analysedFiles} files used syntax the parser only partly understood.` };
  return { confidence: "HIGH", confidenceReason: "Measured from a full checkout of the repository, every supported source file." };
}

export function codeHealthChecks(report: CodeHealthReport): PulseScanCheckInput[] {
  const conf = confidenceOf(report);
  const base = { category: CATEGORIES.CODE_QUALITY, ...conf };
  const t = report.totals;
  const n = report.debtCounts;
  const commit = report.commit ? ` at commit ${report.commit.slice(0, 7)}` : "";

  if (t.files === 0) {
    return [{
      ...base,
      checkKey: "code_health_score",
      label: "Code health",
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail: report.coverage.unsupportedLanguages.length > 0
        ? `This repository's code is in ${report.coverage.unsupportedLanguages.join(", ")}, which the code-health measure cannot read yet. Nothing was measured, so nothing is claimed.`
        : "No source code in a supported language was found in this repository, so nothing was measured.",
    }];
  }

  const out: PulseScanCheckInput[] = [];

  out.push({
    ...base,
    checkKey: "code_health_score",
    label: "Code health",
    status: report.band === "good" ? "PASS" : report.band === "fair" ? "WARN" : "FAIL",
    detail:
      `Code health ${report.score}/100 (${report.band}) across ${t.loc.toLocaleString("en-GB")} lines of production code in ${t.files.toLocaleString("en-GB")} files${commit}. ` +
      `${Math.round(t.complexLocShare * 100)}% of the code sits in functions with ${THRESHOLDS.complexity.high} or more paths through them; ` +
      `the average function has a complexity of ${t.averageComplexity}. ` +
      (report.band === "good"
        ? "Most of the code is in small, simple pieces that are cheap to change."
        : "The register lists the specific functions and classes that make this code slower and riskier to change, worst first."),
    evidence: report.languages.map((l) => `${l.language}: ${l.files} files, ${l.loc.toLocaleString("en-GB")} lines`).join("\n"),
  });

  const complex = ofKind(report, "complex_function");
  const worst = complex.filter((d) => d.severity !== "moderate");
  out.push({
    ...base,
    checkKey: "code_health_complex_functions",
    label: "Functions are simple enough to test",
    status: complex.some((d) => d.severity === "very_high") || t.complexLocShare > 0.15 ? "FAIL" : worst.length > 0 || n.complex_function > 0 ? "WARN" : "PASS",
    detail: n.complex_function === 0
      ? `No function has a cyclomatic complexity of ${THRESHOLDS.complexity.moderate} or more.`
      : `${n.complex_function} function(s) have a cyclomatic complexity of ${THRESHOLDS.complexity.moderate} or more, ${worst.length} of them ${THRESHOLDS.complexity.high} or more. ` +
        `Complexity counts the independent paths through a function, so it is the least number of tests needed to cover it. ` +
        `Above 20 it is rarely fully tested, and changes there are where regressions come from. Split by decision, not by line.`,
    evidence: quote(complex),
  });

  const long = ofKind(report, "long_function");
  out.push({
    ...base,
    checkKey: "code_health_long_functions",
    label: "Functions are a readable length",
    status: long.some((d) => d.severity === "very_high") ? "FAIL" : n.long_function > 0 ? "WARN" : "PASS",
    detail: n.long_function === 0
      ? `No function is longer than ${THRESHOLDS.functionLoc.moderate - 1} lines of code.`
      : `${n.long_function} function(s) run past ${THRESHOLDS.functionLoc.moderate - 1} lines of code. A long function is usually several jobs in one, so a change to one job risks the others.`,
    evidence: quote(long),
  });

  const classes = ofKind(report, "large_class");
  out.push({
    ...base,
    checkKey: "code_health_large_classes",
    label: "Classes have one clear job",
    status: classes.some((d) => d.severity === "very_high") ? "FAIL" : n.large_class > 0 ? "WARN" : "PASS",
    detail: n.large_class === 0
      ? `No class has a combined method complexity of ${THRESHOLDS.classWmc.high} or more, or ${THRESHOLDS.classLoc.high} or more lines.`
      : `${n.large_class} class(es) have a combined method complexity of ${THRESHOLDS.classWmc.high}+ or ${THRESHOLDS.classLoc.high}+ lines. ` +
        `Classes that size usually hold several responsibilities that change for different reasons, so unrelated changes collide in them.`,
    evidence: quote(classes),
  });

  const files = ofKind(report, "large_file");
  out.push({
    ...base,
    checkKey: "code_health_large_files",
    label: "Source files stay a manageable size",
    status: files.some((d) => d.severity !== "moderate") ? "WARN" : "PASS",
    detail: n.large_file === 0
      ? `No source file has more than ${THRESHOLDS.fileLoc.moderate - 1} lines of code.`
      : `${n.large_file} source file(s) have ${THRESHOLDS.fileLoc.moderate}+ lines of code. Large files attract merge conflicts and are hard to find your way around.`,
    evidence: quote(files),
  });

  const params = ofKind(report, "long_parameter_list");
  out.push({
    ...base,
    checkKey: "code_health_parameter_lists",
    label: "Functions take few parameters",
    status: n.long_parameter_list > 0 ? "WARN" : "PASS",
    detail: n.long_parameter_list === 0
      ? `No function takes ${THRESHOLDS.params.moderate} or more parameters.`
      : `${n.long_parameter_list} function(s) take ${THRESHOLDS.params.moderate} or more parameters, which makes every call easy to get wrong. Group related values into one object.`,
    evidence: quote(params),
  });

  const nesting = ofKind(report, "deep_nesting");
  out.push({
    ...base,
    checkKey: "code_health_nesting",
    label: "Logic is not deeply nested (full measure)",
    status: nesting.some((d) => d.severity === "very_high") ? "FAIL" : n.deep_nesting > 0 ? "WARN" : "PASS",
    detail: n.deep_nesting === 0
      ? `No function nests control flow ${THRESHOLDS.nesting.moderate} or more levels deep.`
      : `${n.deep_nesting} function(s) nest control flow ${THRESHOLDS.nesting.moderate}+ levels deep. An early return or one extracted function usually removes two levels at a time.`,
    evidence: quote(nesting),
  });

  return out;
}

/** The note shown when the full measure could not run, so its absence is never read as a pass. */
export function codeHealthUnavailable(reason: string): PulseScanCheckInput {
  return {
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "code_health_score",
    label: "Code health",
    status: "INCONCLUSIVE",
    confidence: "LOW",
    detail: `The full code-health measure did not run: ${reason} The code-quality checks above are from a sample of files instead.`,
  };
}
