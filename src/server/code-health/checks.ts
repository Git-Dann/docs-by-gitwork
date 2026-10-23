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

/**
 * Sampled checks the full measure answers better. They are held back while it runs and
 * dropped only for the parts it actually answered (`answeredByCodeHealth`), so a scan never
 * carries two answers to one question and never loses the sampled one when the full one failed.
 */
export const SUPERSEDED_BY_CODE_HEALTH = ["clean_file_size", "clean_nesting_depth", "dependency_vulnerabilities"] as const;

/**
 * Which superseded checks this report really answers. Dependabot's answer (read through the
 * GitHub API, often unreadable with our token) is replaced only when the lockfile audit ran
 * against OSV; if it could not, Dependabot's answer stays.
 */
export function answeredByCodeHealth(report: CodeHealthReport | null): Set<string> {
  if (!report) return new Set();
  const out = new Set<string>(["clean_file_size", "clean_nesting_depth"]);
  if (report.dependencies?.status === "checked") out.add("dependency_vulnerabilities");
  return out;
}

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

/** The import graph as checks. Absent on reports without a structure section. */
export function structureChecks(report: CodeHealthReport): PulseScanCheckInput[] {
  if (report.structure === undefined) return [];
  const conf = confidenceOf(report);
  const base = { category: CATEGORIES.CODE_QUALITY, ...conf };
  const s = report.structure;
  if (s === null) {
    return [{
      ...base,
      checkKey: "code_health_import_cycles",
      label: "No import cycles between files",
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail: "The imports between this repository's files could not be mapped (its language imports whole modules rather than files, or nothing internal was imported), so nothing is claimed about cycles.",
    }];
  }
  const partial = s.unresolvedShare > 0.3
    ? { confidence: "MEDIUM" as const, confidenceReason: `${Math.round(s.unresolvedShare * 100)}% of internal-looking imports could not be traced to a file, so the graph is partial.` }
    : {};
  const largest = s.cycles[0]?.files.length ?? 0;
  const out: PulseScanCheckInput[] = [{
    ...base,
    ...partial,
    checkKey: "code_health_import_cycles",
    label: "No import cycles between files",
    status: s.cycleCount === 0 ? "PASS" : largest >= 10 || s.filesInCycles >= Math.max(10, s.modules * 0.1) ? "FAIL" : "WARN",
    detail: s.cycleCount === 0
      ? `Mapped ${s.edges.toLocaleString("en-GB")} imports between ${s.modules.toLocaleString("en-GB")} files: none of them import each other in a loop.`
      : `${s.cycleCount} import ${s.cycleCount === 1 ? "cycle" : "cycles"}, catching ${s.filesInCycles} files; the largest loops through ${largest}. ` +
        "Files in a cycle can only be changed, tested and reused together, and the cycle grows as code is added. Cutting one import, usually by moving a shared type or function out, breaks it.",
    evidence: s.cycles.slice(0, QUOTE).map((c) => c.path.join(" → ")).join("\n") || undefined,
  }];
  out.push({
    ...base,
    ...partial,
    checkKey: "code_health_hub_files",
    label: "No complex file that everything depends on",
    status: s.hubs.length === 0 ? "PASS" : "WARN",
    detail: s.hubs.length === 0
      ? "No file is both depended on by many others and complex, so changes stay local."
      : `${s.hubs.length} ${s.hubs.length === 1 ? "file is" : "files are"} imported by many others and complex at the same time, so a change there ripples furthest and is the likeliest to break something far away. A small, stable interface in front of each keeps callers out of the detail.`,
    evidence: s.hubs.slice(0, QUOTE).map((h) => `${h.path}: used by ${h.fanIn} files, complexity ${h.complexity}`).join("\n") || undefined,
  });
  return out;
}

/** The lockfile audit as one check. Absent on reports without a dependencies section. */
export function dependencyChecks(report: CodeHealthReport): PulseScanCheckInput[] {
  const d = report.dependencies;
  if (d === undefined) return [];
  const base = { category: CATEGORIES.SECURITY, checkKey: "dependency_osv_vulnerabilities", label: "Libraries have no known vulnerabilities" } as const;
  if (d === null || d.status !== "checked") {
    return [{
      ...base,
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail: `The libraries were not checked: ${d?.reason ?? "the audit did not run."} Nothing is claimed about them either way.`,
    }];
  }
  const bad = d.counts.critical + d.counts.high;
  return [{
    ...base,
    status: bad > 0 ? "FAIL" : d.vulnerable.length > 0 ? "WARN" : "PASS",
    confidence: "HIGH",
    confidenceReason: "Exact versions read from the lockfile, checked against the OSV vulnerability database.",
    detail: d.vulnerable.length === 0
      ? `${d.packages.toLocaleString("en-GB")} libraries pinned in ${d.lockfiles.map((l) => l.path).join(", ")}: none has a published vulnerability at the version used.`
      : `${d.vulnerable.length} of ${d.packages.toLocaleString("en-GB")} pinned libraries have published vulnerabilities at the version used ` +
        `(${(["critical", "high", "moderate", "low", "unknown"] as const).filter((k) => d.counts[k] > 0).map((k) => `${d.counts[k]} ${k}`).join(", ")}). ` +
        "Most are fixed by upgrading to the version each advisory names.",
    evidence: d.vulnerable.slice(0, QUOTE).map((p) => `${p.name} ${p.version} (${p.severity}): ${p.advisories.map((a) => a.aliases.find((x) => x.startsWith("CVE-")) ?? a.id).slice(0, 3).join(", ")}`).join("\n") || undefined,
  }];
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
