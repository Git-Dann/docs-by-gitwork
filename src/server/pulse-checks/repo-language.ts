import { isExampleOrFixturePath, isVendoredPath } from "./native-mobile";

/**
 * Which language a repository is written in, from its file tree. Used to stop asking a
 * Python or Go project about TypeScript and Jest: those checks are JavaScript tooling,
 * and on any other language they can only ever read as "missing" (the §34.1 problem,
 * one step out from mobile).
 */

export type RepoLanguage = "javascript" | "python" | "ruby" | "go" | "jvm" | "php" | "dotnet" | "rust" | "swift" | "dart" | "other";

const EXT: Record<string, RepoLanguage> = {
  ts: "javascript", tsx: "javascript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript", vue: "javascript", svelte: "javascript",
  py: "python",
  rb: "ruby",
  go: "go",
  java: "jvm", kt: "jvm", kts: "jvm", scala: "jvm",
  php: "php",
  cs: "dotnet", fs: "dotnet",
  rs: "rust",
  swift: "swift",
  dart: "dart",
};

const LABEL: Record<RepoLanguage, string> = {
  javascript: "JavaScript / TypeScript", python: "Python", ruby: "Ruby", go: "Go", jvm: "Java / Kotlin",
  php: "PHP", dotnet: ".NET", rust: "Rust", swift: "Swift", dart: "Dart", other: "this language",
};

/** The language with the most source files, ignoring vendored, example and generated code. */
export function dominantLanguage(paths: string[]): RepoLanguage | null {
  const counts = new Map<RepoLanguage, number>();
  for (const p of paths) {
    if (isVendoredPath(p) || isExampleOrFixturePath(p) || /(^|\/)(dist|build|docs?|\.github)\//.test(p) || /\.(min\.js|d\.ts)$/.test(p)) continue;
    const lang = EXT[p.slice(p.lastIndexOf(".") + 1).toLowerCase()];
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0] ?? null;
}

/**
 * A repo is a JavaScript project when its root has a package.json, or JavaScript is its
 * main language. Anything with a root package.json keeps every JS check: a Django app
 * with a React front end really should be asked about TypeScript.
 */
export function isJavaScriptProject(paths: string[]): boolean {
  if (paths.includes("package.json")) return true;
  const lang = dominantLanguage(paths);
  return lang === null || lang === "javascript";
}

/** Generic repo checks that only make sense for JavaScript tooling. */
const JS_TOOLING_CHECKS = ["has_typescript", "has_unit_test_config", "has_e2e_tests", "is_monorepo"] as const;

export function nonJsSkipReason(checkKey: string, paths: string[]): string | undefined {
  if (!(JS_TOOLING_CHECKS as readonly string[]).includes(checkKey) || isJavaScriptProject(paths)) return undefined;
  const lang = LABEL[dominantLanguage(paths) ?? "other"];
  return `Not applicable: this check looks for JavaScript tooling (TypeScript, Jest/Vitest, Playwright/Cypress, JS monorepo tools), and this repository is written in ${lang}.`;
}

export function applyLanguageApplicability<T extends { checkKey: string; status: string; detail?: string }>(checks: T[], paths: string[]): T[] {
  return checks.map((c) => {
    const reason = nonJsSkipReason(c.checkKey, paths);
    return reason ? { ...c, status: "SKIPPED", detail: reason } : c;
  });
}

/** Lint configs outside the JavaScript world, so a Python repo using ruff is not "unlinted". */
export function hasNonJsLinter(paths: string[], rootPyproject?: string | null): boolean {
  const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);
  const files = new Set(paths.filter((p) => !isVendoredPath(p)).map(base));
  const known = ["ruff.toml", ".ruff.toml", ".flake8", ".pylintrc", "pylintrc", ".rubocop.yml", ".golangci.yml", ".golangci.yaml", "detekt.yml", ".swiftlint.yml", "phpstan.neon", "phpstan.neon.dist", ".php-cs-fixer.php", "analysis_options.yaml", "clippy.toml", ".editorconfig-checker.json", "checkstyle.xml"];
  if (known.some((f) => files.has(f))) return true;
  return !!rootPyproject && /^\[tool\.(ruff|pylint|flake8|black|mypy)\b/m.test(rootPyproject);
}

export function languageTechStack(paths: string[]): string[] {
  const lang = dominantLanguage(paths);
  return lang && lang !== "other" && lang !== "javascript" ? [LABEL[lang]] : [];
}
