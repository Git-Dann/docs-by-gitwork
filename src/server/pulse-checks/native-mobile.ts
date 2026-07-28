// ─────────────────────────────────────────────────────────────────────────────
// NATIVE MOBILE REPO SUPPORT — platform detection + generic-check applicability.
//
// WHY THIS EXISTS. Pulse's generic repo checks (runGithubChecks in pulse-scan.ts,
// runCodeAgent) were written for web/JS services: they look for a top-level
// `test/` directory, an ESLint config, a tsconfig, a Dockerfile, an .env.example.
// A native iOS or Android app has none of those *by design* — its tests live in
// an Xcode test target, its linter is SwiftLint, its config is an .xcconfig.
//
// Before this module, every one of those emitted FAIL/WARN, so a flawless native
// app scored the same as a broken one. Measured on a real client app
// (Fellas iOS, 39k LOC, live on the App Store): three scans over two months
// returned 47 / 50 / 50 with identical findings — the score was a floor for the
// input type, carrying no information about the app.
//
// The fix is the mechanism Pulse already sanctions: SKIPPED. score-breakdown.ts
// excludes SKIPPED from both numerator and denominator, so a check that cannot
// apply stops dragging the score instead of being counted as a failure. This is
// the same pattern the Supabase RLS check uses ("applicable: false" + a reason).
//
// Everything here is PURE — no I/O, no GitHub calls — so it is unit-tested
// directly. The network side lives in native-repo.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Native/cross-platform mobile project shapes Pulse can recognise. */
export type NativePlatform = "ios" | "android" | "react-native" | "flutter";

/** A repo tree + the subset of file contents we fetched, shared by all checks. */
export interface RepoSnapshot {
  owner: string;
  repo: string;
  /** Every blob path in the tree (POSIX, repo-relative). */
  paths: string[];
  /** path → UTF-8 text, only for the capped set of files we chose to read. */
  files: Map<string, string>;
  /** GitHub truncates very large trees; findings stay best-effort when true. */
  truncated: boolean;
  /** False when the tree could not be read (private repo / no token / empty). */
  accessible: boolean;
}

/** Case-insensitive "does any path match" helper. */
export function anyPath(paths: string[], re: RegExp): boolean {
  return paths.some((p) => re.test(p));
}

/**
 * Dependency source trees. Never sampled and never counted as the app's own code —
 * otherwise Pods/ (which can be 68% of a CocoaPods repo) dominates every density
 * metric and the findings describe the dependencies rather than the app.
 */
export function isVendoredPath(path: string): boolean {
  return /(^|\/)(Pods|Carthage|vendor|node_modules|\.build|DerivedData)\//i.test(path);
}

/**
 * Identify the project shape from its file tree.
 *
 * Order matters: React Native and Flutter projects CONTAIN `ios/` and `android/`
 * subdirectories (with real Info.plist / AndroidManifest.xml files), so they must
 * be matched before the native cases or every RN app reads as native iOS. Their
 * root manifest is the discriminator.
 */
export function detectNativePlatform(paths: string[]): NativePlatform | null {
  // Flutter — pubspec.yaml at the root is definitive.
  if (anyPath(paths, /^pubspec\.ya?ml$/i)) return "flutter";

  // React Native — a JS manifest plus RN-specific tooling or platform folders.
  const hasJsManifest = anyPath(paths, /^package\.json$/);
  if (hasJsManifest) {
    const rnSignal =
      anyPath(paths, /^metro\.config\.(js|cjs|ts)$/i) ||
      anyPath(paths, /^app\.(json|config\.(js|ts))$/i) ||
      anyPath(paths, /^(ios|android)\//i);
    if (rnSignal) return "react-native";
  }

  // Native iOS — an Xcode project/workspace, or Swift sources beside an Info.plist.
  const hasXcode = anyPath(paths, /\.(xcodeproj|xcworkspace)(\/|$)/i);
  const hasSwift = anyPath(paths, /\.swift$/i);
  const hasInfoPlist = anyPath(paths, /(^|\/)Info\.plist$/i);
  if (hasXcode || (hasSwift && hasInfoPlist)) return "ios";

  // Native Android — Gradle plus a manifest.
  const hasGradle = anyPath(paths, /(^|\/)build\.gradle(\.kts)?$/i);
  const hasAndroidManifest = anyPath(paths, /(^|\/)AndroidManifest\.xml$/i);
  if (hasGradle && hasAndroidManifest) return "android";

  return null;
}

/** True for the shapes whose toolchain is genuinely not web/JS. */
export function isNativeMobile(platform: NativePlatform | null): boolean {
  return platform === "ios" || platform === "android";
}

/**
 * Tech-stack labels for a mobile repo, from paths alone.
 *
 * Pulse's stack detection reads package.json dependencies, so a native repo
 * reported `techStack: []` — the report couldn't even say the project was Swift.
 */
export function nativeTechStack(platform: NativePlatform | null, paths: string[]): string[] {
  if (!platform) return [];
  const stack: string[] = [];

  if (platform === "ios") {
    stack.push("iOS", "Swift");
    if (anyPath(paths, /\.m$|\.mm$/)) stack.push("Objective-C");
  } else if (platform === "android") {
    stack.push("Android");
    if (anyPath(paths, /\.kt$/)) stack.push("Kotlin");
    if (anyPath(paths, /\.java$/)) stack.push("Java");
    if (anyPath(paths, /\.gradle\.kts$/)) stack.push("Gradle (Kotlin DSL)");
  } else if (platform === "react-native") {
    stack.push("React Native");
  } else if (platform === "flutter") {
    stack.push("Flutter", "Dart");
  }

  // Dependency managers — meaningful for the native shapes only.
  if (platform === "ios" || platform === "android") {
    if (anyPath(paths, /(^|\/)Podfile$/i)) stack.push("CocoaPods");
    if (anyPath(paths, /Package\.resolved$|(^|\/)Package\.swift$/i)) stack.push("Swift Package Manager");
    if (anyPath(paths, /(^|\/)build\.gradle(\.kts)?$/i)) stack.push("Gradle");
  }

  return [...new Set(stack)];
}

/**
 * Generic repo checks that cannot apply to a NATIVE mobile repo, each with the
 * reason shown in the report. Two kinds appear here and nothing else does:
 *
 *   1. Toolchain mismatch — the check looks for a JS/web artefact that a Swift or
 *      Kotlin project has no equivalent of at that path.
 *   2. Superseded — the iOS/Android family checks the same *concern* properly
 *      (e.g. a test TARGET rather than a top-level `test/` folder), so leaving the
 *      generic one to fail would double-count one problem.
 *
 * Deliberately NOT here, because they remain true and useful for a native repo:
 * has_readme, has_gitignore, ci_cd_present, has_license, has_security_md,
 * has_changelog_file, has_editorconfig, has_git_hooks, has_contributing,
 * has_code_of_conduct, has_dependabot / has_renovate (both support SPM and
 * CocoaPods), is_monorepo, has_makefile, aeo_agent_instructions,
 * branch_protection, commit_velocity, pr_review_culture,
 * dependency_vulnerabilities, repo_not_archived.
 */
export const NATIVE_INAPPLICABLE_CHECKS: ReadonlyMap<string, string> = new Map([
  // ── Toolchain mismatch ──────────────────────────────────────────────────────
  ["has_typescript", "No tsconfig.json in a native mobile app — the language is Swift/Kotlin."],
  ["has_env_example", "Native apps configure builds with .xcconfig / Gradle properties, not .env files."],
  ["dockerfile_present", "A native mobile app ships as a signed store binary, not a container image."],
  ["has_orm_config", "No server-side ORM in a native mobile client."],
  ["has_migrations", "Database migrations belong to the backend, not the mobile app repo."],
  ["has_infra_code", "Infrastructure-as-code belongs to the backend, not the mobile app repo."],
  ["has_openapi_spec", "An API spec belongs to the backend this app consumes, not the app repo."],
  ["has_devcontainer", "An iOS build needs Xcode on macOS, which a devcontainer cannot provide."],
  ["aeo_repo_llms_txt", "llms.txt is a web-discoverability artefact — not applicable to a native app repo."],
  // ── Superseded by the native family ─────────────────────────────────────────
  ["has_tests", "Superseded: native tests live in an Xcode/Gradle test target, not a top-level test/ folder."],
  ["has_e2e_tests", "Superseded: native UI tests use XCUITest / Espresso, not Playwright or Cypress."],
  ["has_unit_test_config", "Superseded: the test runner is XCTest / JUnit, configured in the project file."],
  ["has_coverage_config", "Superseded: coverage is an Xcode scheme / Gradle setting, not a JS config file."],
  ["has_linter", "Superseded by the SwiftLint / ktlint check — ESLint has no meaning here."],
  ["has_manifest", "Superseded by the dependency-pinning check — the manifest is Podfile / Package.swift."],
]);

/**
 * Generic repo checks that cannot apply to a FLUTTER repo. Mostly the same story as
 * native, but the differences matter and are the whole reason this is a second list:
 *
 *   • `has_tests` is NOT skipped — a Flutter project really does keep a top-level
 *     `test/` directory, so the generic check is correct here.
 *   • `has_linter` IS skipped — Dart lints live in analysis_options.yaml, which the
 *     ESLint/Biome/Prettier probe cannot see.
 */
export const FLUTTER_INAPPLICABLE_CHECKS: ReadonlyMap<string, string> = new Map([
  ["has_typescript", "No tsconfig.json in a Flutter app — the language is Dart."],
  ["has_linter", "Superseded by the Dart analyzer check — Dart lints live in analysis_options.yaml, not an ESLint config."],
  ["has_env_example", "Flutter configures builds with --dart-define and flavors, not .env files."],
  ["dockerfile_present", "A Flutter app ships as a signed store binary, not a container image."],
  ["has_orm_config", "No server-side ORM in a mobile client — Flutter persistence is floor/drift/sqflite."],
  ["has_migrations", "Database migrations belong to the backend, not the mobile app repo."],
  ["has_infra_code", "Infrastructure-as-code belongs to the backend, not the mobile app repo."],
  ["has_openapi_spec", "An API spec belongs to the backend this app consumes, not the app repo."],
  ["aeo_repo_llms_txt", "llms.txt is a web-discoverability artefact — not applicable to a mobile app repo."],
  ["has_e2e_tests", "Superseded: Flutter end-to-end tests use integration_test, not Playwright or Cypress."],
  ["has_unit_test_config", "Superseded: the test runner is flutter_test, configured in pubspec.yaml."],
  ["has_coverage_config", "Superseded: coverage comes from `flutter test --coverage`, not a JS config file."],
  ["has_manifest", "Superseded by the dependency-pinning check — the manifest is pubspec.yaml."],
]);

/** The applicability map for a platform, or null when every generic check still applies. */
function inapplicableFor(platform: NativePlatform | null): ReadonlyMap<string, string> | null {
  if (isNativeMobile(platform)) return NATIVE_INAPPLICABLE_CHECKS;
  if (platform === "flutter") return FLUTTER_INAPPLICABLE_CHECKS;
  // React Native genuinely IS a JS project — package.json, ESLint and tsconfig all
  // apply to it, so nothing is skipped.
  return null;
}

/** The reason string for a skipped generic check, or undefined if it still applies. */
export function nativeSkipReason(
  checkKey: string,
  platform: NativePlatform | null,
): string | undefined {
  return inapplicableFor(platform)?.get(checkKey);
}

/**
 * Rewrite generic checks that cannot apply to a native mobile repo as SKIPPED.
 * SKIPPED is excluded from both sides of the score ratio in score-breakdown.ts, so
 * this stops a Swift project being marked down for having no tsconfig — without
 * hiding anything, since the skip reason is shown in the report.
 *
 * Pure, and a no-op for every non-native platform.
 */
export function applyNativeApplicability<T extends { checkKey: string; status: string; detail?: string }>(
  checks: T[],
  platform: NativePlatform | null,
): T[] {
  if (inapplicableFor(platform) === null) return checks;
  return checks.map((check) => {
    const reason = nativeSkipReason(check.checkKey, platform);
    return reason ? { ...check, status: "SKIPPED", detail: reason } : check;
  });
}

/**
 * Strip C-style comments so code patterns can't match commented-out code.
 *
 * This is not a nicety. Validating against a real app, the low-data check passed
 * because the only occurrences of `allowsConstrainedNetworkAccess` in the codebase
 * were two commented-out lines — the app had no adaptation at all and the scan said
 * it did. Commented-out blocks are common, so every code pattern needs this.
 *
 * String literals MUST survive: a URL contains `//`, so naive stripping would cut
 * `"https://cdn.example.com/x.m3u8"` down to `"https:` and break media detection.
 * Handles line comments, nested block comments (legal in Swift), plain and multiline
 * string literals, and escapes. Dart, Kotlin and Java share this comment syntax, so
 * every platform family uses this one implementation.
 */
export function stripCStyleComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;

  while (i < n) {
    const two = source.slice(i, i + 2);

    // Multiline string literal — copy verbatim to its closing delimiter. BOTH
    // delimiters matter: Dart uses ''' as readily as """.
    const triple = source.startsWith('"""', i) ? '"""' : source.startsWith("'''", i) ? "'''" : null;
    if (triple) {
      const end = source.indexOf(triple, i + 3);
      const stop = end === -1 ? n : end + 3;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }

    // Single-line string literal — copy verbatim, honouring escapes.
    //
    // Single quotes are handled as well as double, because Dart's idiomatic string
    // delimiter is ' — and a URL contains //. Without this, `'https://x/y.m3u8'`
    // was truncated to `'https:` and the constant it belonged to disappeared
    // entirely. Swift has no single-quoted literals, and in Kotlin/Java a '…' char
    // literal strips identically, so this is safe for every family.
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      out += source[i++];
      while (i < n) {
        if (source[i] === "\\") {
          out += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += source[i];
        // An unterminated literal must not swallow the rest of the file, so a bare
        // newline closes it — matching how these languages actually parse.
        if (source[i] === quote || source[i] === "\n") { i++; break; }
        i++;
      }
      continue;
    }

    // Line comment — drop to end of line, keeping the newline for line counts.
    if (two === "//") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      continue;
    }

    // Block comment — Swift allows nesting, so track depth.
    if (two === "/*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (source.startsWith("/*", i)) { depth++; i += 2; }
        else if (source.startsWith("*/", i)) { depth--; i += 2; }
        else { if (source[i] === "\n") out += "\n"; i++; }
      }
      continue;
    }

    out += source[i++];
  }

  return out;
}
