import type {
  GitHubAnalysisMetrics,
  GitHubLanguageUsage,
  GitHubProfileSnapshot,
  GitHubRepoSnapshot,
  RepoCodeHealth,
  RepoUnreadableReason,
} from "@/types/codeclear";
import { clampScore } from "@/server/codeclear";
import { runCodeHealth } from "@/server/code-health";
import {
  GitHubRequestError,
  githubRequest as sharedGithubRequest,
  hasGithubToken,
} from "@/lib/github";
const ANALYSIS_VERSION = "docs-codeclear-v2"; // v2: measured code health of the top repos (evidence only)
const MAX_REPOS = 6;
/** How many of a candidate's repos get their source measured (a clone + parse each). */
const MAX_MEASURED_REPOS = 3;
/** Whole budget for measuring them, so a slow clone cannot hold up the analysis. */
const MEASURE_BUDGET_MS = 90_000;

/**
 * Measure the source of a candidate's strongest readable repos with Pulse's code-health
 * measure (a shallow clone and a real parse, src/server/code-health). This is EVIDENCE, not
 * a score input: a candidate's public repos are often old, experimental or shared, so the
 * figures go in the drawer for a person to weigh, and the recommended scores are unchanged.
 * Never throws; a repo that could not be measured says why.
 */
async function measureRepos(repos: GitHubRepoSnapshot[]): Promise<Map<string, RepoCodeHealth>> {
  const out = new Map<string, RepoCodeHealth>();
  const picks = repos.filter((r) => r.treeReadable && r.size > 0).slice(0, MAX_MEASURED_REPOS);
  const work = Promise.all(
    picks.map(async (repo) => {
      const r = await runCodeHealth(repo.fullName, { history: false });
      out.set(repo.fullName, r.report
        ? {
            score: r.report.totals.files > 0 ? r.report.score : null,
            band: r.report.totals.files > 0 ? r.report.band : null,
            loc: r.report.totals.loc,
            complexLocShare: r.report.totals.complexLocShare,
            commit: r.report.commit,
            languages: r.report.languages.map((l) => l.language),
            topDebt: r.report.debt.slice(0, 3).map(({ kind, severity, path, line, symbol }) => ({ kind, severity, path, line, symbol })),
            unavailable: r.report.totals.files > 0 ? null : "no source in a supported language",
          }
        : { score: null, band: null, loc: 0, complexLocShare: 0, commit: null, languages: [], topDebt: [], unavailable: r.unavailable });
    }),
  );
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, MEASURE_BUDGET_MS))]);
  return out;
}
const RECENT_ACTIVITY_WINDOW_DAYS = 365;

type GitHubUserResponse = {
  login: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  html_url: string;
  company: string | null;
  location: string | null;
  followers: number;
  following: number;
  public_repos: number;
  created_at: string;
  updated_at: string;
};

type GitHubRepoResponse = {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  size: number;
  pushed_at: string;
  updated_at: string;
  fork: boolean;
  topics?: string[];
};

export class GitHubAnalysisError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GitHubAnalysisError";
    this.code = code;
  }
}

/**
 * GitHub REST call, via the shared client in src/lib/github.ts, so a 403 is only called a
 * rate limit when GitHub says so (and the limit is recorded centrally, CLAUDE.md §61). This
 * module used to keep its own copy that labelled EVERY 403 a rate limit — including a token
 * that simply lacks access — which sent people the wrong fix.
 */
async function githubRequest<T>(path: string): Promise<T> {
  try {
    return await sharedGithubRequest<T>(path);
  } catch (error) {
    if (!(error instanceof GitHubRequestError)) throw error;
    switch (error.code) {
      case "GITHUB_NOT_FOUND":
        throw new GitHubAnalysisError("GITHUB_NOT_FOUND", "GitHub profile or repository not found.");
      case "GITHUB_RATE_LIMITED":
        throw new GitHubAnalysisError(
          "GITHUB_RATE_LIMITED",
          "GitHub analysis is temporarily rate limited. Try again shortly.",
        );
      case "GITHUB_FORBIDDEN":
        throw new GitHubAnalysisError(
          "GITHUB_FORBIDDEN",
          hasGithubToken()
            ? "GitHub refused access: the server's GITHUB_TOKEN cannot see this resource."
            : "GitHub refused access, and GITHUB_TOKEN is not configured on this server.",
        );
      default:
        throw new GitHubAnalysisError("GITHUB_REQUEST_FAILED", error.message);
    }
  }
}

/**
 * A read that may fail. Null means "we could not look" and must never be scored as
 * zero commits or zero languages; the 409 an empty repository answers IS readable.
 */
async function readOrNull<T>(path: string, ifEmpty: T): Promise<T | null> {
  try {
    return await githubRequest<T>(path);
  } catch (error) {
    return classifyTreeFailure(error, hasGithubToken()) === "EMPTY" ? ifEmpty : null;
  }
}

/** A repo's full file tree, or null when it could not be read. */
export interface RepoTree {
  /** Every path in the repo, POSIX, repo-relative. Lowercased for matching. */
  paths: string[];
  /** GitHub truncates very large trees — signals stay best-effort when true. */
  truncated: boolean;
}

/**
 * Read the repo's WHOLE file tree in one request.
 *
 * TWO REASONS THIS IS NOT safeGithubRequest, and both were live bugs:
 *
 * (1) That helper collapses every failure into its fallback, so a 404 (private repo,
 * or no GITHUB_TOKEN), a 403 (rate limit) and a genuinely empty repository all became
 * the same value. detectRepoSignals then reported no tests/CI/lint/docs — worth 50 of
 * the ~100 health-score points — so an unreadable repository was scored as a
 * deficient one. Same defect class as the Pulse bug in #463: "we could not look"
 * rendering as "it is not there", except this fed CodeClearScore and shaped
 * assessments of people. A distinguishable null is the whole point.
 *
 * Previously this read only `/contents`, which returns the ROOT directory. Every
 * signal was therefore a root-level filename test, which is a JavaScript assumption:
 * a JS project really does keep package.json, .eslintrc and tests/ at the root.
 * Almost nothing else does.
 *
 *   • Android/Kotlin puts tests in `app/src/test/` and `app/src/androidTest/`
 *   • Flutter/Dart uses `analysis_options.yaml` for lint and `test/` for tests
 *   • Swift keeps `Tests/` (SwiftPM) or a `*Tests/` target directory
 *   • Python's linter config lives in `pyproject.toml`, Go's in `.golangci.yml`
 *
 * So a perfectly readable Android repo reported no tests and no linter — the same
 * unfairness the readability fix removed, arriving by a different route, and aimed at
 * developers working on exactly those stacks.
 *
 * The recursive trees endpoint costs the same one request as the root listing and
 * returns the entire tree. `truncated` is surfaced rather than treated as failure:
 * a huge repo is still readable, its signals are just best-effort.
 */
async function readRepoTree(
  fullName: string,
): Promise<{ tree: RepoTree | null; unreadable: RepoUnreadableReason | null }> {
  try {
    const data = await githubRequest<{
      tree?: Array<{ path: string; type: string }>;
      truncated?: boolean;
    }>(`/repos/${fullName}/git/trees/HEAD?recursive=1`);

    return {
      tree: {
        paths: (data.tree ?? []).map((entry) => entry.path.toLowerCase()),
        truncated: Boolean(data.truncated),
      },
      unreadable: null,
    };
  } catch (error) {
    const reason = classifyTreeFailure(error, hasGithubToken());
    // A repository with no commits answers 409 "Git Repository is empty". That one IS
    // readable — it genuinely has no tests — so it must not be reported as unreadable.
    if (reason === "EMPTY") return { tree: { paths: [], truncated: false }, unreadable: null };
    return { tree: null, unreadable: reason };
  }
}

/**
 * Why a tree read failed. Pure, so the distinction can be tested without the network.
 *
 * A 404 means different things depending on whether we sent a token: with none, GitHub
 * hides every private repository behind a 404, so the honest cause is the missing token.
 */
export function classifyTreeFailure(
  error: unknown,
  hasToken: boolean,
): RepoUnreadableReason | "EMPTY" {
  const code = error instanceof GitHubAnalysisError ? error.code : null;
  const message = error instanceof Error ? error.message : "";
  if (/repository is empty/i.test(message)) return "EMPTY";
  if (code === "GITHUB_RATE_LIMITED") return "RATE_LIMITED";
  if (code === "GITHUB_NOT_FOUND") return hasToken ? "NOT_FOUND" : "NO_TOKEN";
  if (code === "GITHUB_FORBIDDEN") return hasToken ? "NO_ACCESS" : "NO_TOKEN";
  return "REQUEST_FAILED";
}

/** The cause, in words, completing the sentence "Couldn't read this repository: …". */
export function describeUnreadable(reason: RepoUnreadableReason): string {
  switch (reason) {
    case "NO_TOKEN":
      return "GITHUB_TOKEN is not configured on this server, so GitHub hides private repositories";
    case "NO_ACCESS":
      return "the server's GitHub token does not have access to it";
    case "RATE_LIMITED":
      return "GitHub's API rate limit for this server is used up; run the analysis again later";
    case "NOT_FOUND":
      return "GitHub returned not found (it may be private to this token, renamed or deleted)";
    default:
      return "GitHub returned an error when reading its files";
  }
}

function isRecent(dateString: string) {
  const ageMs = Date.now() - new Date(dateString).getTime();
  return ageMs <= RECENT_ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function aggregateLanguages(languageMaps: Array<Record<string, number>>) {
  const totals = new Map<string, number>();

  for (const map of languageMaps) {
    for (const [language, bytes] of Object.entries(map)) {
      totals.set(language, (totals.get(language) ?? 0) + bytes);
    }
  }

  return Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([language, bytes]) => ({ language, bytes }));
}

/** Test seam — the readable/unreadable distinction is the whole point of the fix. */
export function detectRepoSignalsForTest(tree: RepoTree | null) {
  return detectRepoSignals(tree);
}

/** Test seam — an unread repo must not be scored as a deficient one. */
export function buildHealthScoreForTest(input: Parameters<typeof buildHealthScore>[0]) {
  return buildHealthScore(input);
}

/**
 * Vendored/generated trees. A repo that merely CONTAINS a dependency's tests must not
 * be credited with having tests — otherwise any project with a committed Pods/ or
 * node_modules/ directory scores as well-tested.
 */
const VENDORED = /(^|\/)(pods|carthage|vendor|node_modules|\.build|deriveddata|third_party|\.dart_tool|build\/generated)\//;

/**
 * Signal patterns, matched against FULL repo-relative paths, per language family.
 *
 * Each list is deliberately explicit rather than clever: a wrong pattern here is
 * invisible in tests and quietly unfair to a candidate, so a reader must be able to
 * check each entry against a language they know.
 */
const TEST_PATTERNS: RegExp[] = [
  /(^|\/)(test|tests|__tests__|spec|specs)\//,          // JS/TS, Python, Dart, Go, generic
  /(^|\/)src\/test\//,                                   // Gradle/Maven — Kotlin, Java
  /(^|\/)src\/androidtest\//,                            // Android instrumentation tests
  /(^|\/)[^/]*tests?\/[^/]+\.(swift|kt|java)$/,          // SwiftPM Tests/, *Tests/ targets
  /\.(test|spec)\.(js|jsx|ts|tsx|mjs|cjs)$/,             // co-located JS/TS tests
  /_test\.(go|py|dart|rb)$/,                             // Go, Python, Dart, Ruby convention
  /test_[^/]+\.py$/,                                     // pytest convention
  /[^/]+tests?\.(kt|java|swift|cs)$/,                    // FooTest.kt / FooTests.swift
];

const LINT_PATTERNS: RegExp[] = [
  /(^|\/)(eslint\.config\.[mc]?js|\.eslintrc(\.(js|cjs|json|ya?ml))?)$/, // JS/TS
  /(^|\/)biome\.jsonc?$/,
  /(^|\/)(ruff\.toml|\.ruff\.toml|setup\.cfg|\.flake8|\.pylintrc)$/,     // Python
  /(^|\/)analysis_options\.ya?ml$/,                                      // Dart / Flutter
  /(^|\/)(detekt\.ya?ml|\.editorconfig|ktlint\.ya?ml)$/,                 // Kotlin
  /(^|\/)\.swiftlint\.ya?ml$/,                                           // Swift
  /(^|\/)\.golangci\.ya?ml$/,                                            // Go
  /(^|\/)(rustfmt\.toml|clippy\.toml)$/,                                 // Rust
  /(^|\/)(phpcs\.xml(\.dist)?|\.php-cs-fixer(\.dist)?\.php)$/,           // PHP
  /(^|\/)\.rubocop\.ya?ml$/,                                             // Ruby
  /(^|\/)\.editorconfig$/,
];

const MANIFEST_PATTERNS: RegExp[] = [
  /(^|\/)package\.json$/,                                 // JS/TS
  /(^|\/)(pyproject\.toml|requirements\.txt|setup\.py|pipfile)$/, // Python
  /(^|\/)cargo\.toml$/,                                   // Rust
  /(^|\/)go\.mod$/,                                       // Go
  /(^|\/)(composer\.json|gemfile)$/,                      // PHP, Ruby
  /(^|\/)pubspec\.ya?ml$/,                                // Dart / Flutter
  /(^|\/)build\.gradle(\.kts)?$/,                         // Gradle — Kotlin, Java, Android
  /(^|\/)pom\.xml$/,                                      // Maven
  /(^|\/)package\.swift$/,                                // SwiftPM
  /(^|\/)podfile$/,                                       // CocoaPods
  /(^|\/)[^/]+\.csproj$/,                                 // .NET
];

const CI_PATTERNS: RegExp[] = [
  /(^|\/)\.github\/workflows\//,
  /(^|\/)\.circleci\//,
  /(^|\/)\.gitlab-ci\.ya?ml$/,
  /(^|\/)(bitrise\.ya?ml|codemagic\.ya?ml|fastlane\/fastfile)$/, // mobile CI
  /(^|\/)(azure-pipelines\.ya?ml|jenkinsfile|\.travis\.ya?ml)$/,
];

const DOCS_PATTERNS: RegExp[] = [
  /(^|\/)(docs?|documentation)\//,
  /(^|\/)[^/]+\.mdx?$/,
];

function matchesAny(paths: string[], patterns: RegExp[]): boolean {
  return paths.some((path) => !VENDORED.test(path) && patterns.some((re) => re.test(path)));
}

/**
 * Read the repo's file tree into boolean signals.
 *
 * `tree` is null when it could not be read — private repo, missing token, rate limit.
 * `readable` is then false and every signal is NULL (unknown): an unread repo is
 * unassessed, not deficient.
 *
 * Matching is over FULL PATHS and covers the language families Gitwork actually
 * assesses — see readRepoTree for why root-level filename tests were a JavaScript
 * assumption that penalised every mobile developer.
 */
function detectRepoSignals(tree: RepoTree | null) {
  const readable = tree !== null;
  const paths = tree?.paths ?? [];

  const hasReadme = paths.some((path) => /(^|\/)readme(\.[a-z]+)?$/.test(path));
  const hasDocs = hasReadme || matchesAny(paths, DOCS_PATTERNS);
  const hasTests = matchesAny(paths, TEST_PATTERNS);
  const hasCi = matchesAny(paths, CI_PATTERNS);
  const hasLint = matchesAny(paths, LINT_PATTERNS);
  const hasManifest = matchesAny(paths, MANIFEST_PATTERNS);

  // Unread → unknown (null), never false. A false here used to flow straight into
  // coverage figures and red flags as "no tests / no CI" about a repo nobody opened.
  const known = (value: boolean): boolean | null => (readable ? value : null);

  return {
    readable,
    truncated: tree?.truncated ?? false,
    hasReadme: known(hasReadme),
    hasDocs: known(hasDocs),
    hasTests: known(hasTests),
    hasCi: known(hasCi),
    hasLint: known(hasLint),
    hasManifest: known(hasManifest),
  };
}

/** Points the five file-tree signals are worth — only awardable if we read the tree. */
const FILE_SIGNAL_POINTS = 10 + 14 + 10 + 8 + 8; // docs, tests, CI, lint, manifest
const COMMIT_POINTS = 10;

function buildHealthScore(input: {
  stars: number;
  forks: number;
  recentActivity: boolean;
  readable: boolean;
  hasDocs: boolean | null;
  hasTests: boolean | null;
  hasCi: boolean | null;
  hasLint: boolean | null;
  hasManifest: boolean | null;
  recentCommitCount: number | null;
}) {
  let score = 35;

  if (input.hasDocs) score += 10;
  if (input.hasTests) score += 14;
  if (input.hasCi) score += 10;
  if (input.hasLint) score += 8;
  if (input.hasManifest) score += 8;
  if (input.recentActivity) score += 8;

  score += Math.min(10, Math.round(input.stars / 40));
  score += Math.min(7, Math.round(input.forks / 25));
  if (input.recentCommitCount !== null) score += Math.min(10, input.recentCommitCount);

  // Repo tree unreadable — the five file signals were not observed, so they must not
  // be scored as absent. Rescale what WAS observed over the points that were actually
  // available, the same way Pulse's score-breakdown excludes SKIPPED checks from both
  // sides of the ratio. Without this an unreadable repo lost 50 of ~100 points for
  // reasons that have nothing to do with the candidate.
  // Commits that could not be read are excluded the same way.
  const missing = (input.readable ? 0 : FILE_SIGNAL_POINTS) + (input.recentCommitCount === null ? COMMIT_POINTS : 0);
  if (missing > 0) {
    const observed = score; // no points can have been added for what was not read
    const available = 100 - missing;
    return clampScore(Math.round((observed / available) * 100));
  }

  return clampScore(score);
}

function summarizeAnalysis(args: {
  profile: GitHubProfileSnapshot;
  metrics: GitHubAnalysisMetrics;
  redFlags: string[];
}) {
  const topLanguage = args.metrics.topLanguages[0]?.language ?? args.profile.login;
  const recentRepos = Math.round(args.metrics.recentRepoRatio);
  const flags =
    args.redFlags.length > 0
      ? ` Watch-outs: ${args.redFlags.slice(0, 2).join(" ")}`
      : "";

  const unread = unreadableSentence(args.metrics);

  return `${args.profile.name ?? args.profile.login} shows strongest public signal in ${topLanguage} with ${args.metrics.selectedRepoCount} sampled repositories, ${recentRepos}% recent activity, and an average repository health score of ${args.metrics.averageHealthScore}.${flags}${unread ? ` ${unread}` : ""}`;
}

/**
 * "Couldn't read …: <reason>." for the repos whose file tree could not be read, or null
 * when every sampled repo was read. This is a statement about OUR access, never about the
 * candidate, so it is deliberately not a red flag (red flags cost calibre points).
 */
export function unreadableSentence(metrics: GitHubAnalysisMetrics): string | null {
  const count = metrics.unreadableRepoCount ?? 0;
  if (count === 0) return null;
  const reasons = (metrics.unreadableReasons ?? []).map(describeUnreadable);
  const why = reasons.length > 0 ? reasons.join("; ") : describeUnreadable("REQUEST_FAILED");
  const what =
    count === 1 && metrics.selectedRepoCount === 1
      ? "Couldn't read this repository"
      : `Couldn't read ${count} of ${metrics.selectedRepoCount} sampled repositories`;
  return `${what}: ${why}. Docs, tests, CI and linter signals for ${count === 1 ? "it are" : "them are"} unknown, not absent.`;
}

/**
 * base + Σ(weight × value), where unknown (null) values are EXCLUDED from both sides: the
 * known terms are scaled up to the total weight, exactly as if the unknown ones had scored
 * the known terms' average. Scoring an unknown as 0 is what made an unreadable repository
 * cost a candidate points.
 */
function weightedScore(base: number, terms: Array<{ weight: number; value: number | null }>) {
  const totalWeight = terms.reduce((sum, t) => sum + t.weight, 0);
  const known = terms.filter((t): t is { weight: number; value: number } => t.value !== null);
  const knownWeight = known.reduce((sum, t) => sum + t.weight, 0);
  if (knownWeight === 0) return clampScore(base);
  const knownSum = known.reduce((sum, t) => sum + t.weight * t.value, 0);
  return clampScore(base + knownSum * (totalWeight / knownWeight));
}

/** Test seam — unknown coverage must be excluded, not counted as zero. */
export function weightedScoreForTest(base: number, terms: Array<{ weight: number; value: number | null }>) {
  return weightedScore(base, terms);
}

export function getGitHubAnalysisVersion() {
  return ANALYSIS_VERSION;
}

export async function analyzeGitHubProfile(githubHandle: string) {
  const sanitizedHandle = githubHandle.trim().replace(/^@+/, "");

  if (!sanitizedHandle) {
    throw new GitHubAnalysisError("INVALID_GITHUB_HANDLE", "A GitHub handle is required.");
  }

  const profileResponse = await githubRequest<GitHubUserResponse>(`/users/${sanitizedHandle}`);
  const reposResponse = await githubRequest<GitHubRepoResponse[]>(
    `/users/${sanitizedHandle}/repos?per_page=100&sort=updated`,
  );

  const profileSnapshot: GitHubProfileSnapshot = {
    login: profileResponse.login,
    name: profileResponse.name,
    bio: profileResponse.bio,
    avatarUrl: profileResponse.avatar_url,
    htmlUrl: profileResponse.html_url,
    company: profileResponse.company,
    location: profileResponse.location,
    followers: profileResponse.followers,
    following: profileResponse.following,
    publicRepos: profileResponse.public_repos,
    createdAt: profileResponse.created_at,
    updatedAt: profileResponse.updated_at,
  };

  const selectedRepos = [...reposResponse]
    .filter((repo) => !repo.fork)
    .sort((left, right) => {
      const leftScore =
        left.stargazers_count * 4 +
        left.forks_count * 2 +
        (isRecent(left.pushed_at) ? 30 : 0);
      const rightScore =
        right.stargazers_count * 4 +
        right.forks_count * 2 +
        (isRecent(right.pushed_at) ? 30 : 0);
      return rightScore - leftScore;
    })
    .slice(0, MAX_REPOS);

  const repoDetails = await Promise.all(
    selectedRepos.map(async (repo) => {
      const [languages, contents, commits] = await Promise.all([
        readOrNull<Record<string, number>>(`/repos/${repo.full_name}/languages`, {}),
        // NOT safeGithubRequest: an unreadable tree must stay distinguishable from an
        // empty one, or its signals get scored as absent. See readRepoTree.
        readRepoTree(repo.full_name),
        readOrNull<Array<{ sha: string }>>(`/repos/${repo.full_name}/commits?per_page=20`, []),
      ]);

      const signals = detectRepoSignals(contents.tree);
      // Null when the commits could not be read: not "0 recent commits".
      const recentCommitCount = commits === null ? null : commits.length;
      const recentActivity = isRecent(repo.pushed_at);
      const languagesList: GitHubLanguageUsage[] | null = languages === null ? null : Object.entries(languages)
        .sort((left, right) => right[1] - left[1])
        .map(([language, bytes]) => ({ language, bytes }));

      const healthScore = buildHealthScore({
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        recentActivity,
        recentCommitCount,
        ...signals,
      });

      const snapshot: GitHubRepoSnapshot = {
        name: repo.name,
        fullName: repo.full_name,
        htmlUrl: repo.html_url,
        description: repo.description,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        size: repo.size,
        recentCommitCount,
        recentActivity,
        treeReadable: signals.readable,
        treeUnreadableReason: contents.unreadable,
        hasReadme: signals.hasReadme,
        hasDocs: signals.hasDocs,
        hasTests: signals.hasTests,
        hasCi: signals.hasCi,
        hasLint: signals.hasLint,
        hasManifest: signals.hasManifest,
        topics: repo.topics ?? [],
        languages: languagesList ?? [],
        languagesReadable: languagesList !== null,
        pushedAt: repo.pushed_at,
        updatedAt: repo.updated_at,
        healthScore,
      };

      return snapshot;
    }),
  );

  const measuredHealth = await measureRepos(repoDetails);
  for (const repo of repoDetails) {
    const h = measuredHealth.get(repo.fullName);
    if (h) repo.codeHealth = h;
  }
  const scored = [...measuredHealth.values()].filter((h) => h.score !== null);

  // Languages only from repos whose language breakdown could be read.
  const languageKnown = repoDetails.filter((repo) => repo.languagesReadable !== false);
  const aggregatedLanguages = aggregateLanguages(languageKnown.map((repo) => {
    const map: Record<string, number> = {};
    for (const language of repo.languages) {
      map[language.language] = language.bytes;
    }
    return map;
  }));

  // Coverage is measured over the repos we could actually READ. Using every selected
  // repo made an unreadable one count as a repo without docs/tests/CI, which then
  // produced red flags like "Limited visible test coverage" about repositories nobody
  // had looked inside. Same defect as the per-repo score, one level up.
  const readableRepos = repoDetails.filter((repo) => repo.treeReadable);
  const commitKnown = repoDetails.filter((repo) => repo.recentCommitCount !== null);
  const unreadableRepos = repoDetails.filter((repo) => !repo.treeReadable);
  // Null — unknown — when nothing could be read. It used to divide by 1 and report 0%,
  // which then scored as "no docs/tests/CI" and fed the recommended code-quality score.
  const coverage = (has: (repo: GitHubRepoSnapshot) => boolean | null): number | null =>
    readableRepos.length === 0
      ? null
      : Math.round((readableRepos.filter((repo) => has(repo) === true).length / readableRepos.length) * 100);
  const metrics: GitHubAnalysisMetrics = {
    publicRepoCount: reposResponse.length,
    selectedRepoCount: repoDetails.length,
    totalStars: repoDetails.reduce((sum, repo) => sum + repo.stars, 0),
    averageStars: repoDetails.length
      ? Math.round(repoDetails.reduce((sum, repo) => sum + repo.stars, 0) / repoDetails.length)
      : 0,
    languageCount: languageKnown.length > 0 ? aggregatedLanguages.length : null,
    topLanguages: aggregatedLanguages.slice(0, 5),
    recentRepoRatio: repoDetails.length
      ? Math.round(
          (repoDetails.filter((repo) => repo.recentActivity).length / repoDetails.length) * 100,
        )
      : 0,
    docsCoverage: coverage((repo) => repo.hasDocs),
    testsCoverage: coverage((repo) => repo.hasTests),
    ciCoverage: coverage((repo) => repo.hasCi),
    lintCoverage: coverage((repo) => repo.hasLint),
    manifestCoverage: coverage((repo) => repo.hasManifest),
    unreadableRepoCount: unreadableRepos.length,
    unreadableReasons: [
      ...new Set(unreadableRepos.map((repo) => repo.treeUnreadableReason ?? "REQUEST_FAILED")),
    ],
    averageRecentCommitCount: commitKnown.length
      ? Math.round(commitKnown.reduce((sum, repo) => sum + (repo.recentCommitCount ?? 0), 0) / commitKnown.length)
      : repoDetails.length
        ? null
        : 0,
    averageHealthScore: repoDetails.length
      ? Math.round(
          repoDetails.reduce((sum, repo) => sum + repo.healthScore, 0) / repoDetails.length,
        )
      : 0,
    codeHealthMeasured: scored.length,
    averageCodeHealth: scored.length ? Math.round(scored.reduce((s, h) => s + (h.score ?? 0), 0) / scored.length) : null,
  };

  const redFlags: string[] = [];
  if (metrics.selectedRepoCount < 2) {
    redFlags.push("Small public repo sample.");
  }
  if (metrics.recentRepoRatio < 35) {
    redFlags.push("Low recent public activity.");
  }
  if (repoDetails.length === 0) {
    redFlags.push("No public repositories to assess.");
  }
  // Coverage-based flags are statements about what we READ, so they only fire on a
  // known figure. An unreadable repo is NOT a red flag either: red flags cost calibre
  // points, and "we could not read it" is about our access, not the candidate. It is
  // reported instead by unreadableSentence (summary) and the repo_readability check.
  if (metrics.docsCoverage !== null && metrics.docsCoverage < 30) {
    redFlags.push("Limited documentation coverage.");
  }
  if (metrics.testsCoverage !== null && metrics.testsCoverage < 25) {
    redFlags.push("Limited visible test coverage.");
  }
  if (metrics.ciCoverage !== null && metrics.ciCoverage < 25) {
    redFlags.push("Limited visible CI coverage.");
  }

  // Language breadth and commit cadence are worth up to 12 each. One we could not read
  // is excluded and the other stands in for both, not counted as zero.
  const depthExtras = [
    metrics.languageCount === null ? null : Math.min(12, metrics.languageCount * 2),
    metrics.averageRecentCommitCount === null ? null : Math.min(12, metrics.averageRecentCommitCount),
  ].filter((v): v is number => v !== null);
  const depthBase = 42 + metrics.averageHealthScore * 0.34;
  const recommendedTechnicalDepth = clampScore(
    depthBase +
      (depthExtras.length > 0
        ? (depthExtras.reduce((a, b) => a + b, 0) / (depthExtras.length * 12)) * 24
        : (depthBase / 76) * 24),
  );
  const recommendedCodeQuality = weightedScore(28, [
    { weight: 0.18, value: metrics.docsCoverage },
    { weight: 0.22, value: metrics.testsCoverage },
    { weight: 0.16, value: metrics.ciCoverage },
    { weight: 0.12, value: metrics.lintCoverage },
    { weight: 0.15, value: metrics.averageHealthScore },
  ]);
  const recommendedDeliveryReadiness = weightedScore(34, [
    { weight: 0.22, value: metrics.recentRepoRatio },
    { weight: 0.16, value: metrics.ciCoverage },
    { weight: 0.14, value: metrics.manifestCoverage },
    { weight: 0.18, value: metrics.averageHealthScore },
  ]);

  return {
    profileSnapshot,
    repoSnapshot: repoDetails,
    metrics,
    redFlags,
    recommendedTechnicalDepth,
    recommendedCodeQuality,
    recommendedDeliveryReadiness,
    llmSummary: summarizeAnalysis({
      profile: profileSnapshot,
      metrics,
      redFlags,
    }),
  };
}

/**
 * Translates the metrics + redFlags from an analysis run into a row-per-finding
 * shape for the CodeClearCheck table. Mirrors Pulse's PulseScanCheck.
 *
 * This is what gives the calibre score "receipts" — every score line has
 * matching PASS/WARN/FAIL evidence in the drawer.
 *
 * Categories follow the validation lens:
 *   - GitHub Activity     — recency, sample size, commit cadence
 *   - Code Quality        — docs, tests, CI, lint, manifests
 *   - Delivery Signals    — recent repo ratio, manifest coverage
 *   - AI Fluency          — placeholder; only populated by later runs that
 *                           introspect AI/Copilot/LLM usage signals
 *   - Identity & References — populated by external identity checks later
 */
export function buildChecksFromAnalysis(args: {
  metrics: GitHubAnalysisMetrics;
  redFlags: string[];
  repos?: GitHubRepoSnapshot[];
}): Array<{
  category: string;
  checkKey: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL" | "SKIPPED";
  detail: string | null;
  weight: number;
  sortOrder: number;
}> {
  const { metrics } = args;

  // Threshold helper. PASS/WARN/FAIL banding matches Pulse conventions.
  const band = (
    value: number,
    pass: number,
    warn: number,
  ): "PASS" | "WARN" | "FAIL" => (value >= pass ? "PASS" : value >= warn ? "WARN" : "FAIL");

  // A coverage figure is only a finding when we read the repos it is about. Null means
  // no sampled repo could be read: SKIPPED with the reason, never FAIL at "0%".
  const unread = unreadableSentence(metrics);
  const coverageRow = (
    value: number | null,
    pass: number,
    warn: number,
    detail: (value: number) => string,
  ): { status: "PASS" | "WARN" | "FAIL" | "SKIPPED"; detail: string } =>
    value === null
      ? { status: "SKIPPED", detail: unread ?? "Couldn't read the sampled repositories, so this is unknown." }
      : {
          status: band(value, pass, warn),
          detail: (metrics.unreadableRepoCount ?? 0) > 0
            ? `${detail(value)} (of the ${metrics.selectedRepoCount - (metrics.unreadableRepoCount ?? 0)} that could be read)`
            : detail(value),
        };

  const checks: Array<{
    category: string;
    checkKey: string;
    label: string;
    status: "PASS" | "WARN" | "FAIL" | "SKIPPED";
    detail: string | null;
    weight: number;
    sortOrder: number;
  }> = [
    // GitHub Activity
    {
      category: "GitHub Activity",
      checkKey: "public_repo_sample",
      label: "Public repo sample size",
      status: band(metrics.selectedRepoCount, 5, 2),
      detail: `${metrics.selectedRepoCount} repositories sampled out of ${metrics.publicRepoCount} public`,
      weight: 1,
      sortOrder: 10,
    },
    {
      category: "GitHub Activity",
      checkKey: "recent_activity",
      label: "Recent activity",
      status: band(metrics.recentRepoRatio, 50, 25),
      detail: `${metrics.recentRepoRatio}% of sampled repos have activity in the last 90 days`,
      weight: 1,
      sortOrder: 11,
    },
    {
      category: "GitHub Activity",
      checkKey: "commit_cadence",
      label: "Commit cadence",
      status: metrics.averageRecentCommitCount === null ? "SKIPPED" : band(metrics.averageRecentCommitCount, 10, 3),
      detail: metrics.averageRecentCommitCount === null
        ? "Couldn't read the sampled repositories' commits, so commit cadence is unknown."
        : `${metrics.averageRecentCommitCount} commits per repo on average (recent)`,
      weight: 1,
      sortOrder: 12,
    },
    {
      category: "GitHub Activity",
      checkKey: "language_breadth",
      label: "Language breadth",
      status: metrics.languageCount === null ? "SKIPPED" : band(metrics.languageCount, 3, 2),
      detail: metrics.languageCount === null
        ? "Couldn't read the sampled repositories' languages, so breadth is unknown."
        : `${metrics.languageCount} languages across sampled repos`,
      weight: 1,
      sortOrder: 13,
    },

    // Code Quality
    {
      category: "Code Quality",
      checkKey: "docs_coverage",
      label: "Documentation coverage",
      ...coverageRow(metrics.docsCoverage, 60, 30, (v) => `${v}% of sampled repos have a README`),
      weight: 1,
      sortOrder: 20,
    },
    {
      category: "Code Quality",
      checkKey: "tests_coverage",
      label: "Test coverage signal",
      ...coverageRow(metrics.testsCoverage, 50, 25, (v) => `${v}% of sampled repos contain a test folder`),
      weight: 2,
      sortOrder: 21,
    },
    {
      category: "Code Quality",
      checkKey: "ci_coverage",
      label: "CI present",
      ...coverageRow(metrics.ciCoverage, 50, 25, (v) => `${v}% of sampled repos have a CI workflow file`),
      weight: 2,
      sortOrder: 22,
    },
    {
      category: "Code Quality",
      checkKey: "lint_coverage",
      label: "Linter configured",
      ...coverageRow(metrics.lintCoverage, 50, 25, (v) => `${v}% of sampled repos have a linter config`),
      weight: 1,
      sortOrder: 23,
    },

    // Delivery Signals
    {
      category: "Delivery Signals",
      checkKey: "manifest_coverage",
      label: "Package manifest present",
      ...coverageRow(metrics.manifestCoverage, 70, 40, (v) => `${v}% of sampled repos have a package manifest`),
      weight: 2,
      sortOrder: 30,
    },
    {
      category: "Delivery Signals",
      checkKey: "average_repo_health",
      label: "Average repository health",
      status: band(metrics.averageHealthScore, 70, 40),
      detail: `Average repo health score: ${metrics.averageHealthScore}/100`,
      weight: 2,
      sortOrder: 31,
    },
  ];

  // Said once, plainly, wherever the drawer lists the checks: which repos we could not
  // open and why. SKIPPED because it is about our access, not the candidate.
  if (unread) {
    checks.push({
      category: "Code Quality",
      checkKey: "repo_readability",
      label: "Repository contents read",
      status: "SKIPPED",
      detail: unread,
      weight: 0,
      sortOrder: 19,
    });
  }

  const health = codeHealthCheck(args.repos ?? []);
  if (health) checks.push(health);

  return checks;
}

/**
 * The measured code of the candidate's top repos, as one evidence row. Never FAIL: this is
 * a person's public, often personal, code, so a low reading is something to ask about in
 * an interview, not a verdict. SKIPPED (not WARN) when nothing could be measured, because
 * "we could not read it" is not a finding about the candidate.
 */
export function codeHealthCheck(repos: GitHubRepoSnapshot[]) {
  const tried = repos.filter((r) => r.codeHealth);
  if (tried.length === 0) return null;
  const measured = tried.filter((r) => r.codeHealth!.score !== null);
  const lines = tried.map((r) => {
    const h = r.codeHealth!;
    if (h.score === null) return `${r.fullName}: not measured (${h.unavailable ?? "unknown"})`;
    const worst = h.topDebt[0] ? `; most complex: ${h.topDebt[0].symbol} (${h.topDebt[0].path}:${h.topDebt[0].line})` : "";
    return `${r.fullName}: ${h.score}/100 over ${h.loc.toLocaleString("en-GB")} lines (${h.languages.join(", ")})${worst}`;
  });
  const avg = measured.length ? Math.round(measured.reduce((s, r) => s + (r.codeHealth!.score ?? 0), 0) / measured.length) : null;
  return {
    category: "Code Quality",
    checkKey: "measured_code_health",
    label: "Code health of their repos (measured)",
    status: avg === null ? ("SKIPPED" as const) : avg >= 75 ? ("PASS" as const) : ("WARN" as const),
    detail:
      (avg === null
        ? "Their repositories could not be measured, so this says nothing either way. "
        : `Average code health ${avg}/100 across ${measured.length} repo${measured.length === 1 ? "" : "s"}, measured by parsing every source file. Evidence only: it does not change the recommended scores, because public repos are often old, experimental or shared. `) +
      lines.join(" · "),
    weight: 1,
    sortOrder: 24,
  };
}

// ─── Scoped repo analysis ─────────────────────────────────────────────────────

/**
 * Parse a GitHub repo URL into { owner, repo }. Accepts:
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo.git
 *   - git@github.com:owner/repo.git
 *   - owner/repo (already an identifier)
 */
export function parseGitHubRepo(input: string): { owner: string; repo: string } | null {
  if (!input) return null;
  const trimmed = input.trim().replace(/\.git$/, "");

  // owner/repo shorthand
  if (/^[a-zA-Z0-9][\w.-]*\/[a-zA-Z0-9][\w.-]*$/.test(trimmed)) {
    const [owner, repo] = trimmed.split("/");
    return { owner, repo };
  }

  // SSH form
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+)$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  // HTTPS form
  try {
    const url = new URL(trimmed);
    if (url.hostname.endsWith("github.com")) {
      const parts = url.pathname.replace(/^\//, "").split("/");
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return { owner: parts[0], repo: parts[1] };
      }
    }
  } catch {
    // not a URL, fall through
  }

  return null;
}

interface ScopedCommitFile {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
}

interface ScopedCommitResponse {
  sha: string;
  commit: {
    author: { name: string; email: string; date: string } | null;
    message: string;
  };
  author: { login: string } | null;
  files?: ScopedCommitFile[];
}

export interface ScopedRepoAnalysis {
  /** Repo we scanned. */
  owner: string;
  repo: string;
  /** Paths the dev was responsible for. Empty array = whole repo. */
  paths: string[];
  branch: string | null;
  /** Total commits authored by this user touching the scoped paths in the
   *  last RECENT_ACTIVITY_WINDOW_DAYS. */
  commitCount: number;
  /** Commits with at least one file in the scoped paths (after filtering). */
  scopedCommitCount: number;
  /** Unique files touched in the scoped paths. */
  uniqueFiles: number;
  /** Total lines added / removed across the sampled commits. */
  additions: number;
  deletions: number;
  /** ISO timestamp of the most recent matching commit. */
  lastCommitAt: string | null;
  /** Sample (most recent N) of the commits we evaluated, for the audit trail. */
  sample: Array<{ sha: string; date: string; message: string; filesTouched: number }>;
}

const SAMPLE_LIMIT = 30;

function matchesPath(filename: string, paths: string[]): boolean {
  if (paths.length === 0) return true;
  return paths.some((entry) => {
    const cleaned = entry.replace(/^\.\//, "").replace(/^\/+/, "");
    if (!cleaned) return true;
    // Prefix match: "apps/web" matches "apps/web/anything"
    // Also handle a trailing slash in the path or a trailing /** glob
    const normalised = cleaned.replace(/\/\*\*?$/, "").replace(/\/$/, "");
    return filename === normalised || filename.startsWith(`${normalised}/`);
  });
}

/**
 * Scan a specific repo for commits authored by `handle`, optionally filtered
 * to a set of paths and a branch. Used by the per-engagement validation
 * scan triggered from a Placement.
 *
 * This is a real GitHub API call — uses GITHUB_TOKEN if set. Without a
 * token the API rate-limits at 60 req/h, so private repos will fail and
 * busy workspaces will hit limits. The endpoint surfaces a clear error
 * in that case so the UI can prompt for a token.
 */
export async function analyzeGitHubRepoScope(args: {
  handle: string;
  repoUrl: string;
  paths: string[];
  branch?: string | null;
}): Promise<ScopedRepoAnalysis> {
  const parsed = parseGitHubRepo(args.repoUrl);
  if (!parsed) {
    throw new GitHubAnalysisError(
      "GITHUB_BAD_REPO_URL",
      `Could not parse GitHub repo URL: ${args.repoUrl}`,
    );
  }
  const { owner, repo } = parsed;
  const paths = args.paths.filter((p) => p.trim().length > 0);
  const branch = args.branch?.trim() || null;

  // GitHub's /commits endpoint supports ?author=<login>&path=<single path>.
  // For multiple paths we'd need multiple requests; for simplicity we ask
  // for everything authored by this user and filter client-side. Capped to
  // SAMPLE_LIMIT to keep the request small.
  const params = new URLSearchParams({ author: args.handle, per_page: String(SAMPLE_LIMIT) });
  if (branch) params.set("sha", branch);
  // If exactly one path is provided, narrow server-side too.
  if (paths.length === 1) params.set("path", paths[0]);

  const commits = await githubRequest<ScopedCommitResponse[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${params.toString()}`,
  );

  // For each commit, fetch the file list and filter against paths.
  // We avoid fetching commit details if no path filter is needed.
  let scopedCommitCount = 0;
  const uniqueFiles = new Set<string>();
  let additions = 0;
  let deletions = 0;
  let lastCommitAt: string | null = null;
  const sample: ScopedRepoAnalysis["sample"] = [];

  for (const commit of commits) {
    const date = commit.commit.author?.date ?? null;
    if (date && (!lastCommitAt || new Date(date) > new Date(lastCommitAt))) {
      lastCommitAt = date;
    }

    // If no path filter, every commit counts.
    if (paths.length === 0) {
      scopedCommitCount += 1;
      sample.push({
        sha: commit.sha,
        date: date ?? "",
        message: commit.commit.message.split("\n")[0],
        filesTouched: 0,
      });
      continue;
    }

    // Fetch commit detail for the file list. Errors here are non-fatal —
    // we just skip the commit if we can't read its files.
    try {
      const detail = await githubRequest<ScopedCommitResponse>(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${commit.sha}`,
      );
      const files = detail.files ?? [];
      const matchingFiles = files.filter((file) => matchesPath(file.filename, paths));
      if (matchingFiles.length === 0) continue;
      scopedCommitCount += 1;
      for (const file of matchingFiles) {
        uniqueFiles.add(file.filename);
        additions += file.additions ?? 0;
        deletions += file.deletions ?? 0;
      }
      sample.push({
        sha: commit.sha,
        date: date ?? "",
        message: commit.commit.message.split("\n")[0],
        filesTouched: matchingFiles.length,
      });
    } catch {
      continue;
    }
  }

  return {
    owner,
    repo,
    paths,
    branch,
    commitCount: commits.length,
    scopedCommitCount,
    uniqueFiles: uniqueFiles.size,
    additions,
    deletions,
    lastCommitAt,
    sample,
  };
}

/**
 * Translate a ScopedRepoAnalysis into CodeClearCheck rows for the per-placement
 * validation pane. Keeps the same PASS/WARN/FAIL semantics as the profile-scoped
 * checks but with engagement-specific categories.
 */
export function buildChecksFromScopedAnalysis(
  analysis: ScopedRepoAnalysis,
): Array<{
  category: string;
  checkKey: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL" | "SKIPPED";
  detail: string | null;
  weight: number;
  sortOrder: number;
}> {
  const band = (
    value: number,
    pass: number,
    warn: number,
  ): "PASS" | "WARN" | "FAIL" => (value >= pass ? "PASS" : value >= warn ? "WARN" : "FAIL");

  const daysSinceLast = analysis.lastCommitAt
    ? Math.floor(
        (Date.now() - new Date(analysis.lastCommitAt).getTime()) / (1000 * 60 * 60 * 24),
      )
    : null;

  const scopeLabel =
    analysis.paths.length === 0
      ? "whole repo"
      : `${analysis.paths.length} path${analysis.paths.length === 1 ? "" : "s"}`;

  return [
    {
      category: "Engagement Activity",
      checkKey: "scoped_commit_count",
      label: "Commits in scope",
      status: band(analysis.scopedCommitCount, 5, 1),
      detail: `${analysis.scopedCommitCount} commits in ${scopeLabel} (sample of ${analysis.commitCount} recent commits).`,
      weight: 2,
      sortOrder: 10,
    },
    {
      category: "Engagement Activity",
      checkKey: "scoped_recency",
      label: "Recent activity",
      status:
        daysSinceLast === null
          ? "FAIL"
          : daysSinceLast <= 14
            ? "PASS"
            : daysSinceLast <= 60
              ? "WARN"
              : "FAIL",
      detail:
        daysSinceLast === null
          ? "No matching commits found."
          : `Last in-scope commit was ${daysSinceLast} day${daysSinceLast === 1 ? "" : "s"} ago.`,
      weight: 1,
      sortOrder: 11,
    },
    {
      category: "Engagement Activity",
      checkKey: "scoped_file_breadth",
      label: "Files touched",
      status: band(analysis.uniqueFiles, 8, 2),
      detail: `${analysis.uniqueFiles} unique files modified in scope.`,
      weight: 1,
      sortOrder: 12,
    },
    {
      category: "Engagement Activity",
      checkKey: "scoped_volume",
      label: "Change volume",
      status: band(analysis.additions + analysis.deletions, 200, 30),
      detail: `+${analysis.additions} / -${analysis.deletions} lines in scope.`,
      weight: 1,
      sortOrder: 13,
    },
  ];
}
