// ─────────────────────────────────────────────────────────────────────────────
// CODE CLEANLINESS — structural debt, measured rather than asserted.
//
// WHY THIS EXISTS. Pulse graded security, compliance and platform correctness,
// and treated maintainability as a checklist: is there a README, a linter, a CI
// file. Those are facts ABOUT a repo, not facts about its code. A project can
// have all three and still be a 4,000-line file nobody dares change.
//
// The prevalences below come from a 549-repo study of self-identified AI/vibe-
// coded projects (ogbuilds.ai, July 2026) — deterministic rules, re-runnable:
//
//     commented-out code    59.2%        cross-file duplication   46.4%
//     file past ~600 lines  56.1%        in-file repetition       41.2%
//     deep nesting          53.6%        file past ~1,200 lines   33.0%
//
// On the substantive subset (467 repos with 15+ files) it is worse: 70% dead
// code, 66% commented-out code, 63% duplicated logic. Pulse could see none of it.
//
// THIS IS THE PILLAR THAT PREDICTS COST, NOT RISK. A security finding is a
// question of exposure; these are a question of what the next change costs. For
// an agency that inherits client codebases, that is the more useful number more
// often — and it is the one nobody measures before quoting.
//
// EVERY THRESHOLD IS NAMED AND JUSTIFIED. A cleanliness check with an arbitrary
// limit is an opinion with a number attached; each constant below says what it is
// for and what happens either side of it. All are per-file or per-1,000-lines, so
// a large codebase is not penalised for being large (the §34.5 lesson).
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";
import { isVendoredPath, stripCStyleComments, sampleCoverage } from "./native-mobile";

/**
 * File-length bands.
 *
 * 600 lines is where a file stops fitting in a reviewer's head — you can no
 * longer hold what else is in it while changing one part, so changes get made
 * locally and defensively. 1,200 is where it stops fitting in a review at all and
 * becomes a place people append to rather than edit.
 *
 * These are the study's own bands, kept deliberately so the numbers are
 * comparable rather than being ours-only.
 */
const LARGE_FILE_LINES = 600;
const HUGE_FILE_LINES = 1200;

/**
 * Nesting depth at which a function stops being readable.
 *
 * At 5 levels the reader is tracking five simultaneous conditions to know why a
 * line runs. This is also the level at which most style guides stop, and where
 * an early return or an extracted function is nearly always available.
 */
const DEEP_NESTING = 5;

/** Duplicate-block window: 6 normalised lines. Short enough to catch a copied */
/*  handler, long enough that a shared import block or a switch arm is not a hit. */
const DUP_WINDOW = 6;

/** Densities need a denominator — below this a file SKIPs rather than guessing. */
const MIN_LINES_FOR_DENSITY = 200;

/** Findings quote at most this many files, so one rule cannot flood the report. */
const MAX_SITES_QUOTED = 5;

const SOURCE_RE = /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|php|go|java|kt|cs|swift|dart)$/i;

/** Generated or vendored output — real code, but not the team's to maintain. */
function isGenerated(path: string): boolean {
  return (
    isVendoredPath(path) ||
    /\.(min|bundle|generated|g|freezed|pb)\.[a-z]+$/i.test(path) ||
    /(^|\/)(dist|build|out|coverage|__generated__|migrations)\//i.test(path) ||
    /\.(d\.ts|lock)$/i.test(path)
  );
}

interface CleanContext {
  /** path → raw text, for the files we sampled (generated output excluded). */
  files: Map<string, string>;
  /** Total non-generated source lines in the sample. */
  lines: number;
  /** Sampled fraction of the repo's source files (0–1). */
  coverage: number;
  paths: string[];
}

function buildContext(snapshot: RepoSnapshot): CleanContext {
  const sourcePaths = snapshot.paths.filter((p) => SOURCE_RE.test(p) && !isGenerated(p));
  const files = new Map<string, string>();
  for (const [path, text] of snapshot.files) {
    if (SOURCE_RE.test(path) && !isGenerated(path)) files.set(path, text);
  }
  let lines = 0;
  for (const text of files.values()) lines += text.split("\n").length;
  return {
    files,
    lines,
    coverage: sampleCoverage(files.size, sourcePaths.length, snapshot.truncated),
    paths: snapshot.paths,
  };
}

function quote(paths: string[]): string {
  const shown = paths.slice(0, MAX_SITES_QUOTED);
  const more = paths.length - shown.length;
  return shown.join(", ") + (more > 0 ? ` (+${more} more)` : "");
}

// ── Pure analysers, each testable on its own ────────────────────────────────

/**
 * Lines that are commented-out CODE rather than prose.
 *
 * The distinction is the whole check. A comment explaining why is the most
 * valuable thing in a file; a commented-out block is a decision someone did not
 * make, left for the next reader to re-litigate. So a line only counts when what
 * follows the marker looks like code: it ends in a statement terminator or an
 * opening brace, or it is an assignment, call or control-flow keyword.
 */
export function commentedOutCodeLines(text: string): number {
  let count = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const m = /^(\/\/|#)\s*(.+)$/.exec(line);
    if (!m) continue;
    const body = m[2].trim();
    // Doc-comment markers and prose punctuation are strong "this is writing" signals.
    if (/^(TODO|FIXME|NOTE|HACK|XXX|@|eslint|prettier|type:|noqa|pylint)/i.test(body)) continue;
    if (body.length < 4) continue;
    const looksLikeCode =
      /[;{}]$/.test(body) ||
      /^(if|for|while|return|const|let|var|function|def|class|import|from|await|async|print|console\.|await )/.test(body) ||
      /^[\w.$[\]]+\s*=[^=]/.test(body) ||
      /^[\w.$]+\([^)]*\)\s*;?$/.test(body);
    if (looksLikeCode) count++;
  }
  return count;
}

/**
 * Maximum block-nesting depth in a file.
 *
 * Brace-counting for C-family languages; for Python, indentation depth. Strings
 * and comments are stripped first so a brace inside a template literal does not
 * inflate the reading — which it otherwise does, badly, in JSX.
 */
export function maxNestingDepth(text: string, path: string): number {
  const isIndentBased = /\.(py|rb)$/i.test(path);
  const clean = stripCStyleComments(text);

  if (isIndentBased) {
    let max = 0;
    for (const line of clean.split("\n")) {
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const indent = line.length - line.trimStart().length;
      // 4 spaces per level is the overwhelming convention; tabs count as one.
      max = Math.max(max, Math.floor(indent / 4) + (line.startsWith("\t") ? line.match(/^\t+/)![0].length : 0));
    }
    return max;
  }

  let depth = 0;
  let max = 0;
  let inString: string | null = null;
  // Only BLOCK braces are pushed; an object-literal brace is matched by a pop
  // that must not decrement the real depth, so the stack records which is which.
  const stack: boolean[] = [];

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inString) {
      if (c === "\\") { i++; continue; }
      if (c === inString) inString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inString = c; continue; }

    if (c === "{") {
      const isBlock = opensABlock(clean, i);
      stack.push(isBlock);
      if (isBlock) { depth++; max = Math.max(max, depth); }
    } else if (c === "}") {
      if (stack.pop() === true) depth = Math.max(0, depth - 1);
    }
  }
  return max;
}

/**
 * Is the `{` at `index` a control-flow or function BLOCK, rather than an object
 * literal?
 *
 * This distinction is the difference between a useful metric and a noisy one.
 * Counting every brace makes any config-heavy file read as deeply nested — an AWS
 * CDK stack, a webpack config, an SDK call with nested options objects — and it
 * makes every React component with nested style props look like tangled logic.
 * Validated against a real repository, both files this check flagged were exactly
 * that shape: nested CONFIG, with three levels of actual control flow.
 *
 * The check's own wording promises "a reader is tracking five or more
 * simultaneous CONDITIONS", so conditions are what it must count.
 *
 * A brace opens a block when what precedes it is `)` (`if (…) {`, `for (…) {`,
 * `function f() {`), an arrow, or one of the bare block keywords.
 */
function opensABlock(source: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /\s/.test(source[i])) i--;
  if (i < 0) return false;
  if (source[i] === ")") return true;
  if (source[i] === ">" && source[i - 1] === "=") return true; // arrow function
  const word = /([A-Za-z_$]+)$/.exec(source.slice(Math.max(0, i - 20), i + 1))?.[1];
  return word !== undefined && /^(else|try|finally|do|abstract)$/.test(word);
}

/** Normalise a line for duplicate detection: no whitespace, no comments. */
function normaliseForDup(line: string): string {
  return line.replace(/\s+/g, "").trim();
}

export interface DuplicationReport {
  /** Windows appearing in two or more DIFFERENT files. */
  crossFile: number;
  /** Windows appearing more than once inside a single file. */
  inFile: number;
  /** Files involved in cross-file duplication. */
  files: string[];
}

/**
 * Duplicate-block detection by sliding-window hashing.
 *
 * Normalises each line (whitespace and comments removed), then hashes every
 * DUP_WINDOW-line window and looks for windows appearing more than once. This is
 * the standard approach and it is deterministic — the same repo always yields the
 * same number, which is what makes it safe to put in a score.
 *
 * Two deliberate exclusions, both learned from what produces false positives:
 * windows that are entirely import/require lines (every file in a codebase shares
 * those), and windows with fewer than 3 distinct normalised lines (a run of
 * closing braces, or a repeated `break;` in a switch, is not duplicated LOGIC).
 */
export function detectDuplication(files: Map<string, string>): DuplicationReport {
  const seen = new Map<string, Set<string>>();
  const inFileCounts = new Map<string, number>();

  for (const [path, text] of files) {
    const lines = stripCStyleComments(text)
      .split("\n")
      .map(normaliseForDup)
      .filter((l) => l.length > 0);
    const localSeen = new Set<string>();

    for (let i = 0; i + DUP_WINDOW <= lines.length; i++) {
      const window = lines.slice(i, i + DUP_WINDOW);
      if (window.every((l) => /^(import|from|require|using|#include|package)/.test(l))) continue;
      if (new Set(window).size < 3) continue;

      const key = window.join("");
      if (localSeen.has(key)) inFileCounts.set(path, (inFileCounts.get(path) ?? 0) + 1);
      localSeen.add(key);

      let owners = seen.get(key);
      if (!owners) { owners = new Set(); seen.set(key, owners); }
      owners.add(path);
    }
  }

  const crossFileKeys = [...seen.entries()].filter(([, owners]) => owners.size > 1);
  const involved = new Set<string>();
  for (const [, owners] of crossFileKeys) for (const o of owners) involved.add(o);

  return {
    crossFile: crossFileKeys.length,
    inFile: [...inFileCounts.values()].reduce((a, b) => a + b, 0),
    files: [...involved],
  };
}

// ── The family ──────────────────────────────────────────────────────────────

export function evaluateCleanlinessChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  if (!snapshot.accessible) return [];
  const ctx = buildContext(snapshot);
  // Nothing read — say nothing. A wall of passes over files we never fetched is
  // the "we could not look" → "it is fine" failure in its purest form.
  if (ctx.files.size === 0) return [];

  return [
    ...sizeChecks(ctx),
    ...complexityChecks(ctx),
    ...duplicationChecks(ctx),
    ...leftoverChecks(ctx),
    ...consistencyChecks(ctx),
  ];
}

// ── Structure & size ────────────────────────────────────────────────────────
function sizeChecks(ctx: CleanContext): PulseScanCheckInput[] {
  const large: string[] = [];
  const huge: string[] = [];
  for (const [path, text] of ctx.files) {
    const n = text.split("\n").length;
    if (n >= HUGE_FILE_LINES) huge.push(`${path} (${n.toLocaleString()} lines)`);
    else if (n >= LARGE_FILE_LINES) large.push(`${path} (${n} lines)`);
  }

  return [{
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "clean_file_size",
    label: "Files stay a readable length",
    status: huge.length > 0 ? "FAIL" : large.length > 0 ? "WARN" : "PASS",
    confidence: "HIGH",
    detail: huge.length > 0
      ? `${huge.length} file(s) exceed ${HUGE_FILE_LINES.toLocaleString()} lines${large.length > 0
          ? `, and ${large.length} more exceed ${LARGE_FILE_LINES}` : ""}. Past this size a file stops being edited ` +
        `and starts being appended to: nobody reads the whole thing before changing part of it, so the same logic ` +
        `gets re-implemented further down and the two copies drift. It is also where code review stops being real — ` +
        `a diff in a 2,000-line file gets approved on the diff alone. Split by responsibility, not by line count.`
      : large.length > 0
        ? `${large.length} file(s) exceed ${LARGE_FILE_LINES} lines. That is the point where a file no longer fits in ` +
          `a reviewer's head — you cannot hold what else is in it while changing one part, so changes get made ` +
          `defensively and locally. Worth splitting before it reaches ${HUGE_FILE_LINES.toLocaleString()}.`
        : `No file in the sample exceeds ${LARGE_FILE_LINES} lines.`,
    evidence: quote([...huge, ...large]) || undefined,
  }];
}

// ── Readability & complexity ────────────────────────────────────────────────
function complexityChecks(ctx: CleanContext): PulseScanCheckInput[] {
  const deep: string[] = [];
  for (const [path, text] of ctx.files) {
    const d = maxNestingDepth(text, path);
    if (d > DEEP_NESTING) deep.push(`${path} (depth ${d})`);
  }
  const ratio = ctx.files.size === 0 ? 0 : deep.length / ctx.files.size;

  return [{
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "clean_nesting_depth",
    label: "Logic is not deeply nested",
    status: ratio > 0.25 ? "FAIL" : deep.length > 0 ? "WARN" : "PASS",
    confidence: "HIGH",
    detail: deep.length === 0
      ? `No file in the sample nests deeper than ${DEEP_NESTING} levels.`
      : `${deep.length} of ${ctx.files.size} sampled file(s) nest deeper than ${DEEP_NESTING} levels ` +
        `(${Math.round(ratio * 100)}%). At that depth a reader is tracking five or more simultaneous conditions to ` +
        `know why a line runs, which is where "I'll just add another if" becomes the cheapest option and the ` +
        `structure degrades further. An early return or one extracted function usually removes two levels at a time.`,
    evidence: quote(deep) || undefined,
  }];
}

// ── Duplication ─────────────────────────────────────────────────────────────
function duplicationChecks(ctx: CleanContext): PulseScanCheckInput[] {
  const dup = detectDuplication(ctx.files);
  const checks: PulseScanCheckInput[] = [];

  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "clean_duplication_cross_file",
    label: "Logic is not copy-pasted between files",
    status: dup.crossFile > 20 ? "FAIL" : dup.crossFile > 0 ? "WARN" : "PASS",
    confidence: "MEDIUM",
    detail: dup.crossFile === 0
      ? `No blocks of ${DUP_WINDOW}+ lines appear in more than one file.`
      : `${dup.crossFile} block(s) of ${DUP_WINDOW}+ lines appear in more than one file, across ${dup.files.length} ` +
        `file(s). Duplicated logic is not a style problem — it is a correctness one with a delay on it: the next bug ` +
        `fix lands in one copy, the others keep the bug, and nothing tells you they exist. This is the single most ` +
        `expensive thing to inherit in a codebase, because the cost only appears when you change something.`,
    evidence: quote(dup.files) || undefined,
  });

  if (dup.inFile > 0) {
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "clean_duplication_in_file",
      label: "Blocks are not repeated within a file",
      status: dup.inFile > 15 ? "WARN" : "PASS",
      confidence: "MEDIUM",
      detail:
        `${dup.inFile} repeated block(s) of ${DUP_WINDOW}+ lines within single files. In-file repetition is usually ` +
        `the cheapest duplication to remove — the two copies are visible on one screen — and leaving it is what ` +
        `teaches the next contributor that copy-paste is how this codebase is extended.`,
    });
  }

  return checks;
}

// ── Dead code & leftovers ───────────────────────────────────────────────────
function leftoverChecks(ctx: CleanContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Commented-out code, per 1,000 lines — a raw count grows with any codebase.
  if (ctx.lines >= MIN_LINES_FOR_DENSITY) {
    let commented = 0;
    const worst: Array<{ path: string; n: number }> = [];
    for (const [path, text] of ctx.files) {
      const n = commentedOutCodeLines(text);
      commented += n;
      if (n > 0) worst.push({ path, n });
    }
    worst.sort((a, b) => b.n - a.n);
    const per1k = (commented / ctx.lines) * 1000;

    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "clean_commented_out_code",
      label: "No commented-out code left behind",
      status: per1k > 15 ? "FAIL" : per1k > 4 ? "WARN" : "PASS",
      confidence: "HIGH",
      detail: commented === 0
        ? `No commented-out code detected in the sample.`
        : `${commented} line(s) of commented-out code across ${ctx.lines.toLocaleString()} sampled lines ` +
          `(${per1k.toFixed(1)} per 1,000). This is distinct from comments that explain WHY, which are the most ` +
          `valuable thing in a file. Commented-out code is a decision someone did not make: the next reader cannot ` +
          `tell whether it is a rollback plan, a half-finished feature or forgotten, so they leave it — and it ` +
          `accumulates. Git already remembers it; delete it.`,
      evidence: quote(worst.map((w) => `${w.path} (${w.n})`)) || undefined,
    });
  }

  // Debug statements left in shipped code.
  const debugFiles: string[] = [];
  for (const [path, text] of ctx.files) {
    const clean = stripCStyleComments(text);
    if (/console\.(log|debug|dir)\s*\(|\bprint\s*\(|var_dump\s*\(|fmt\.Println\s*\(|debugger;/.test(clean)) {
      debugFiles.push(path);
    }
  }
  const debugRatio = ctx.files.size === 0 ? 0 : debugFiles.length / ctx.files.size;
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "clean_debug_statements",
    label: "Debug output is not left in shipped code",
    status: debugRatio > 0.4 ? "WARN" : debugFiles.length > 0 ? "WARN" : "PASS",
    confidence: "HIGH",
    detail: debugFiles.length === 0
      ? `No stray debug output in the sample.`
      : `Debug output (\`console.log\`, \`print\`, \`debugger\`) appears in ${debugFiles.length} of ` +
        `${ctx.files.size} sampled file(s). Beyond the noise, this is a routine way that request bodies, tokens and ` +
        `personal data end up in logs that are retained far longer than anyone intends — and on a client's machine ` +
        `in the browser console. Use a logger with levels, and strip debug output at build time.`,
    evidence: quote(debugFiles) || undefined,
  });

  // Committed build output or dependencies.
  const artifacts = ctx.paths.filter((p) =>
    /(^|\/)(node_modules|vendor|\.next|dist|build|coverage|__pycache__|\.venv)\//i.test(p),
  );
  if (artifacts.length > 0) {
    const dirs = [...new Set(artifacts.map((p) => p.split("/").find((s) => /^(node_modules|vendor|\.next|dist|build|coverage|__pycache__|\.venv)$/i.test(s)) ?? p.split("/")[0]))];
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "clean_committed_artifacts",
      label: "Build output and dependencies are not committed",
      status: dirs.some((d) => /node_modules|vendor|\.venv/i.test(d)) ? "FAIL" : "WARN",
      confidence: "HIGH",
      detail:
        `${artifacts.length.toLocaleString()} committed file(s) live under ${dirs.join(", ")}. Committed dependencies ` +
        `or build output make every diff unreadable, inflate clone times, and — the part that actually bites — mean ` +
        `the repository's dependency tree is whatever was on one person's machine on one day, rather than what the ` +
        `lockfile resolves. Add these to .gitignore and remove them with \`git rm -r --cached\`.`,
      evidence: dirs.join(", "),
    });
  }

  return checks;
}

// ── Consistency & style ─────────────────────────────────────────────────────
function consistencyChecks(ctx: CleanContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Filename convention. Mixed casing is the clearest sign of a codebase written
  // by several hands (or several prompts) with no agreement between them — and on
  // a case-insensitive filesystem it produces imports that work locally and fail
  // in CI, which is among the most annoying classes of bug to diagnose.
  const basenames = [...ctx.files.keys()].map((p) => p.split("/").pop() ?? "").filter(Boolean);
  const styles = {
    kebab: basenames.filter((b) => /^[a-z0-9]+(-[a-z0-9]+)+\./.test(b)).length,
    snake: basenames.filter((b) => /^[a-z0-9]+(_[a-z0-9]+)+\./.test(b)).length,
    pascal: basenames.filter((b) => /^[A-Z][a-zA-Z0-9]*\./.test(b)).length,
    camel: basenames.filter((b) => /^[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\./.test(b)).length,
  };
  const used = Object.entries(styles).filter(([, n]) => n >= 2);
  if (basenames.length >= 10 && used.length >= 3) {
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "clean_filename_consistency",
      label: "Filenames follow one convention",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `${used.length} filename conventions are in use across the sample (` +
        `${used.map(([k, n]) => `${k}: ${n}`).join(", ")}). Beyond looking unfinished, this causes a specific bug: ` +
        `imports that resolve on a case-insensitive filesystem (macOS, Windows) and fail on the case-sensitive one ` +
        `CI and production run — so it breaks at deploy rather than locally. Pick one convention and rename in a ` +
        `single commit, so the churn is one diff rather than a year of them.`,
      evidence: used.map(([k, n]) => `${k}: ${n}`).join(", "),
    });
  }

  // Indentation. Mixed tabs and spaces inside the SAME file is the real finding —
  // across files it is often just different languages with different conventions.
  const mixedFiles = [...ctx.files.entries()]
    .filter(([, text]) => {
      const lines = text.split("\n").filter((l) => /^\s+\S/.test(l));
      if (lines.length < 20) return false;
      const tabs = lines.filter((l) => l.startsWith("\t")).length;
      const spaces = lines.filter((l) => l.startsWith(" ")).length;
      // Both present in meaningful quantity — not one stray line.
      return tabs > 3 && spaces > 3;
    })
    .map(([p]) => p);

  if (mixedFiles.length > 0) {
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "clean_indentation_consistency",
      label: "Indentation is consistent within a file",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `${mixedFiles.length} file(s) mix tabs and spaces for indentation. The file then renders differently for ` +
        `every reader depending on their tab width, which makes alignment misleading — and in Python it is a ` +
        `runtime error rather than a style issue. An \`.editorconfig\` plus a formatter in CI fixes this permanently ` +
        `and stops it recurring.`,
      evidence: quote(mixedFiles),
    });
  }

  return checks;
}
