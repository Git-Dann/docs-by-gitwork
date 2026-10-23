import type { CodeHistory, FileMeasure } from "@/types/code-health";

/**
 * What a year of git history says about the code: where change concentrates, who knows
 * what, and which files always change together. Pure: parsed commits in, findings out.
 *
 * The measures follow Adam Tornhill's "Your Code as a Crime Scene" (the method behind
 * CodeScene): a hotspot is code that is both complex AND changed often, because complex
 * code nobody touches costs nothing, and simple code that changes daily is fine. Change
 * frequency is counted in commits, not lines: line churn needs every old file version,
 * which the blobless clone deliberately does not download.
 */

export const HISTORY_MONTHS = 12;
/** Commits touching more files than this are mass edits (formatting, renames, the shallow boundary). */
const MASS_EDIT_FILES = 60;
/** Coupling is only measured between files that each changed at least this often. */
const COUPLING_MIN_SHARED = 5;
const COUPLING_MIN_DEGREE = 0.7;
const HOTSPOT_LIMIT = 15;
const COUPLING_LIMIT = 10;

/** Automated committers: not people, so not knowledge, and not who to ask. */
const BOT = /\[bot\]|^dependabot|^renovate|github-actions|^greenkeeper|^snyk-bot|^pre-commit-ci/i;

export interface Commit {
  sha: string;
  author: string;
  /** Unix seconds. */
  time: number;
  files: string[];
}

/** The `git log` invocation whose output `parseLog` reads. */
export function logArgs(sinceIso: string): string[] {
  // --no-renames: rename detection compares file contents, which a blobless clone would
  // fetch one at a time. --no-merges: a merge repeats its branch's changes.
  return ["log", `--since=${sinceIso}`, "--no-merges", "--no-renames", "--name-only", "--format=%x1e%H%x1f%aN%x1f%at"];
}

export function parseLog(out: string): Commit[] {
  const commits: Commit[] = [];
  for (const block of out.split("\x1e")) {
    const lines = block.split("\n");
    const head = lines.shift();
    if (!head) continue;
    const [sha, author, time] = head.split("\x1f");
    if (!sha || !author) continue;
    commits.push({ sha, author: author.trim(), time: Number(time) || 0, files: lines.map((l) => l.trim()).filter(Boolean) });
  }
  return commits;
}

export function analyseHistory(commits: Commit[], measured: FileMeasure[], months = HISTORY_MONTHS): CodeHistory {
  const prod = new Map(measured.filter((f) => !f.isTest).map((f) => [f.path, f]));
  const people = commits.filter((c) => !BOT.test(c.author));
  const counted = people.filter((c) => c.files.length <= MASS_EDIT_FILES);

  // Per file: how often it changed, and by whom.
  const changes = new Map<string, number>();
  const authorsOf = new Map<string, Map<string, number>>();
  for (const c of counted) {
    for (const f of c.files) {
      if (!prod.has(f)) continue;
      changes.set(f, (changes.get(f) ?? 0) + 1);
      const a = authorsOf.get(f) ?? new Map<string, number>();
      a.set(c.author, (a.get(c.author) ?? 0) + 1);
      authorsOf.set(f, a);
    }
  }

  // Hotspots: change frequency × complexity, each normalised to the repo's own maximum
  // so the ranking is relative to this codebase rather than to an absolute scale.
  const complexity = (f: FileMeasure) => f.functions.reduce((s, fn) => s + fn.complexity, 0);
  const maxChanges = Math.max(1, ...changes.values());
  const maxComplexity = Math.max(1, ...[...prod.values()].map(complexity));
  const hotspots = [...changes.entries()]
    .filter(([, n]) => n >= 3)
    .map(([path, n]) => {
      const f = prod.get(path)!;
      const authors = authorsOf.get(path)!;
      const top = [...authors.values()].sort((a, b) => b - a)[0] ?? 0;
      return {
        path,
        changes: n,
        complexity: complexity(f),
        loc: f.loc,
        authors: authors.size,
        mainAuthorShare: Math.round((top / n) * 100) / 100,
        score: Math.round((n / maxChanges) * (complexity(f) / maxComplexity) * 1000) / 1000,
      };
    })
    .filter((h) => h.complexity > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, HOTSPOT_LIMIT);

  // Knowledge: who mainly wrote each file this year, weighted by the file's size. The bus
  // factor is the fewest people who between them are the main author of over half the code
  // that changed. Only code that changed is counted: untouched code says nothing about who
  // knows it now.
  const ownedLoc = new Map<string, number>();
  let changedLoc = 0;
  for (const [path, authors] of authorsOf) {
    const loc = prod.get(path)!.loc;
    const [owner] = [...authors.entries()].sort((a, b) => b[1] - a[1])[0];
    ownedLoc.set(owner, (ownedLoc.get(owner) ?? 0) + loc);
    changedLoc += loc;
  }
  const owners = [...ownedLoc.entries()].sort((a, b) => b[1] - a[1]);
  let busFactor = 0;
  for (let acc = 0; busFactor < owners.length && acc <= changedLoc / 2; busFactor++) acc += owners[busFactor][1];

  // Change coupling: files that keep changing in the same commits. Hidden dependencies
  // are what make "a small change" take a week.
  const pairCount = new Map<string, number>();
  for (const c of counted) {
    const files = c.files.filter((f) => prod.has(f)).sort();
    if (files.length < 2 || files.length > 20) continue;
    for (let i = 0; i < files.length; i++) for (let j = i + 1; j < files.length; j++) {
      const k = `${files[i]}\0${files[j]}`;
      pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
    }
  }
  const coupling = [...pairCount.entries()]
    .filter(([, n]) => n >= COUPLING_MIN_SHARED)
    .map(([k, shared]) => {
      const [a, b] = k.split("\0");
      const degree = shared / Math.min(changes.get(a) ?? shared, changes.get(b) ?? shared);
      return { a, b, shared, degree: Math.round(degree * 100) / 100 };
    })
    .filter((p) => p.degree >= COUPLING_MIN_DEGREE && dir(p.a) !== dir(p.b)) // same-folder pairs are expected
    .sort((x, y) => y.shared * y.degree - x.shared * x.degree)
    .slice(0, COUPLING_LIMIT);

  const times = people.map((c) => c.time).filter(Boolean);
  return {
    months,
    commits: people.length,
    massEditsIgnored: people.length - counted.length,
    botCommitsIgnored: commits.length - people.length,
    contributors: new Set(people.map((c) => c.author)).size,
    firstCommitAt: times.length ? new Date(Math.min(...times) * 1000).toISOString() : null,
    lastCommitAt: times.length ? new Date(Math.max(...times) * 1000).toISOString() : null,
    busFactor: owners.length ? busFactor : null,
    owners: owners.slice(0, 5).map(([name, loc]) => ({ name, share: changedLoc ? Math.round((loc / changedLoc) * 100) / 100 : 0 })),
    hotspots,
    coupling,
  };
}

function dir(path: string): string {
  return path.slice(0, path.lastIndexOf("/") + 1);
}
