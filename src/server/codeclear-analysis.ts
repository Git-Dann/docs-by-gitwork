import type {
  GitHubAnalysisMetrics,
  GitHubLanguageUsage,
  GitHubProfileSnapshot,
  GitHubRepoSnapshot,
} from "@/types/codeclear";
import { clampScore } from "@/server/codeclear";

const GITHUB_API_BASE = "https://api.github.com";
const ANALYSIS_VERSION = "docs-codeclear-v1";
const MAX_REPOS = 6;
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

type GitHubContentResponse =
  | Array<{
      name: string;
      type: "file" | "dir";
    }>
  | {
      message?: string;
    };

export class GitHubAnalysisError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GitHubAnalysisError";
    this.code = code;
  }
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN?.trim();

  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "foundry-by-gitwork-code",
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
  };
}

async function githubRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: githubHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    const message = body || `GitHub request failed with status ${response.status}.`;

    if (response.status === 404) {
      throw new GitHubAnalysisError("GITHUB_NOT_FOUND", "GitHub profile or repository not found.");
    }

    if (response.status === 403) {
      throw new GitHubAnalysisError(
        "GITHUB_RATE_LIMITED",
        "GitHub analysis is temporarily rate limited. Try again shortly or configure GITHUB_TOKEN.",
      );
    }

    throw new GitHubAnalysisError("GITHUB_REQUEST_FAILED", message);
  }

  return response.json() as Promise<T>;
}

async function safeGithubRequest<T>(path: string, fallback: T): Promise<T> {
  try {
    return await githubRequest<T>(path);
  } catch {
    return fallback;
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

function detectRepoSignals(contents: GitHubContentResponse) {
  const entries = Array.isArray(contents) ? contents : [];
  const names = entries.map((entry) => entry.name.toLowerCase());

  const hasReadme = names.some((name) => name.startsWith("readme"));
  const hasDocs = hasReadme || names.includes("docs") || names.includes("documentation");
  const hasTests = names.includes("test") || names.includes("tests") || names.includes("__tests__");
  const hasCi = names.includes(".github") || names.includes(".circleci");
  const hasLint =
    names.includes("eslint.config.js") ||
    names.includes(".eslintrc") ||
    names.includes(".eslintrc.js") ||
    names.includes(".eslintrc.cjs") ||
    names.includes("biome.json") ||
    names.includes("ruff.toml");
  const hasManifest =
    names.includes("package.json") ||
    names.includes("pyproject.toml") ||
    names.includes("cargo.toml") ||
    names.includes("go.mod") ||
    names.includes("composer.json") ||
    names.includes("gemfile") ||
    names.includes("requirements.txt");

  return {
    hasReadme,
    hasDocs,
    hasTests,
    hasCi,
    hasLint,
    hasManifest,
  };
}

function buildHealthScore(input: {
  stars: number;
  forks: number;
  recentActivity: boolean;
  hasDocs: boolean;
  hasTests: boolean;
  hasCi: boolean;
  hasLint: boolean;
  hasManifest: boolean;
  recentCommitCount: number;
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
  score += Math.min(10, input.recentCommitCount);

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

  return `${args.profile.name ?? args.profile.login} shows strongest public signal in ${topLanguage} with ${args.metrics.selectedRepoCount} sampled repositories, ${recentRepos}% recent activity, and an average repository health score of ${args.metrics.averageHealthScore}.${flags}`;
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
        safeGithubRequest<Record<string, number>>(`/repos/${repo.full_name}/languages`, {}),
        safeGithubRequest<GitHubContentResponse>(`/repos/${repo.full_name}/contents`, []),
        safeGithubRequest<Array<{ sha: string }>>(
          `/repos/${repo.full_name}/commits?per_page=20`,
          [],
        ),
      ]);

      const signals = detectRepoSignals(contents);
      const recentCommitCount = commits.length;
      const recentActivity = isRecent(repo.pushed_at);
      const languagesList: GitHubLanguageUsage[] = Object.entries(languages)
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
        hasReadme: signals.hasReadme,
        hasDocs: signals.hasDocs,
        hasTests: signals.hasTests,
        hasCi: signals.hasCi,
        hasLint: signals.hasLint,
        hasManifest: signals.hasManifest,
        topics: repo.topics ?? [],
        languages: languagesList,
        pushedAt: repo.pushed_at,
        updatedAt: repo.updated_at,
        healthScore,
      };

      return snapshot;
    }),
  );

  const aggregatedLanguages = aggregateLanguages(repoDetails.map((repo) => {
    const map: Record<string, number> = {};
    for (const language of repo.languages) {
      map[language.language] = language.bytes;
    }
    return map;
  }));

  const coverageCount = repoDetails.length || 1;
  const metrics: GitHubAnalysisMetrics = {
    publicRepoCount: reposResponse.length,
    selectedRepoCount: repoDetails.length,
    totalStars: repoDetails.reduce((sum, repo) => sum + repo.stars, 0),
    averageStars: repoDetails.length
      ? Math.round(repoDetails.reduce((sum, repo) => sum + repo.stars, 0) / repoDetails.length)
      : 0,
    languageCount: aggregatedLanguages.length,
    topLanguages: aggregatedLanguages.slice(0, 5),
    recentRepoRatio: repoDetails.length
      ? Math.round(
          (repoDetails.filter((repo) => repo.recentActivity).length / repoDetails.length) * 100,
        )
      : 0,
    docsCoverage: Math.round(
      (repoDetails.filter((repo) => repo.hasDocs).length / coverageCount) * 100,
    ),
    testsCoverage: Math.round(
      (repoDetails.filter((repo) => repo.hasTests).length / coverageCount) * 100,
    ),
    ciCoverage: Math.round(
      (repoDetails.filter((repo) => repo.hasCi).length / coverageCount) * 100,
    ),
    lintCoverage: Math.round(
      (repoDetails.filter((repo) => repo.hasLint).length / coverageCount) * 100,
    ),
    manifestCoverage: Math.round(
      (repoDetails.filter((repo) => repo.hasManifest).length / coverageCount) * 100,
    ),
    averageRecentCommitCount: repoDetails.length
      ? Math.round(
          repoDetails.reduce((sum, repo) => sum + repo.recentCommitCount, 0) / repoDetails.length,
        )
      : 0,
    averageHealthScore: repoDetails.length
      ? Math.round(
          repoDetails.reduce((sum, repo) => sum + repo.healthScore, 0) / repoDetails.length,
        )
      : 0,
  };

  const redFlags: string[] = [];
  if (metrics.selectedRepoCount < 2) {
    redFlags.push("Small public repo sample.");
  }
  if (metrics.recentRepoRatio < 35) {
    redFlags.push("Low recent public activity.");
  }
  if (metrics.docsCoverage < 30) {
    redFlags.push("Limited documentation coverage.");
  }
  if (metrics.testsCoverage < 25) {
    redFlags.push("Limited visible test coverage.");
  }
  if (metrics.ciCoverage < 25) {
    redFlags.push("Limited visible CI coverage.");
  }

  const recommendedTechnicalDepth = clampScore(
    42 +
      metrics.averageHealthScore * 0.34 +
      Math.min(12, metrics.languageCount * 2) +
      Math.min(12, metrics.averageRecentCommitCount),
  );
  const recommendedCodeQuality = clampScore(
    28 +
      metrics.docsCoverage * 0.18 +
      metrics.testsCoverage * 0.22 +
      metrics.ciCoverage * 0.16 +
      metrics.lintCoverage * 0.12 +
      metrics.averageHealthScore * 0.15,
  );
  const recommendedDeliveryReadiness = clampScore(
    34 +
      metrics.recentRepoRatio * 0.22 +
      metrics.ciCoverage * 0.16 +
      metrics.manifestCoverage * 0.14 +
      metrics.averageHealthScore * 0.18,
  );

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
      status: band(metrics.averageRecentCommitCount, 10, 3),
      detail: `${metrics.averageRecentCommitCount} commits per repo on average (recent)`,
      weight: 1,
      sortOrder: 12,
    },
    {
      category: "GitHub Activity",
      checkKey: "language_breadth",
      label: "Language breadth",
      status: band(metrics.languageCount, 3, 2),
      detail: `${metrics.languageCount} languages across sampled repos`,
      weight: 1,
      sortOrder: 13,
    },

    // Code Quality
    {
      category: "Code Quality",
      checkKey: "docs_coverage",
      label: "Documentation coverage",
      status: band(metrics.docsCoverage, 60, 30),
      detail: `${metrics.docsCoverage}% of sampled repos have a README`,
      weight: 1,
      sortOrder: 20,
    },
    {
      category: "Code Quality",
      checkKey: "tests_coverage",
      label: "Test coverage signal",
      status: band(metrics.testsCoverage, 50, 25),
      detail: `${metrics.testsCoverage}% of sampled repos contain a test folder`,
      weight: 2,
      sortOrder: 21,
    },
    {
      category: "Code Quality",
      checkKey: "ci_coverage",
      label: "CI present",
      status: band(metrics.ciCoverage, 50, 25),
      detail: `${metrics.ciCoverage}% of sampled repos have a CI workflow file`,
      weight: 2,
      sortOrder: 22,
    },
    {
      category: "Code Quality",
      checkKey: "lint_coverage",
      label: "Linter configured",
      status: band(metrics.lintCoverage, 50, 25),
      detail: `${metrics.lintCoverage}% of sampled repos have a linter config`,
      weight: 1,
      sortOrder: 23,
    },

    // Delivery Signals
    {
      category: "Delivery Signals",
      checkKey: "manifest_coverage",
      label: "Package manifest present",
      status: band(metrics.manifestCoverage, 70, 40),
      detail: `${metrics.manifestCoverage}% of sampled repos have a package manifest`,
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

  return checks;
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
