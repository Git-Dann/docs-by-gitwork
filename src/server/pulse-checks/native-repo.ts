// ─────────────────────────────────────────────────────────────────────────────
// NATIVE MOBILE REPO READER — the only I/O in the native-mobile family.
//
// One recursive tree call, then a bounded set of content fetches:
//   • CONFIG files are always read (few, small, high signal): Info.plist,
//     entitlements, project.pbxproj, lockfiles.
//   • SWIFT sources are SAMPLED, relevance-ranked and capped. Sampling is why
//     ios-app.ts separates "presence" findings (sound on a sample) from "absence"
//     findings (marked LOW confidence, and so unscored, when coverage is thin).
//
// The snapshot is MEMOIZED per owner/repo for a short window, with in-flight
// promise dedup. That matters: runGithubChecks needs the detected platform to know
// which of its own generic checks to skip, and runCodeAgent needs the full
// snapshot for the iOS family — and the two run in PARALLEL. Without the memo they
// would each fetch the tree; with it there is exactly one fetch per scan.
// ─────────────────────────────────────────────────────────────────────────────

import { parseGithubRepo, safeGithubRequest } from "@/lib/github";
import type { PulseScanCheckInput } from "@/types/pulse";
import { detectNativePlatform, isExampleOrFixturePath, isVendoredPath, type NativePlatform, type RepoSnapshot } from "./native-mobile";
import { evaluateIosChecks } from "./ios-app";
import { evaluateIosExtendedChecks } from "./ios-app-extended";
import { evaluateFlutterChecks } from "./flutter-app";
import { evaluateCrossPlatformExtendedChecks } from "./cross-platform-extended";
import { evaluateAndroidChecks } from "./android-app";
import { evaluateAndroidExtendedChecks } from "./android-app-extended";
import { evaluateChromeExtensionChecks, isChromeExtension } from "./chrome-extension";
import { evaluateExtensionExtendedChecks } from "./chrome-extension-extended";
import { evaluateReactNativeChecks, RN_NON_APP_SOURCE } from "./react-native-app";
import { evaluateDesktopChecks } from "./desktop-app";
import { evaluateDesktopExtendedChecks } from "./desktop-app-extended";
import { evaluateCliChecks, binEntries } from "./cli-tool";
import { detectProjectShape, parsePackageManifest, type ProjectShape } from "./project-shape";
import { evaluateWebSourceChecks } from "./web-repo-source";
import { evaluateBackendServiceChecks } from "./backend-service";
import { evaluateCleanlinessChecks } from "./code-cleanliness";
import { evaluateCiWorkflowChecks } from "./ci-workflows";
import { evaluateRepoCollaborationChecks } from "./repo-collaboration";
import { evaluateContainerChecks } from "./containers";
import { evaluateServiceDepthChecks } from "./service-depth";
import { evaluateOperationalDepthChecks } from "./operational-depth";

/**
 * Every repo shape the snapshot builder knows how to feed. This is deliberately a
 * SEPARATE union from NativePlatform (mobile) and ProjectShape (desktop/CLI): it
 * exists only to decide which files to fetch, and merging it into either of the
 * other two would let a desktop repo pick up mobile applicability semantics.
 */
export type SnapshotShape = NativePlatform | Exclude<ProjectShape, null> | "chrome-extension" | "none";

/** Max Swift files whose contents we read. See ios-app.ts for how coverage is used. */
const SWIFT_SAMPLE_CAP = 150;

/**
 * Sample cap for a plain web/service repo.
 *
 * Lower than the mobile cap on purpose. Every repo scan now pays this, where
 * previously a web repo read no source at all, so the cost applies to the whole
 * population rather than the mobile minority. 80 relevance-ranked files is enough
 * for the presence findings in web-repo-source.ts to be sound; the absence ones
 * self-downgrade when coverage is thin, which is the honest outcome on a large
 * monorepo rather than a fabricated pass.
 */
const WEB_SAMPLE_CAP = 80;

/**
 * Round-0 budget: the tiny files that decide the shape, before we know it.
 *
 * package.json distinguishes Electron from React Native from a CLI, and
 * manifest.json (with a manifest_version key) is the only thing that identifies a
 * browser extension. Both are cheap; the cap stops a monorepo with 200 workspaces
 * turning shape detection into 200 requests.
 */
const SHAPE_PROBE_CAP = 8;

/** Max config files read in round 1. Bounds the cost on a large monorepo. */
const CONFIG_CAP = 60;
/** Concurrency for content fetches — bounded so a big repo can't stampede the API. */
const FETCH_CONCURRENCY = 15;
/** Skip blobs above this size (minified bundles, generated Lottie JSON, binaries). */
const MAX_BLOB_BYTES = 400_000;
/** Memo lifetime — long enough to span one scan's parallel waves, short enough to stay fresh. */
const MEMO_TTL_MS = 120_000;

interface GitTreeResponse {
  tree?: { path: string; type: string; size?: number }[];
  truncated?: boolean;
}

interface ContentsResponse {
  content?: string;
  encoding?: string;
}

/** Config files that are always worth reading in full. */
const CONFIG_PATTERNS: RegExp[] = [
  /(^|\/)Info\.plist$/i,
  // Read separately from Info.plist — it carries the Firebase API key + project id.
  /(^|\/)GoogleService-Info\.plist$/i,
  /\.entitlements$/i,
  /project\.pbxproj$/i,
  /(^|\/)Podfile$/i,
  /(^|\/)Podfile\.lock$/i,
  /(^|\/)Package\.swift$/i,
  /Package\.resolved$/i,
  /(^|\/)\.swiftlint\.ya?ml$/i,
  // Flutter / Android
  /(^|\/)pubspec\.ya?ml$/i,
  /(^|\/)pubspec\.lock$/i,
  /(^|\/)analysis_options\.ya?ml$/i,
  /(^|\/)AndroidManifest\.xml$/i,
  /(^|\/)build\.gradle(\.kts)?$/i,
  /(^|\/)gradle\.properties$/i,
  /(^|\/)fvm_config\.json$/i,
  /(^|\/)\.fvmrc$/i,
  /(^|\/)google-services\.json$/i,
  // Browser-extension manifest. Deliberately broad here and narrowed at match time
  // by findExtensionManifest, which requires a "manifest_version" key — a PWA web
  // app manifest shares this filename and must not be scanned as an extension.
  /(^|\/)manifest\.json$/i,
  // Per-browser manifest variants a build merges over the base (darkreader:
  // src/manifest-chrome-mv3.json carries manifest_version 3 and minimum_chrome_version).
  // Known by name only, they could not establish either; read, they can.
  /(^|\/)manifest[-_.][^/]*\.json$/i,
  // Desktop — Tauri config + capabilities, and both Electron packagers.
  /(^|\/)src-tauri\/tauri\.conf\.json$/i,
  /(^|\/)src-tauri\/capabilities\/[^/]+\.(json|toml)$/i,
  /(^|\/)src-tauri\/Cargo\.toml$/i,
  /(^|\/)electron-builder\.(ya?ml|json|js|ts|cjs)$/i,
  /(^|\/)forge\.config\.(js|ts|cjs|mjs)$/i,
  /(^|\/)electron\.vite\.config\.(js|ts|cjs|mjs)$/i,
  // JS manifest — the discriminator for Electron vs React Native vs CLI, and the
  // source of every field the CLI family grades.
  /(^|\/)package\.json$/i,
  // React Native build configuration.
  /(^|\/)(babel\.config\.(js|cjs|ts)|\.babelrc(\.js|\.json)?)$/i,
  /(^|\/)(app\.json|app\.config\.(js|ts)|eas\.json|metro\.config\.(js|cjs|ts))$/i,
  // CodePush keeps its signing public key (CodePushPublicKey) in the app's strings.
  /(^|\/)android\/app\/src\/main\/res\/values\/strings\.xml$/i,
  // Read for the CLI family (usage docs) and the desktop signing check.
  /^README(\.md|\.markdown|\.rst|\.txt)?$/i,
  /^\.github\/workflows\/[^/]+\.ya?ml$/i,
  /(^|\/)(Dockerfile|docker-compose[^/]*\.ya?ml)$/i,
  // Read Pulse audit policy/configuration alongside workflows. The recognisers
  // deliberately describe outcomes rather than coupling Pulse to any vendor.
  /(^|\/)(?:\.?security|\.?quality|\.?audit|\.?static[-_ ]analysis|\.?secret[-_ ]scan|\.?supply[-_ ]chain|\.?accessibility|\.?browser[-_ ]tests?|\.?dynamic[-_ ]security)\.(ya?ml|json|toml)$/i,
  // Web-source family: .gitignore CONTENTS (not just its existence — a .gitignore
  // that misses .env is the second most common finding in AI-built repos and
  // passes any presence test), setup scripts, and SQL migrations for the
  // repo-side Supabase RLS check.
  /(^|\/)\.gitignore$/i,
  /^(scripts\/)?[^/]*\.(sh|bash)$/i,
  /(^|\/)(migrations|supabase|db|sql)\/[^/]*\.sql$/i,
  // Containers + infrastructure-as-code. A Dockerfile is the most security-dense
  // config file most projects own — it decides what user the process runs as, what
  // ends up in the image layers, and where the base image comes from.
  /(^|\/)Dockerfile(\.[\w.-]+)?$/i,
  /(^|\/)[\w.-]*\.dockerfile$/i,
  /(^|\/)docker-compose(\.[\w.-]+)?\.ya?ml$/i,
  /(^|\/)compose(\.[\w.-]+)?\.ya?ml$/i,
  /(^|\/)\.dockerignore$/i,
  // Dependency manifests across ecosystems, for the supply-chain family.
  /(^|\/)(requirements[\w.-]*\.txt|Pipfile|pyproject\.toml|poetry\.lock)$/i,
  /(^|\/)(Gemfile|Gemfile\.lock)$/i,
  /(^|\/)(go\.mod|go\.sum)$/i,
  /(^|\/)(composer\.json|composer\.lock)$/i,
  /(^|\/)(pom\.xml|Cargo\.lock)$/i,
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.ya?ml|bun\.lockb?)$/i,
  // Backend framework configuration — the files whose VALUES decide whether a
  // service is safe to expose, rather than whether a framework is present.
  /(^|\/)settings(_?\w*)?\.py$/i,
  /(^|\/)(manage\.py|wsgi\.py|asgi\.py)$/i,
  /(^|\/)config\/environments\/production\.rb$/i,
  /(^|\/)config\/(application|storage|database)\.rb$/i,
  /(^|\/)\.env\.example$/i,
  // Root .env files a repo commits, read so vibe_env_not_committed judges their CONTENTS
  // (Next.js commits .env / .env.production as non-secret defaults by design).
  /^\.env(?:\.[\w-]+)*$/i,
  /(^|\/)(next|nuxt|vite|svelte|astro|remix)\.config\.(js|ts|mjs|cjs)$/i,
  /(^|\/)application(-\w+)?\.(properties|ya?ml)$/i,
  /(^|\/)(nginx|default)\.conf$/i,
  /(^|\/)(vercel|netlify|fly|railway|render)\.(json|toml|ya?ml)$/i,
  /(^|\/)wrangler\.(toml|jsonc?)$/i,
  // Operational-depth evidence: API contracts, IaC, orchestration, service
  // objectives and performance budgets. These files carry executable settings,
  // not prose guesses, and are read for every repository shape.
  /(^|\/)(openapi|swagger|asyncapi)\.(json|ya?ml)$/i,
  /(^|\/)(?:terraform|tofu)\/.*\.tf$/i,
  /(^|\/)[^/]+\.tf$/i,
  /(^|\/)(?:k8s|kubernetes|deploy|infra)\/.*\.ya?ml$/i,
  /(^|\/)(?:slo|slos|service-level-objectives|error-budget)\.(json|ya?ml|md)$/i,
  /(^|\/)(?:size-limit|bundlewatch|performance-budget)\.(json|js|cjs|mjs|ts|ya?ml)$/i,
  /(^|\/)(?:tsconfig(?:\.[^/]+)?\.json|eslint\.config\.(?:js|mjs|cjs|ts)|biome\.json|ruff\.toml)$/i,
  /(^|\/)(?:CODEOWNERS|SECURITY\.md|INCIDENT[^/]*\.md|RUNBOOK[^/]*\.md|SUPPORT[^/]*\.md|ARCHITECTURE[^/]*\.md|ADR-[^/]*\.md|BUSINESS-CONTINUITY[^/]*\.md|DISASTER-RECOVERY[^/]*\.md|DATA-CLASSIFICATION[^/]*\.md|VENDOR[^/]*\.(?:md|csv|json|ya?ml))$/i,
  /(^|\/)(?:locales?|translations?|i18n)\/[^/]+\.(?:json|ya?ml)$/i,
];

/**
 * Which source extension carries the app's own logic, per shape.
 *
 * `null` means "no family reads source for this shape", which is how a plain web
 * repo still costs exactly one tree call and nothing else.
 */
const SOURCE_EXTENSION: Record<SnapshotShape, RegExp | null> = {
  ios: /\.swift$/i,
  android: /\.(kt|java)$/i,
  flutter: /\.dart$/i,
  "react-native": /\.(ts|tsx|js|jsx)$/i,
  electron: /\.(ts|tsx|js|jsx|mjs|cjs)$/i,
  // Tauri's security surface is split across the Rust commands and the JS frontend.
  tauri: /\.(rs|ts|tsx|js|jsx|mjs|cjs)$/i,
  cli: /\.(ts|js|mjs|cjs)$/i,
  // tsx/jsx too: popup and options UIs are routinely React, and an extension's .tsx was
  // neither sampled nor counted toward coverage.
  "chrome-extension": /\.(ts|tsx|js|jsx|mjs|cjs)$/i,
  // A plain web/service repo. This used to be null — the snapshot returned after
  // the round-0 probes and NO source was read, so the most common repo shape of
  // all was graded on filenames and HTTP responses alone. See web-repo-source.ts.
  none: /\.(js|jsx|ts|tsx|mjs|cjs|py|rb|php|go|java|cs)$/i,
};

/** Generated Dart (freezed/json_serializable/retrofit) — read a few, not hundreds. */
const GENERATED_DART = /\.(g|freezed|config)\.dart$/i;

/**
 * Files that MUST be read whatever else is in the repo, matched on the BASENAME.
 *
 * Learned by validating against a real app: the critical credential-logging finding
 * lives in `Logger.swift`, which scored 900 below a hundred-odd `*Service.swift`
 * files at 1000 and was cut by the cap — so the scan reported the app as clean. And
 * `UserJourneyKeys.swift`, which holds the token keys, matched no pattern at all
 * because the token names are in its CONTENTS, not its path.
 *
 * A concern-based ranking cannot fix that on its own: these files are small, so size
 * never rescues them either. They get an unbeatable score instead.
 */
const MUST_READ_STEMS =
  /^(logger|logging|log|keychain\w*|\w*keychain|userdefaults|\w*storage\w*|\w*store|\w*persist\w*|\w*pref\w*|environment\w*|\w*environment|env|config\w*|\w*config|constants|\w*constants|strings|settings|apiclient|api_?client|dio_?client|\w*_client|networkmanager|reachability|\w*connectivity\w*|\w*interceptor\w*|appdelegate\w*|scenedelegate|app|main|session\w*|\w*session|auth\w*|\w*auth|token\w*|\w*token|\w*journey\w*|cache\w*|\w*cache\w*|\w*keys|\w*download\w*|\w*player|\w*secure\w*)$/i;

/**
 * The must-read tier for JS/TS. Deliberately narrower than MUST_READ_STEMS: in a JS
 * app `\w*token` is a crypto-token list component and `\w*store` is every Zustand
 * slice — rainbow had 223 files matching the native list, more than the whole cap,
 * which pushed its real sentry.ts out of the sample. These are the files the RN
 * checks actually turn on: logging/crash reporting, storage and persistence,
 * keychain, env/config, the network client, session/auth, deep-link handlers, and
 * a store's `schema` (Bluesky declares its persisted session — accessJwt included — there).
 */
const MUST_READ_STEMS_JS =
  /^(logger|logging|log|sentry|bugsnag|crashlytics|crash_?report\w*|error_?report\w*|\w*storage|storage\w*|\w*persist\w*|keychain\w*|\w*keychain|secure_?store|\w*secure_?storage|env|environment|config|app_?config|constants|api_?client|http_?client|network_?client|network_?manager|\w*interceptors?|session_?manager|session|auth|auth_?manager|authentication|tokens?_?(?:storage|store|manager)|app|main|linking|deep_?links?\w*|schema)$/i;

/** JS/TS source — the files the narrower must-read list applies to. */
const JS_SOURCE = /\.(tsx?|jsx?)$/i;

/**
 * Extensions the must-read tier applies to — every language family we sample.
 * JS/TS was missing, so stemOf never stripped `.ts` and no React Native (or web)
 * file could ever be must-read: social-app's logger and Sentry transport, and its
 * persisted store, were never sampled while hundreds of view files were.
 */
const SOURCE_EXT = /\.(swift|dart|kt|java|tsx?|jsx?)$/i;

/** The filename stem (no directory, no extension), for must-read matching. */
function stemOf(path: string): string {
  const parts = path.toLowerCase().split("/");
  let base = (parts.pop() ?? "").replace(SOURCE_EXT, "");
  if (JS_SOURCE.test(path)) {
    // `storage.native.ts` is the storage module; `persisted/index.ts` is the
    // persisted module — in JS the directory names an index file.
    base = base.replace(/\.(native|ios|android|web)$/, "");
    if (base === "index" && parts.length > 0) base = parts[parts.length - 1];
  }
  return base;
}

/**
 * Relevance for Swift sampling, in three tiers:
 *   1. MUST_READ basenames — the files that carry the FAIL-severity findings.
 *   2. Concern keywords in the path — networking, auth, logging, caching, media.
 *   3. Size, as the tiebreaker: a codebase-wide idiom (Dynamic Type, accessibility
 *      labels) shows up in the big view files if it is used at all, which is what
 *      makes a partial sample adequate evidence of an absence.
 */
export function swiftRelevance(path: string, size: number): number {
  const p = path.toLowerCase();
  let score = 0;
  // Matched on the STEM, not the full basename, so the tier works for Swift, Dart,
  // Kotlin and Java alike. It was `\.swift$`-anchored at first, which meant no Dart
  // file could ever be must-read — and the Flutter env-baseurl check, the whole
  // reason that family exists, silently SKIPPED because constants.dart fell outside
  // the cap on a 1,114-file app.
  if ((JS_SOURCE.test(p) ? MUST_READ_STEMS_JS : MUST_READ_STEMS).test(stemOf(p))) score += 100_000;
  if (/(network|apiclient|api-client|service|request|session|http)/.test(p)) score += 1000;
  if (/(auth|login|signin|register|token|keychain|credential|secret)/.test(p)) score += 1000;
  if (/(logger|logging|analytics|telemetry)/.test(p)) score += 900;
  if (/(cache|caching|prefetch|download|offline)/.test(p)) score += 800;
  if (/(environment|config|constants|strings|settings|defaults|journey|state)/.test(p)) score += 700;
  if (/(player|video|stream|media)/.test(p)) score += 600;
  if (/(appdelegate|scenedelegate|\bapp\.swift)/.test(p)) score += 500;
  // Size as the tiebreaker — capped so one enormous file can't crowd out the rest.
  return score + Math.min(size, 60_000) / 1000;
}

/**
 * Which families read a repo's CONTENTS (as opposed to just its file listing).
 *
 * ⚠️ This exists because `buildSnapshot` used to return early for `shape === "none"`
 * — before Round 1 — on the reasoning that a plain web repo had no family reading
 * source. That stopped being true and the early return stayed, so for the COMMONEST
 * repo shape of all:
 *
 *   • `SOURCE_EXTENSION.none` and `WEB_SAMPLE_CAP` were unreachable code;
 *   • all 17 web-repo-source checks and all 9 code-cleanliness checks received an
 *     almost-empty files map — including the `.gitignore`-contents check, the
 *     finding that family was built for;
 *   • and the CI/CD family would have been dead on arrival for the same reason.
 *
 * It is the same defect as the browser-extension family being unreachable (§37.1),
 * reintroduced one shape over, and it survived because every family is unit-tested
 * against a HAND-BUILT snapshot — so the tests exercise the checks and never the
 * thing that decides whether the checks get anything to look at.
 *
 * Exported so a test can assert it, rather than leaving the decision buried in an
 * `if` inside a function that does network I/O and therefore never runs under test.
 */
export function readsRepoContents(shape: SnapshotShape): boolean {
  // Every shape now has at least one family reading contents: the shape-specific
  // families for the named shapes, and web-repo-source + code-cleanliness +
  // ci-workflows for "none". Written as an exhaustive statement rather than
  // `return true` so that adding a shape is a decision someone has to make.
  const shapes: Record<SnapshotShape, boolean> = {
    ios: true,
    android: true,
    flutter: true,
    "react-native": true,
    electron: true,
    tauri: true,
    cli: true,
    "chrome-extension": true,
    none: true,
  };
  return shapes[shape];
}

const PLATFORM_CONFIG =
  /(^|\/)(Info\.plist|GoogleService-Info\.plist|Podfile|Podfile\.lock|Package\.swift|Package\.resolved|\.swiftlint\.ya?ml|pubspec\.ya?ml|pubspec\.lock|analysis_options\.ya?ml|AndroidManifest\.xml|build\.gradle(\.kts)?|gradle\.properties|fvm_config\.json|\.fvmrc|google-services\.json)$|\.entitlements$|project\.pbxproj$/i;
const CI_WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/i;

/** Read priority for a config path under the cap: CI workflows, then platform build config, then the rest. */
function configRank(path: string): number {
  if (CI_WORKFLOW.test(path)) return 2;
  return PLATFORM_CONFIG.test(path) ? 1 : 0;
}

// ── Android build inputs: their own budget ────────────────────────────────────
//
// Manifests and Gradle build files used to compete with every other config file for
// CONFIG_CAP (60), after CI workflows. thunderbird-android declares 27 manifests and
// 161 Gradle files, so 8 manifests and 23 build files were read — and verdicts like
// "POST_NOTIFICATIONS is never declared" were reported HIGH while it sat in three of
// the unread manifests. These inputs now get a separate, still-bounded budget, so the
// general cap (and CI workflows, which ci-workflows reads only from it) is untouched.
// The family measures what fraction it read (manifestCoverage / gradleCoverage) and
// downgrades "not declared" verdicts when that is below 1.
const ANDROID_MANIFEST_CAP = 40;
const ANDROID_GRADLE_CAP = 40;
const ANDROID_BUILD_LOGIC_CAP = 25;
const ANDROID_MANIFEST = /(^|\/)AndroidManifest\.xml$/i;
const ANDROID_GRADLE = /(^|\/)(build|settings)\.gradle(\.kts)?$/i;
/** Convention plugins: where minSdk/targetSdk/minify are set in multi-module builds (nowinandroid, thunderbird). */
const ANDROID_BUILD_LOGIC = /(^|\/)(build-logic|buildSrc|build-plugin)\/.*\.(kt|kts|gradle)$/i;
/** The version catalog (pinning) and the network security config the manifest references (cleartext). */
const ANDROID_BUILD_EXTRAS = /(^|\/)gradle\/[^/]+\.versions\.toml$|(^|\/)res\/xml\/[^/]*(network|security)[^/]*\.xml$/i;

function selectAndroidBuildInputs(usable: { path: string }[]): string[] {
  const paths = usable.map((e) => e.path).filter((p) => !isVendoredPath(p));
  const depthOf = (p: string) => p.split("/").length;
  // Module dirs that ship a main manifest — their build files configure an actual app or library.
  const moduleDirs = new Set(
    paths
      .filter((p) => /(^|\/)src\/main\/AndroidManifest\.xml$/i.test(p))
      .map((p) => p.replace(/\/?src\/main\/AndroidManifest\.xml$/i, "")),
  );
  const testish = (p: string) => /(^|\/)(src\/(test|androidTest)|benchmarks?|baselineprofile|testing)(\/|$)/i.test(p);

  const manifests = paths
    .filter((p) => ANDROID_MANIFEST.test(p))
    .sort(
      (a, b) =>
        Number(testish(a)) - Number(testish(b)) ||
        Number(!/src\/main\//.test(a)) - Number(!/src\/main\//.test(b)) ||
        depthOf(a) - depthOf(b),
    )
    .slice(0, ANDROID_MANIFEST_CAP);
  const gradleRank = (p: string) => {
    const dir = p.replace(/\/?[^/]+$/, "");
    if (dir === "") return 0; // root build + settings
    if (moduleDirs.has(dir)) return /(^|\/)app[^/]*$/i.test(dir) ? 1 : 2;
    return 3;
  };
  const gradle = paths
    .filter((p) => ANDROID_GRADLE.test(p) && !ANDROID_BUILD_LOGIC.test(p))
    .sort((a, b) => gradleRank(a) - gradleRank(b) || Number(testish(a)) - Number(testish(b)) || depthOf(a) - depthOf(b))
    .slice(0, ANDROID_GRADLE_CAP);
  // Build scripts first (they count toward build-file coverage), then precompiled convention
  // scripts (`thunderbird.app.android.gradle.kts`), then classes NAMED for the SDK levels and
  // build types (`KotlinAndroid.kt`, `ProjectConfig.kt`). Basename only: every class sits under
  // src/main/kotlin/, so matching the whole path ranked them all equal.
  const logicRank = (p: string) => {
    const base = p.split("/").pop() ?? "";
    if (ANDROID_GRADLE.test(base)) return 0;
    if (/\.gradle(\.kts)?$/i.test(base)) return 1;
    return /(application|android|config|sdk|buildtype)/i.test(base) ? 2 : 3;
  };
  const buildLogic = paths
    .filter((p) => ANDROID_BUILD_LOGIC.test(p))
    .sort((a, b) => logicRank(a) - logicRank(b))
    .slice(0, ANDROID_BUILD_LOGIC_CAP);
  const extras = paths.filter((p) => ANDROID_BUILD_EXTRAS.test(p)).slice(0, 10);
  return [...new Set([...manifests, ...gradle, ...buildLogic, ...extras])];
}

/**
 * The directories that hold the desktop app itself: wherever an Electron packager config
 * sits, or the parent of `src-tauri/`. [""] means the repo root (no narrowing).
 *
 * Derived from paths alone because selection runs before any workspace package.json is
 * read; the packager config sits beside the app's own package.json.
 */
export function desktopAppRoots(paths: string[]): string[] {
  const roots = new Set<string>();
  for (const p of paths) {
    if (isVendoredPath(p) || isExampleOrFixturePath(p)) continue;
    const packager = /^(?:(.*)\/)?(electron-builder\.(ya?ml|json|js|ts|cjs)|forge\.config\.(js|ts|cjs|mjs)|electron\.vite\.config\.(js|ts|cjs|mjs))$/i.exec(p);
    if (packager) roots.add(packager[1] ?? "");
    const tauri = /^(?:(.*)\/)?src-tauri\/tauri\.conf\.json$/i.exec(p);
    if (tauri) roots.add(tauri[1] ?? "");
  }
  return roots.size === 0 || roots.has("") ? [""] : [...roots];
}

/** Test suites, specs and mocks — never part of the shipped app. */
const DESKTOP_NOT_SHIPPED =
  /(^|\/)(specs?|tests?|__tests__|__mocks__|mocks?|e2e|fixtures?|__fixtures__)\/|\.(test|spec|tests)\.[cm]?[jt]sx?$/i;

/**
 * Desktop sampling boost, layered on swiftRelevance (Electron and Tauri only).
 *
 * Learned on marktext: 105 of 200 sampled files were packages/muya (an editor package
 * that does not depend on electron), so packages/desktop/src/main — where crashReporter,
 * keytar, the IPC handlers and shell.openExternal live — was mostly unread and four checks
 * reported those things missing. Main/preload files carry every Electron security
 * setting, so they are must-read; files outside the app's directory, and tests, only fill
 * what is left of the cap.
 */
export function desktopRelevance(path: string, appRoots: string[]): number {
  if (!appRoots.some((r) => r === "" || path.startsWith(r + "/"))) return -400_000;
  if (DESKTOP_NOT_SHIPPED.test(path)) return -300_000;
  if (
    /(^|\/)(main|preload|electron|background)\//i.test(path) ||
    /(^|\/)(main|preload)(\.[\w-]+)?\.(ts|js|mjs|cjs)$/i.test(path) ||
    /(^|\/)src-tauri\/src\/(main|lib)\.rs$/i.test(path)
  ) {
    return 100_000;
  }
  return 0;
}

/**
 * Choose which paths to read: config always, then a relevance-ranked source sample
 * for the detected platform. `source` is named generically because the same ranking
 * serves Swift, Dart and Kotlin — the concern keywords are language-independent.
 */
export function selectFilesToRead(
  entries: { path: string; size: number }[],
  platform: SnapshotShape = "ios",
): { config: string[]; source: string[] } {
  const usable = entries.filter((e) => e.size <= MAX_BLOB_BYTES);
  // Android build inputs are read from their own budget (selectAndroidBuildInputs), outside the shared cap.
  const androidBuild = platform === "android" ? selectAndroidBuildInputs(usable) : [];
  const androidSet = new Set(androidBuild);
  const config = usable
    .filter((e) => CONFIG_PATTERNS.some((re) => re.test(e.path)) && !isVendoredPath(e.path) && !androidSet.has(e.path))
    .map((e) => e.path)
    // Rank before capping. In tree order a monorepo filled the 60-file cap with
    // docker/, ~100 i18n/*.json and similar before mobile/ was reached, so immich's
    // mobile/analysis_options.yaml and pubspec.yaml were never read and the Flutter
    // checks reported them missing. CI workflows rank first (there are only ever a
    // handful, and ci-workflows reads them ONLY from this list — a monorepo with more
    // platform files than the cap must not make it report "no workflows"), then
    // platform build config, then everything else. The sort is stable, so tree order
    // is kept within each rank.
    .sort((a, b) => configRank(b) - configRank(a))
    .slice(0, CONFIG_CAP);
  config.push(...androidBuild);

  // Renderer HTML entry — where Electron/Tauri apps most often declare their CSP <meta>. Desktop shapes
  // only: operational-depth and service-depth consume EVERY snapshot file, so HTML must not leak into
  // other shapes' input. Capped so a monorepo with many src/index.html files cannot crowd the fetch.
  if (platform === "electron" || platform === "tauri") {
    const htmlEntries = usable
      .filter((e) => /^index\.html$|(^|\/)(static|renderer|src)\/index\.html$/i.test(e.path) && !isVendoredPath(e.path))
      .map((e) => e.path)
      .filter((p) => !config.includes(p))
      .slice(0, 5);
    config.push(...htmlEntries);
  }

  const ext = SOURCE_EXTENSION[platform];
  if (!ext) return { config, source: [] };

  // Desktop only: rank the app's own directory, and its main/preload files, ahead of
  // sibling workspace packages and tests (desktopRelevance).
  const desktopRoots = platform === "electron" || platform === "tauri" ? desktopAppRoots(usable.map((e) => e.path)) : null;
  const source = usable
    .filter((e) => ext.test(e.path) && !isVendoredPath(e.path))
    // Generated Dart is repetitive boilerplate; a handful is enough to read the
    // retrofit baseUrl, and reading hundreds would crowd out hand-written code.
    .map((e) => ({
      path: e.path,
      score: swiftRelevance(e.path, e.size) - (GENERATED_DART.test(e.path) ? 500 : 0) -
        // React Native: tests, mocks, Detox/e2e helpers and .d.ts files are not the
        // app (mattermost: 59 of 150 sampled files were detox/). Below even the
        // must-read tier, so a __mocks__/storage.ts can't outrank real app code.
        (platform === "react-native" && RN_NON_APP_SOURCE.test(e.path) ? 200_000 : 0) +
        (desktopRoots ? desktopRelevance(e.path, desktopRoots) : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, platform === "none" ? WEB_SAMPLE_CAP : SWIFT_SAMPLE_CAP)
    .map((e) => e.path);

  return { config, source };
}

async function fetchText(owner: string, repo: string, path: string): Promise<string | null> {
  const res = await safeGithubRequest<ContentsResponse>(
    `/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
    {},
  );
  if (!res.content || res.encoding !== "base64") return null;
  try {
    const text = Buffer.from(res.content.replace(/\n/g, ""), "base64").toString("utf-8");
    // Reject binaries — a NUL byte never appears in source or plist text.
    return text.includes("\u0000") ? null : text;
  } catch {
    return null;
  }
}

/** Run an async mapper over items with bounded concurrency. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}

/**
 * Round-0 probe paths: the few small files whose CONTENTS decide the shape.
 *
 * Ordered so the cap keeps the most decisive files — a root package.json beats a
 * workspace one, and a manifest.json at the root or in the usual extension source
 * directories beats one buried in a fixture.
 */
export function selectShapeProbes(paths: string[]): string[] {
  const rank = (p: string): number => {
    const depth = p.split("/").length;
    if (/^package\.json$/i.test(p)) return 0;
    if (/^src-tauri\/tauri\.conf\.json$/i.test(p)) return 1;
    if (/(^|\/)manifest\.json$/i.test(p)) return 2 + depth;
    if (/^[^/]+\/package\.json$/i.test(p)) return 20 + depth;
    return 100;
  };
  return paths
    .filter(
      (p) =>
        !isVendoredPath(p) &&
        (/(^|\/)package\.json$/i.test(p) ||
          /(^|\/)manifest\.json$/i.test(p) ||
          /(^|\/)src-tauri\/tauri\.conf\.json$/i.test(p)),
    )
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, SHAPE_PROBE_CAP);
}

/**
 * True when the repo's only Xcode content is a Safari Web Extension wrapper around a
 * browser extension: an extension manifest (manifest_version) exists OUTSIDE the wrapper,
 * and every Swift file and Xcode project lives under the wrapper's root — the directory
 * above SafariWebExtensionHandler.swift (or above a read project.pbxproj declaring the
 * com.apple.Safari.web-extension point).
 *
 * Deliberately narrow: a real iOS app that ships a Safari extension as one target keeps
 * its app code outside that root (or has the wrapper at the repo root), and stays iOS.
 */
export function isSafariExtensionWrapper(paths: string[], probeFiles: Map<string, string>): boolean {
  const parentOfDir = (p: string) => p.split("/").slice(0, -2).join("/");
  const roots = new Set<string>();
  for (const p of paths) {
    if (isVendoredPath(p)) continue;
    if (/(^|\/)SafariWebExtensionHandler\.swift$/i.test(p)) roots.add(parentOfDir(p));
  }
  for (const [p, text] of probeFiles) {
    if (/\.xcodeproj\/project\.pbxproj$/i.test(p) && /com\.apple\.Safari\.web-extension/.test(text)) {
      roots.add(p.replace(/(^|\/)[^/]*\.xcodeproj\/project\.pbxproj$/i, ""));
    }
  }
  // A wrapper at the repo root would make every path "inside" it.
  const wrapperRoots = [...roots].filter((r) => r !== "").map((r) => `${r}/`);
  if (wrapperRoots.length === 0) return false;
  const inWrapper = (p: string) => wrapperRoots.some((r) => p.startsWith(r));
  const manifestOutside = [...probeFiles].some(
    ([p, text]) => /(^|\/)manifest\.json$/i.test(p) && /"manifest_version"\s*:/.test(text) && !inWrapper(p),
  );
  if (!manifestOutside) return false;
  return paths
    .filter((p) => !isVendoredPath(p) && !isExampleOrFixturePath(p) && /\.swift$|\.(xcodeproj|xcworkspace)\//i.test(p))
    .every(inWrapper);
}

/**
 * Decide which family (if any) will read this repo's contents.
 *
 * Mobile wins first because detectNativePlatform's ordering already resolves the
 * hard cases (an RN project CONTAINS ios/ and android/). Desktop and CLI come from
 * package.json, and the extension check is last because `manifest.json` only counts
 * when it carries a manifest_version key.
 */
export function resolveSnapshotShape(
  paths: string[],
  probeFiles: Map<string, string>,
): SnapshotShape {
  const platform = detectNativePlatform(paths, probeFiles.get("package.json") ?? null);
  // ⚠️ A browser extension that also ships to Safari carries an Xcode project — the
  // Safari Web Extension wrapper (refined-github: safari/Refined GitHub.xcodeproj;
  // uBOL-home: dist/safari/xcode/…). detectNativePlatform counts any .xcodeproj as iOS,
  // so both were scanned as iOS apps and failed the iOS family ("no test files" on a repo
  // with many). Checked before mobile wins.
  if (platform === "ios" && isSafariExtensionWrapper(paths, probeFiles)) return "chrome-extension";
  if (platform === "ios" || platform === "android" || platform === "flutter") return platform;

  const shape = detectProjectShape(paths.filter((p) => !isExampleOrFixturePath(p)), probeFiles.get("package.json") ?? null);
  if (shape !== null) return shape;

  // React Native after desktop/CLI: an Electron app can carry app.json too, and
  // detectNativePlatform treats that as an RN signal.
  if (platform === "react-native") return "react-native";

  for (const [path, text] of probeFiles) {
    if (/(^|\/)manifest\.json$/i.test(path) && /"manifest_version"\s*:/.test(text)) {
      return "chrome-extension";
    }
  }
  return "none";
}

async function buildSnapshot(owner: string, repo: string): Promise<RepoSnapshot> {
  const tree = await safeGithubRequest<GitTreeResponse>(
    `/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
    {},
  );
  const blobs = (tree.tree ?? []).filter((e) => e.type === "blob");
  const paths = blobs.map((b) => b.path);

  if (paths.length === 0) {
    return { owner, repo, paths: [], files: new Map(), truncated: false, accessible: false };
  }

  const files = new Map<string, string>();

  // ── Round 0 ────────────────────────────────────────────────────────────────
  // At most SHAPE_PROBE_CAP tiny files. Everything downstream needs these to tell
  // an Electron app from a React Native app from a CLI from a browser extension,
  // and none of that is decidable from paths alone.
  //
  // ⚠️ This round is why the Chrome-extension family works at all. Before it, this
  // function returned early for any non-mobile repo with an EMPTY files map — and
  // isChromeExtension reads snapshot.files, so all 12 extension checks were
  // unreachable from the moment they shipped. Same disease as §35: a check that
  // could never look reporting as if it had.
  const probes = selectShapeProbes(paths);
  await mapLimit(probes, FETCH_CONCURRENCY, async (path) => {
    const text = await fetchText(owner, repo, path);
    if (text !== null) files.set(path, text);
  });

  const shape = resolveSnapshotShape(paths, files);

  // ── Round 1 ────────────────────────────────────────────────────────────────
  const { config, source } = selectFilesToRead(
    blobs.map((b) => ({ path: b.path, size: b.size ?? 0 })),
    shape,
  );

  // A CLI's `bin` targets are named in package.json rather than matching any path
  // pattern, and the shebang check is meaningless without them.
  const extra: string[] = [];
  if (shape === "cli") {
    const pkg = parsePackageManifest(files.get("package.json") ?? null);
    if (pkg) {
      const known = new Set(paths.map((p) => p.toLowerCase()));
      for (const { path } of binEntries(pkg)) {
        const clean = path.replace(/^\.\//, "");
        if (known.has(clean.toLowerCase())) extra.push(clean);
      }
    }
    // .npmrc can switch on publish provenance (provenance=true).
    if (paths.includes(".npmrc")) extra.push(".npmrc");
  }

  const wanted = [...new Set([...config, ...source, ...extra])].filter((p) => !files.has(p));
  await mapLimit(wanted, FETCH_CONCURRENCY, async (path) => {
    const text = await fetchText(owner, repo, path);
    if (text !== null) files.set(path, text);
  });

  return { owner, repo, paths, files, truncated: Boolean(tree.truncated), accessible: true };
}

// ── Memo ─────────────────────────────────────────────────────────────────────

const memo = new Map<string, { at: number; promise: Promise<RepoSnapshot | null> }>();

/** Fetch (or reuse) the snapshot for a repo. Returns null when the input can't be parsed. */
export function getRepoSnapshot(repoInput: string): Promise<RepoSnapshot | null> {
  const parsed = parseGithubRepo(repoInput);
  if (!parsed) return Promise.resolve(null);
  const key = `${parsed.owner}/${parsed.repo}`.toLowerCase();

  const cached = memo.get(key);
  if (cached && Date.now() - cached.at < MEMO_TTL_MS) return cached.promise;

  const promise = buildSnapshot(parsed.owner, parsed.repo).catch(() => null);
  memo.set(key, { at: Date.now(), promise });

  // Opportunistic eviction — keeps the map from growing across a long-lived process.
  for (const [k, v] of memo) {
    if (Date.now() - v.at > MEMO_TTL_MS) memo.delete(k);
  }
  return promise;
}

/** Test seam — drops the memo so unit tests never share state. */
export function __clearRepoSnapshotMemo(): void {
  memo.clear();
}

/**
 * The detected platform for a repo, using the shared snapshot. Safe to call from
 * anywhere in the scan; only the first caller pays for the network.
 */
export async function detectRepoPlatform(repoInput: string): Promise<NativePlatform | null> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return null;
  return detectNativePlatform(snapshot.paths, snapshot.files.get("package.json") ?? null);
}

/**
 * Run the native-mobile check family. Returns an empty list for anything that
 * isn't a native app (or that we couldn't read), so callers can always append.
 */
export async function runNativeMobileChecks(
  repoInput: string,
): Promise<{ platform: NativePlatform | null; checks: PulseScanCheckInput[] }> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return { platform: null, checks: [] };

  const platform = detectNativePlatform(snapshot.paths, snapshot.files.get("package.json") ?? null);
  if (platform === "ios") {
    // A Safari Web Extension wrapper is not an iOS app — the extension family owns it.
    if (resolveSnapshotShape(snapshot.paths, snapshot.files) === "chrome-extension") return { platform: null, checks: [] };
    return { platform, checks: [...evaluateIosChecks(snapshot), ...evaluateIosExtendedChecks(snapshot)] };
  }
  if (platform === "flutter") {
    return {
      platform,
      checks: [...evaluateFlutterChecks(snapshot), ...evaluateCrossPlatformExtendedChecks(snapshot, "flutter")],
    };
  }
  if (platform === "android") {
    return { platform, checks: [...evaluateAndroidChecks(snapshot), ...evaluateAndroidExtendedChecks(snapshot)] };
  }
  if (platform === "react-native") {
    // Guarded on the resolved snapshot shape, not on detectNativePlatform alone:
    // an Electron app that also ships an app.json reads as "react-native" to the
    // path-based detector, and running the RN family over it would report a
    // desktop app as a mobile one.
    const shape = resolveSnapshotShape(snapshot.paths, snapshot.files);
    if (shape === "react-native") {
      return {
        platform,
        checks: [
          ...evaluateReactNativeChecks(snapshot),
          ...evaluateCrossPlatformExtendedChecks(snapshot, "react-native"),
        ],
      };
    }
  }
  return { platform, checks: [] };
}

/**
 * Run the desktop family (Electron / Tauri).
 *
 * Independent of every other family, and dispatched alongside them rather than
 * through the mobile path: a desktop app is not a NativePlatform, and neither
 * family should be able to take the other out.
 */
export async function runDesktopChecks(
  repoInput: string,
): Promise<{ shape: "electron" | "tauri" | null; checks: PulseScanCheckInput[] }> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return { shape: null, checks: [] };

  const shape = resolveSnapshotShape(snapshot.paths, snapshot.files);
  if (shape !== "electron" && shape !== "tauri") return { shape: null, checks: [] };
  return {
    shape,
    checks: [...evaluateDesktopChecks(snapshot, shape), ...evaluateDesktopExtendedChecks(snapshot, shape)],
  };
}

/** Run the CLI / published-package family. */
export async function runCliChecks(
  repoInput: string,
): Promise<{ isCli: boolean; checks: PulseScanCheckInput[] }> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return { isCli: false, checks: [] };

  if (resolveSnapshotShape(snapshot.paths, snapshot.files) !== "cli") return { isCli: false, checks: [] };
  return { isCli: true, checks: evaluateCliChecks(snapshot) };
}

/**
 * Run the web/service source family.
 *
 * Independent of every other family, like the rest. Returns [] for any repo that
 * resolved to a more specific shape — those have their own family, and running
 * generic web patterns over a Swift project would produce noise, not findings.
 */
export async function runWebSourceChecks(
  repoInput: string,
): Promise<{ isWebRepo: boolean; checks: PulseScanCheckInput[] }> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return { isWebRepo: false, checks: [] };

  if (resolveSnapshotShape(snapshot.paths, snapshot.files) !== "none") return { isWebRepo: false, checks: [] };
  return {
    isWebRepo: true,
    checks: [...evaluateWebSourceChecks(snapshot), ...evaluateBackendServiceChecks(snapshot)],
  };
}

/**
 * Run the code-cleanliness family.
 *
 * Unlike every other family here this is SHAPE-AGNOSTIC — file size, nesting,
 * duplication and leftovers mean the same thing in Swift, Dart, Kotlin and
 * TypeScript, and the analysers handle brace- and indent-based languages alike.
 * So it runs over whatever source the snapshot happened to sample, for any shape.
 */
export async function runCleanlinessChecks(
  repoInput: string,
): Promise<{ checks: PulseScanCheckInput[] }> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return { checks: [] };
  return { checks: evaluateCleanlinessChecks(snapshot) };
}

/**
 * Run the CI/CD workflow family.
 *
 * SHAPE-AGNOSTIC, like cleanliness: a poisoned build pipeline means the same thing
 * whether it is building a Swift app or a Django service, and `.github/workflows`
 * was already in the snapshot's config set for every shape — so this family adds
 * checks to every repo scan and costs no extra network call.
 */
export async function runCiWorkflowChecks(
  repoInput: string,
): Promise<{ checks: PulseScanCheckInput[] }> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return { checks: [] };
  // The collaboration files (CODEOWNERS, templates, release and scanning tools) read the
  // same snapshot and the same workflow files, so they ride on this collector.
  return { checks: [...evaluateCiWorkflowChecks(snapshot), ...evaluateRepoCollaborationChecks(snapshot)] };
}

/**
 * Run the container family (Dockerfile + Compose).
 *
 * Shape-agnostic for the same reason as the CI family: a containerised Django
 * service and a containerised Go binary fail in identical ways, and the config is
 * read identically for both.
 */
export async function runContainerChecks(
  repoInput: string,
): Promise<{ checks: PulseScanCheckInput[] }> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return { checks: [] };
  return { checks: evaluateContainerChecks(snapshot) };
}

/**
 * Run the service-depth family (auth, observability, API, payments, email).
 *
 * Shape-agnostic: a Django service and a Node one hash passwords, log, retry and
 * take payments in the same shapes, and every rule SKIPs when its subject is not
 * present in the repo.
 */
export async function runServiceDepthChecks(
  repoInput: string,
): Promise<{ checks: PulseScanCheckInput[] }> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return { checks: [] };
  return { checks: evaluateServiceDepthChecks(snapshot) };
}

/**
 * Run the operational-depth family.
 *
 * Shape-agnostic and evidence-gated: each rule determines its own subject
 * applicability, so a repo without payments, AI, queues, or auth receives SKIPs
 * for those controls rather than fabricated findings.
 */
export async function runOperationalDepthChecks(
  repoInput: string,
): Promise<{ checks: PulseScanCheckInput[] }> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return { checks: [] };
  return { checks: evaluateOperationalDepthChecks(snapshot) };
}

/** The resolved snapshot shape for a repo, for callers that need it for labelling. */
export async function detectRepoShape(repoInput: string): Promise<SnapshotShape> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return "none";
  return resolveSnapshotShape(snapshot.paths, snapshot.files);
}

/**
 * Run the browser-extension family. Independent of the mobile family: an extension
 * is not a NativePlatform, and neither should be able to take the other out.
 *
 * Shares the same memoized snapshot, so this adds no extra tree fetch.
 */
export async function runChromeExtensionChecks(
  repoInput: string,
): Promise<{ isExtension: boolean; checks: PulseScanCheckInput[] }> {
  const snapshot = await getRepoSnapshot(repoInput);
  if (!snapshot || !snapshot.accessible) return { isExtension: false, checks: [] };
  if (!isChromeExtension(snapshot)) return { isExtension: false, checks: [] };
  return {
    isExtension: true,
    checks: [...evaluateChromeExtensionChecks(snapshot), ...evaluateExtensionExtendedChecks(snapshot)],
  };
}
