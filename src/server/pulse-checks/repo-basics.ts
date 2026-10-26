/**
 * Repo basics: tests, linter, CI, automated dependency updates.
 *
 * Pure (no GitHub calls). `runGithubChecks` hands in the root listing it already has
 * plus the shared tree snapshot, and each detector answers PRESENT / ABSENT / UNKNOWN.
 *
 * Why this exists (October 2026 audit, CLAUDE.md §62): the old checks were
 * presence-of-a-name tests over the ROOT listing only —
 *   - has_tests counted five top-level folder names, so colocated `*.test.ts`,
 *     `e2e/`, `src/tests/`, Go `_test.go`, Xcode `*Tests.swift` and a jest/vitest
 *     config all read as "no tests";
 *   - has_linter missed `.eslintrc.json/.cjs/.yml`, `eslint.config.ts` and counted
 *     `.prettierrc` — a FORMATTER — as a linter;
 *   - ci_cd_present and has_dependabot passed on ANY `.github` directory, including
 *     one holding only a PR template.
 *
 * ⚠️ ABSENT is only returned when the evidence can actually support it: the tree was
 * read and is not truncated, or (for root-only artefacts) the root listing settles it.
 * Otherwise UNKNOWN, which the caller reports as INCONCLUSIVE (§35: "we could not look"
 * is not "it isn't there").
 */

export type Tri = "present" | "absent" | "unknown";

export interface RepoBasicsInput {
  /** Root listing names, lower-cased. Always complete when the repo was readable. */
  rootNames: string[];
  /** Every blob path from the tree snapshot (any case), or null when the tree was not read. */
  paths: string[] | null;
  /** True when GitHub truncated the tree, so `paths` is incomplete. */
  truncated: boolean;
  /** Root package.json text, when the snapshot carried it. */
  packageJson?: string | null;
  /** Root pyproject.toml text, when read. */
  pyproject?: string | null;
}

export interface Detection {
  state: Tri;
  /** What was found (a path or a config), for the PASS detail. */
  evidence?: string;
}

const VENDORED = /(^|\/)(node_modules|vendor|pods|carthage|\.build|deriveddata|bower_components|third_party|third-party)\//;
const EXAMPLE = /(^|\/)(examples?|samples?|demos?|fixtures?|__fixtures__|templates?|playgrounds?|starters?|boilerplates?)\//;

function ownPaths(paths: string[]): string[] {
  return paths.map((p) => p.toLowerCase()).filter((p) => !VENDORED.test(p) && !EXAMPLE.test(p));
}

const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);

/** The tree can prove absence only when it was read in full. */
function treeIsComplete(input: RepoBasicsInput): boolean {
  return input.paths !== null && !input.truncated;
}

function parseJson(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// `spec/` is deliberately NOT matched below the root: docs/spec/ is as often an API
// specification as a test folder.
const TEST_DIR = /(^|\/)(tests?|__tests__|e2e|cypress|androidtest|integration_test|integration-tests?|test_driver)\//;
/** Matched against the LOWER-CASED path. */
const TEST_FILE = [
  /\.(test|spec)\.[cm]?[jt]sx?$/, // Jest / Vitest / Mocha colocated
  /_test\.go$/,
  /(^|\/)test_[^/]+\.py$/,
  /_test\.py$/,
  /_spec\.rb$/,
  /_test\.rb$/,
  /_test\.dart$/,
  /\.xctestplan$/,
];
/**
 * Matched against the ORIGINAL-case path. XCTest / JUnit / PHPUnit name classes
 * FooTests.swift / FooTest.kt / FooTest.php; lower-cased, `latest.swift` would match.
 */
const TEST_FILE_CASED = [/[a-z0-9]Tests?\.(swift|kt|java|php)$/];
const TEST_CONFIG = [
  /^(jest|vitest|playwright|cypress|karma|ava|wdio)\.(config|conf)\.[cm]?[jt]s$/,
  /^vitest\.workspace\.[cm]?[jt]s$/,
  /^\.mocharc(\.(js|cjs|json|ya?ml))?$/,
  /^(pytest\.ini|conftest\.py|phpunit\.xml(\.dist)?|\.rspec|cypress\.json)$/,
];

/** npm's placeholder script — `npm init` writes it, so it is not a test suite. */
const NPM_PLACEHOLDER = /no test specified/i;

export function detectTests(input: RepoBasicsInput): Detection {
  const pkg = parseJson(input.packageJson);
  const script = (pkg?.scripts as Record<string, unknown> | undefined)?.test;
  if (typeof script === "string" && script.trim() && !NPM_PLACEHOLDER.test(script)) {
    return { state: "present", evidence: `package.json "test" script (${script.trim().slice(0, 60)})` };
  }
  if (input.pyproject && /^\[tool\.pytest\b/m.test(input.pyproject)) {
    return { state: "present", evidence: "pytest configured in pyproject.toml" };
  }
  // Root folder names stay sufficient on their own (the root listing is always complete).
  const rootDir = input.rootNames.find((n) => ["test", "tests", "__tests__", "spec", "specs", "e2e"].includes(n));
  if (rootDir) return { state: "present", evidence: `${rootDir}/` };

  const paths = input.paths ? ownPaths(input.paths) : [];
  for (const p of paths) {
    const b = base(p);
    if (TEST_CONFIG.some((re) => re.test(b))) return { state: "present", evidence: p };
  }
  for (const p of paths) {
    if (TEST_FILE.some((re) => re.test(p))) return { state: "present", evidence: p };
  }
  const cased = (input.paths ?? []).find(
    (p) => TEST_FILE_CASED.some((re) => re.test(p)) && !VENDORED.test(p.toLowerCase()) && !EXAMPLE.test(p.toLowerCase()),
  );
  if (cased) return { state: "present", evidence: cased };
  const dir = paths.find((p) => TEST_DIR.test(p));
  if (dir) return { state: "present", evidence: dir };

  return { state: treeIsComplete(input) ? "absent" : "unknown" };
}

// ── Linter ────────────────────────────────────────────────────────────────────

const JS_LINT_CONFIG = [
  /^\.eslintrc(\.(js|cjs|mjs|json|ya?ml))?$/,
  /^eslint\.config\.[cm]?[jt]s$/,
  /^biome\.jsonc?$/,
  /^\.?oxlintrc\.json$/,
  /^oxlint\.json$/,
  /^tslint\.json$/,
  /^\.jshintrc$/,
  /^deno\.jsonc?$/,
];
const NON_JS_LINT_CONFIG = new Set([
  "ruff.toml", ".ruff.toml", ".flake8", ".pylintrc", "pylintrc", ".rubocop.yml", ".golangci.yml",
  ".golangci.yaml", ".golangci.toml", "detekt.yml", ".swiftlint.yml", "phpstan.neon", "phpstan.neon.dist",
  ".php-cs-fixer.php", ".php-cs-fixer.dist.php", "analysis_options.yaml", "clippy.toml", ".clippy.toml",
  "checkstyle.xml", ".credo.exs", ".stylelintrc", ".stylelintrc.json",
]);
/** Lint tools a package.json can carry without a separate config file. */
const LINT_DEPS = ["eslint", "@biomejs/biome", "oxlint", "xo", "standard", "tslint"];

export function detectLinter(input: RepoBasicsInput): Detection {
  const pkg = parseJson(input.packageJson);
  if (pkg && ("eslintConfig" in pkg || "xo" in pkg || "standard" in pkg)) {
    return { state: "present", evidence: "lint config in package.json" };
  }
  const deps = { ...(pkg?.dependencies as object), ...(pkg?.devDependencies as object) } as Record<string, unknown>;
  const dep = LINT_DEPS.find((d) => d in deps);
  if (dep) return { state: "present", evidence: `${dep} in package.json` };
  if (input.pyproject && /^\[tool\.(ruff|pylint|flake8)\b/m.test(input.pyproject)) {
    return { state: "present", evidence: "linter configured in pyproject.toml" };
  }
  const isLintFile = (b: string) => JS_LINT_CONFIG.some((re) => re.test(b)) || NON_JS_LINT_CONFIG.has(b);
  const rootHit = input.rootNames.find(isLintFile);
  if (rootHit) return { state: "present", evidence: rootHit };
  const hit = (input.paths ? ownPaths(input.paths) : []).find((p) => isLintFile(base(p)));
  if (hit) return { state: "present", evidence: hit };
  // Absent needs the full tree: monorepos keep lint config per package.
  return { state: treeIsComplete(input) ? "absent" : "unknown" };
}

// ── CI ────────────────────────────────────────────────────────────────────────

const ROOT_CI_FILES = new Set([
  ".gitlab-ci.yml", ".travis.yml", "azure-pipelines.yml", "azure-pipelines.yaml", "bitbucket-pipelines.yml",
  "jenkinsfile", ".drone.yml", "appveyor.yml", ".appveyor.yml", ".woodpecker.yml", "cloudbuild.yaml",
  "cloudbuild.yml", "codemagic.yaml", "bitrise.yml", "buildspec.yml", ".cirrus.yml",
]);
const CI_PATH = [
  /^\.github\/workflows\/[^/]+\.ya?ml$/,
  /^\.circleci\/config\.ya?ml$/,
  /^\.buildkite\/[^/]+\.ya?ml$/,
  /^\.semaphore\/[^/]+\.ya?ml$/,
  /^\.woodpecker\/[^/]+\.ya?ml$/,
  /^\.gitlab-ci\.yml$/,
];

export function detectCi(input: RepoBasicsInput): Detection {
  const rootHit = input.rootNames.find((n) => ROOT_CI_FILES.has(n));
  if (rootHit) return { state: "present", evidence: rootHit };
  const hit = (input.paths ?? []).map((p) => p.toLowerCase()).find((p) => CI_PATH.some((re) => re.test(p)));
  if (hit) return { state: "present", evidence: hit };
  // A CI config lives in a dot-directory at the root. With none of those at the root,
  // the (always complete) root listing settles it.
  const hasCiDir = input.rootNames.some((n) => [".github", ".circleci", ".buildkite", ".semaphore", ".woodpecker"].includes(n));
  if (!hasCiDir) return { state: "absent" };
  return { state: treeIsComplete(input) ? "absent" : "unknown" };
}

// ── Dependabot / Renovate ─────────────────────────────────────────────────────

const DEP_UPDATE_PATH = /^(\.github\/dependabot\.ya?ml|(\.github\/|\.gitlab\/)?(renovate\.json5?|\.renovaterc(\.json5?)?))$/;

export function detectDependencyUpdates(input: RepoBasicsInput): Detection {
  const rootHit = input.rootNames.find((n) => /^(renovate\.json5?|\.renovaterc(\.json5?)?)$/.test(n));
  if (rootHit) return { state: "present", evidence: rootHit };
  const pkg = parseJson(input.packageJson);
  if (pkg && "renovate" in pkg) return { state: "present", evidence: "renovate config in package.json" };
  const hit = (input.paths ?? []).map((p) => p.toLowerCase()).find((p) => DEP_UPDATE_PATH.test(p));
  if (hit) return { state: "present", evidence: hit };
  // dependabot.yml must live in .github/; no .github (or .gitlab) dir ⇒ settled by the root listing.
  if (!input.rootNames.includes(".github") && !input.rootNames.includes(".gitlab")) return { state: "absent" };
  return { state: treeIsComplete(input) ? "absent" : "unknown" };
}
