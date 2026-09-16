// ─────────────────────────────────────────────────────────────────────────────
// REACT NATIVE CHECK FAMILY.
//
// WHY THIS EXISTS. The scan dropdown offers "Cross-platform mobile (React Native
// / Flutter)" — and only Flutter had checks behind it. `detectNativePlatform`
// has returned "react-native" since §34, but native-repo.ts explicitly declined
// to fetch its sources ("it's a JS project and the generic checks cover it"), so
// runNativeMobileChecks returned an empty list and the label was a promise Pulse
// did not keep.
//
// "The generic checks cover it" is half true and that is the problem. RN really
// is a JS project — package.json, ESLint, tsconfig and Jest all apply, which is
// why REACT_NATIVE_INAPPLICABLE_CHECKS is the shortest skip list of any shape.
// But everything that makes an RN app a MOBILE app is invisible to those checks:
// which JS engine it ships, whether release builds strip logs, where the auth
// token lives, whether the two native shells agree about cleartext HTTP. None of
// that appears in a lint config.
//
// THE HOUSE PATTERN, AGAIN. The token-storage and environment findings below are
// the same defect this codebase has now found in three of the same client's apps
// (§34.6): a secure store present in the dependency list while the tokens sit in
// the plaintext one. It is one habit, not three teams' mistakes, which is exactly
// what makes it worth a check rather than a code review comment.
//
// EVIDENCE MODEL (identical to ios-app.ts / android-app.ts):
//   • PRESENCE findings are sound on a sample — we saw it.
//   • ABSENCE findings self-downgrade to LOW confidence below the coverage
//     threshold, so a thin sample can never invent a failure.
//
// Comments are stripped before matching. A commented-out `hermesEnabled=true` is
// not a live setting, and that bug has shipped twice (§34.3, §34.6).
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";
import { isVendoredPath, stripCStyleComments, sampleCoverage } from "./native-mobile";
import { allDependencies, anyDependency, parsePackageManifest, type PackageManifest } from "./project-shape";

/** Below this sampled-file coverage, absence findings self-downgrade to LOW. */
const SOUND_ABSENCE_COVERAGE = 0.3;

/** Density findings need a denominator — below this they SKIP instead of guessing. */
const MIN_LINES_FOR_DENSITY = 200;

/**
 * The oldest React Native minor still receiving security fixes. RN maintains the
 * latest three minor series; as of July 2026 that is 0.86 (current), 0.85 and
 * 0.84 (security-only).
 *
 * Bump this line when the window moves. An app below it is carrying unpatched
 * issues in the framework AND in the bundled Hermes/JSC engine, and — because RN
 * upgrades get harder the further behind you fall — every release skipped makes
 * the eventual jump more expensive, which is the real reason apps end up stranded.
 */
const RN_OLDEST_SUPPORTED_MINOR = 84;

interface RnContext {
  /** Sampled JS/TS source with comments stripped — for "is this live code?". */
  source: string;
  /** Same source, comments intact — for signals that legitimately live in comments. */
  sourceRaw: string;
  /** android/gradle.properties + android/**\/build.gradle joined. */
  gradle: string;
  /** android/**\/AndroidManifest.xml joined. */
  androidManifest: string;
  /** ios/**\/Info.plist joined. */
  iosPlist: string;
  /** babel.config.js / .babelrc joined. */
  babel: string;
  /** app.json / app.config.* / eas.json joined (Expo + EAS). */
  appConfig: string;
  pkg: PackageManifest | null;
  /** Non-vendored sampled line count, for density metrics. */
  lines: number;
  /** Sampled fraction of the repo's JS/TS files (0–1). */
  coverage: number;
  paths: string[];
}

function buildContext(snapshot: RepoSnapshot): RnContext {
  // App source only. The native shells (android/, ios/) are read as CONFIG below;
  // counting them here would dilute coverage with files we never sample.
  const jsPaths = snapshot.paths.filter(
    (p) => /\.(js|jsx|ts|tsx)$/i.test(p) && !isVendoredPath(p) && !/^(android|ios)\//i.test(p),
  );
  const read: string[] = [];
  let gradle = "";
  let androidManifest = "";
  let iosPlist = "";
  let babel = "";
  let appConfig = "";
  let pkgText: string | null = null;

  for (const [path, text] of snapshot.files) {
    if (/(^|\/)AndroidManifest\.xml$/i.test(path)) androidManifest += "\n" + text;
    else if (/(^|\/)(gradle\.properties|build\.gradle(\.kts)?)$/i.test(path)) gradle += "\n" + text;
    else if (/(^|\/)Info\.plist$/i.test(path)) iosPlist += "\n" + text;
    else if (/(^|\/)(babel\.config\.(js|cjs|ts)|\.babelrc(\.js|\.json)?)$/i.test(path)) babel += "\n" + text;
    else if (/(^|\/)(app\.json|app\.config\.(js|ts)|eas\.json)$/i.test(path)) appConfig += "\n" + text;
    else if (/(^|\/)package\.json$/i.test(path) && !path.includes("/")) pkgText = text;
    else if (/\.(js|jsx|ts|tsx)$/i.test(path) && !isVendoredPath(path) && !/^(android|ios)\//i.test(path)) {
      read.push(text);
    }
  }

  const sourceRaw = read.join("\n");
  return {
    source: stripCStyleComments(sourceRaw),
    sourceRaw,
    gradle,
    androidManifest,
    iosPlist,
    babel,
    appConfig,
    pkg: parsePackageManifest(pkgText),
    lines: sourceRaw.split("\n").length,
    coverage: sampleCoverage(read.length, jsPaths.length, snapshot.truncated),
    paths: snapshot.paths,
  };
}

function absence(ctx: RnContext, check: Omit<PulseScanCheckInput, "confidence">): PulseScanCheckInput {
  const sound = ctx.coverage >= SOUND_ABSENCE_COVERAGE;
  return {
    ...check,
    confidence: sound ? "HIGH" : "LOW",
    detail: sound
      ? check.detail
      : `${check.detail} (Based on ${Math.round(ctx.coverage * 100)}% of this app's JavaScript/TypeScript files — ` +
        `below the threshold for a confident "not present anywhere", so this is inconclusive rather than a failure.)`,
  };
}

export function evaluateReactNativeChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  if (!snapshot.accessible) return [];
  const ctx = buildContext(snapshot);
  return [
    ...secretsChecks(ctx),
    ...securityChecks(ctx),
    ...buildChecks(ctx),
    ...performanceChecks(ctx),
    ...qualityChecks(ctx),
  ];
}

// ── Secrets & credential storage ────────────────────────────────────────────
function secretsChecks(ctx: RnContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Tokens in AsyncStorage. React Native's own security page is explicit that
  // AsyncStorage is unencrypted and must not hold tokens.
  const usesAsyncStorage =
    anyDependency(ctx.pkg, /^(@react-native-async-storage\/async-storage|@react-native-community\/async-storage)$/) ||
    /AsyncStorage/.test(ctx.source);
  const usesSecureStore = anyDependency(
    ctx.pkg,
    /^(react-native-keychain|expo-secure-store|react-native-encrypted-storage|react-native-sensitive-info)$/,
  );
  const TOKEN_KEY = /['"][^'"]*(?:access|refresh|auth|bearer|id)[_-]?token[^'"]*['"]|\b(?:access|refresh|auth)Token\b/i;
  const tokenNearStorage = usesAsyncStorage && TOKEN_KEY.test(ctx.source);

  if (tokenNearStorage) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "rn_token_storage",
      label: "Auth tokens stored in the secure keystore",
      status: usesSecureStore ? "WARN" : "FAIL",
      confidence: usesSecureStore ? "MEDIUM" : "HIGH",
      detail: usesSecureStore
        ? `Auth token keys appear alongside AsyncStorage use, and a secure store (react-native-keychain / ` +
          `expo-secure-store) is ALSO in this project. Confirm the tokens specifically go to the secure store — a ` +
          `half-finished migration, where the secure store exists but the tokens were never moved into it, is the ` +
          `common case and is exactly what a scan of this client's iOS and Flutter apps found.`
        : `Auth token keys are read from or written to AsyncStorage, with no secure-storage library anywhere in the ` +
          `dependency list. AsyncStorage is unencrypted by design — on Android it is a plaintext SQLite/file store in ` +
          `app-private storage, readable on a rooted device and extractable via ADB backup where backup is allowed; ` +
          `React Native's own security documentation says not to put tokens in it. Move them to ` +
          `\`react-native-keychain\` or \`expo-secure-store\`, which use the iOS Keychain and Android Keystore.`,
    });
  }

  // A password persisted at all is worse than where it is persisted.
  if (usesAsyncStorage && /['"][^'"]*password[^'"]*['"]\s*,/i.test(ctx.source)) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "rn_password_retention",
      label: "User password is not persisted on device",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `A password key appears to be written to on-device storage, typically for a "remember me" feature. Even in a ` +
        `secure store a password never needs to be retained: keep a refresh token and re-authenticate with that. ` +
        `Retaining it widens the blast radius of any device compromise to the user's actual credential, which is very ` +
        `often reused on other services.`,
    });
  }

  // Secrets compiled into the JS bundle. react-native-config and dotenv variants
  // inline values at BUILD time — the value ends up in the shipped bundle, which
  // is the misconception RN's docs call out by name.
  const SECRET_LITERAL = /(api[_-]?key|apiKey|secret|clientSecret|private[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/i;
  const usesConfigLib = anyDependency(ctx.pkg, /^(react-native-config|react-native-dotenv|@env)$/);
  if (SECRET_LITERAL.test(ctx.source)) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "rn_bundled_secret",
      label: "No API secrets compiled into the JS bundle",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `A long secret-shaped literal appears in application source. Everything in a React Native app ships inside the ` +
        `JS bundle in the IPA/AAB, and pulling that bundle out of a downloaded app takes minutes` +
        `${usesConfigLib
          ? " — note that `react-native-config`/`react-native-dotenv` do NOT help here: they inline the value at build time, so a secret set that way is just as present in the shipped bundle"
          : ""}. Treat this key as compromised and rotate it, then move the call behind your own backend so the secret ` +
        `never leaves a server you control.`,
    });
  }

  // Sending tokens/PII to crash reporters is a named pitfall in RN's docs.
  const hasReporting = anyDependency(ctx.pkg, /^(@sentry\/react-native|bugsnag-react-native|@bugsnag\/|rollbar-react-native)/);
  if (hasReporting) {
    const scrubs = /beforeSend|beforeBreadcrumb|redact|scrub|sanitiz/i.test(ctx.source);
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "rn_reporting_pii_scrub",
      label: "Crash reports are scrubbed of tokens and PII",
      status: scrubs ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: scrubs
        ? `A scrubbing hook (beforeSend / beforeBreadcrumb) is present on the reporting SDK.`
        : `A crash-reporting SDK is configured with no visible \`beforeSend\` scrubbing hook. These SDKs attach ` +
          `network breadcrumbs and component state by default, which routinely carries Authorization headers and ` +
          `user records into a third-party system — turning an incident in their service into a breach in yours. Add ` +
          `a \`beforeSend\` that strips auth headers, tokens and personal fields.`,
    });
  }

  return checks;
}

// ── Transport and platform security ─────────────────────────────────────────
function securityChecks(ctx: RnContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // The two native shells must agree. Checking them TOGETHER is the point: a
  // cross-platform app whose platforms disagree about cleartext HTTP has one
  // insecure platform and a team that believes it has none.
  const androidCleartext = /android:usesCleartextTraffic\s*=\s*"true"/i.test(ctx.androidManifest);
  const iosArbitraryLoads = /<key>NSAllowsArbitraryLoads<\/key>\s*<true\/>/i.test(ctx.iosPlist);
  const eitherOpen = androidCleartext || iosArbitraryLoads;
  const bothOpen = androidCleartext && iosArbitraryLoads;
  if (ctx.androidManifest || ctx.iosPlist) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "rn_cleartext_traffic",
      label: "Cleartext HTTP is disabled on both platforms",
      status: eitherOpen ? "FAIL" : "PASS",
      confidence: "HIGH",
      detail: bothOpen
        ? `Both native shells permit plaintext HTTP — \`usesCleartextTraffic="true"\` on Android and ` +
          `\`NSAllowsArbitraryLoads\` on iOS. Every request can be downgraded and read on a hostile network, and ` +
          `Apple requires a written justification for the ATS exception at review. Remove both and scope any genuine ` +
          `exception to a single host.`
        : androidCleartext
          ? `Android permits plaintext HTTP (\`usesCleartextTraffic="true"\`) while iOS does not. The platforms ` +
            `disagree, which usually means the flag was added to unblock a local development build and never removed ` +
            `— so the Android build ships downgradeable. Remove it, or scope one host with a networkSecurityConfig.`
          : iosArbitraryLoads
            ? `iOS permits plaintext HTTP (\`NSAllowsArbitraryLoads\`) while Android does not. Apple requires a ` +
              `justification for this exception at review, and a blanket one is frequently rejected. Scope it to the ` +
              `specific domain with \`NSExceptionDomains\`, or remove it.`
            : `Neither native shell permits app-wide cleartext HTTP.`,
      evidence: eitherOpen ? [androidCleartext && "Android", iosArbitraryLoads && "iOS"].filter(Boolean).join(" + ") : undefined,
    });
  }

  // WebView with a wildcard origin whitelist plus injected JS.
  if (anyDependency(ctx.pkg, /^react-native-webview$/) || /<WebView\b/.test(ctx.source)) {
    const wildcardOrigins = /originWhitelist\s*=\s*\{?\s*\[\s*['"]\*['"]/.test(ctx.source);
    const injectsJs = /injectedJavaScript|injectedJavaScriptBeforeContentLoaded/.test(ctx.source);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "rn_webview_origins",
      label: "WebView restricts which origins it will load",
      status: wildcardOrigins && injectsJs ? "FAIL" : wildcardOrigins ? "WARN" : "PASS",
      confidence: "MEDIUM",
      detail: wildcardOrigins
        ? `\`originWhitelist={['*']}\` lets the WebView navigate to any origin${injectsJs
            ? ", and `injectedJavaScript` runs your script — and exposes its message bridge — on whatever page it lands on. A redirect off your domain therefore hands an arbitrary page a channel into the app"
            : ". A link or redirect can take it off your domain while it still looks like part of the app"}. Restrict ` +
          `\`originWhitelist\` to the domains you control and handle everything else with \`Linking.openURL\`.`
        : `The WebView does not use a wildcard origin whitelist.`,
    });
  }

  // Deep links carrying credentials — RN's docs call this out specifically,
  // because URL schemes have no central registry and any app can claim yours.
  if (/Linking\.(addEventListener|getInitialURL)|createURL|expo-linking/.test(ctx.source)) {
    const tokenInLink = /[?&](token|access_token|auth|jwt|session|api_?key)=/i.test(ctx.sourceRaw);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "rn_deeplink_credentials",
      label: "Deep links do not carry credentials",
      status: tokenInLink ? "FAIL" : "PASS",
      confidence: tokenInLink ? "MEDIUM" : "MEDIUM",
      detail: tokenInLink
        ? `A deep-link URL appears to carry a token or session parameter. Custom URL schemes have no central registry ` +
          `— any other app on the device can register the same scheme and receive the link, including the token in ` +
          `it. Pass an opaque single-use code instead and exchange it for the token over HTTPS, or use Universal ` +
          `Links / App Links, which are domain-verified.`
        : `No credentials found in deep-link parameters.`,
    });
  }

  // Certificate pinning is genuinely optional — it is a real hardening step with
  // a real operational cost (certs rotate), so this is informational, not a fail.
  const pins = anyDependency(ctx.pkg, /^(react-native-ssl-pinning|react-native-cert-pinner|react-native-pinch)$/) ||
    /NSPinnedDomains|certificatePinner|sslPinning/i.test(ctx.source + ctx.iosPlist);
  checks.push(absence(ctx, {
    category: CATEGORIES.SECURITY,
    checkKey: "rn_certificate_pinning",
    label: "Certificate pinning considered for sensitive traffic",
    status: pins ? "PASS" : "WARN",
    detail: pins
      ? `Certificate pinning is configured. Keep a rotation plan — a pinned certificate that expires without a shipped ` +
        `app update takes the app offline for everyone.`
      : `No certificate pinning found. This is a hardening measure rather than a defect: HTTPS already protects the ` +
        `traffic unless the device trusts a hostile root CA (a corporate MDM profile, a user-installed proxy, or ` +
        `malware). Pinning is worth it for apps handling payments or health data, and is usually not worth the ` +
        `rotation risk otherwise.`,
  }));

  return checks;
}

// ── Build configuration ─────────────────────────────────────────────────────
function buildChecks(ctx: RnContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // React Native version support window.
  const rnRange = allDependencies(ctx.pkg)["react-native"];
  if (rnRange) {
    const minor = Number(/0\.(\d+)/.exec(rnRange)?.[1] ?? -1);
    if (minor >= 0) {
      const supported = minor >= RN_OLDEST_SUPPORTED_MINOR;
      checks.push({
        category: CATEGORIES.CODE_QUALITY,
        checkKey: "rn_version_supported",
        label: "React Native version still receives fixes",
        status: supported ? "PASS" : "WARN",
        confidence: "HIGH",
        detail: supported
          ? `React Native 0.${minor} is within the supported window (the latest three minors, currently ` +
            `0.${RN_OLDEST_SUPPORTED_MINOR}+).`
          : `React Native 0.${minor} is outside the support window — only the latest three minor series receive ` +
            `fixes, currently 0.${RN_OLDEST_SUPPORTED_MINOR} and above. Beyond the unpatched framework and bundled ` +
            `JS-engine issues, RN upgrades compound: each release skipped makes the next jump harder, which is how ` +
            `apps end up stranded on a version they cannot leave. Upgrade incrementally using the official upgrade ` +
            `helper rather than waiting for a rewrite.`,
        evidence: `react-native ${rnRange}`,
      });
    }
  }

  // Hermes. Default since 0.70, but explicitly disabling it is common in older
  // projects and costs startup time and memory on every launch.
  const hermesOff = /hermesEnabled\s*=\s*false/i.test(ctx.gradle) ||
    /:hermes_enabled\s*=>\s*false/i.test(ctx.gradle) ||
    /"jsEngine"\s*:\s*"jsc"/i.test(ctx.appConfig);
  checks.push({
    category: CATEGORIES.PERFORMANCE,
    checkKey: "rn_hermes_enabled",
    label: "Hermes is the JavaScript engine",
    status: hermesOff ? "WARN" : "PASS",
    confidence: hermesOff ? "HIGH" : "MEDIUM",
    detail: hermesOff
      ? `Hermes is explicitly disabled (\`hermesEnabled=false\` / \`jsEngine: "jsc"\`), so the app ships JavaScriptCore ` +
        `and parses JavaScript at launch. Hermes precompiles to bytecode at BUILD time instead, which is the single ` +
        `largest startup win available to an RN app — typically halving time-to-interactive — and it lowers memory ` +
        `use and APK size too. It is the default from 0.70 onward; re-enabling it needs a release-build test pass ` +
        `because engine differences occasionally surface in date and regex handling.`
      : `Hermes is not disabled — it is the default engine from React Native 0.70 onward.`,
  });

  // New Architecture. Informational: adopting it is real work and the old one
  // still ships, so this is a WARN with the honest trade-off, not a failure.
  const newArchOn = /newArchEnabled\s*=\s*true/i.test(ctx.gradle) || /"newArchEnabled"\s*:\s*true/i.test(ctx.appConfig);
  checks.push({
    category: CATEGORIES.PERFORMANCE,
    checkKey: "rn_new_architecture",
    label: "New Architecture (Fabric / TurboModules) enabled",
    status: newArchOn ? "PASS" : "WARN",
    confidence: "MEDIUM",
    detail: newArchOn
      ? `The New Architecture is enabled — Fabric rendering and TurboModules remove the asynchronous bridge.`
      : `\`newArchEnabled\` is not set. The New Architecture replaces the asynchronous JSON bridge with direct ` +
        `synchronous access (JSI), which removes the serialise-every-message cost that shows up as jank in lists and ` +
        `gestures. It is the default for new apps and the old architecture is on a deprecation path, so this is a ` +
        `question of when rather than whether — but it needs every native dependency to have a compatible version, so ` +
        `treat it as planned work, not a switch to flip before a release.`,
  });

  // ProGuard/R8 on Android release builds.
  const proguardOff = /enableProguardInReleaseBuilds\s*=\s*false/i.test(ctx.gradle);
  const proguardOn = /enableProguardInReleaseBuilds\s*=\s*true|isMinifyEnabled\s*=\s*true|minifyEnabled\s+true/i.test(ctx.gradle);
  if (ctx.gradle) {
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "rn_android_proguard",
      label: "Android release build is shrunk and obfuscated",
      status: proguardOn ? "PASS" : "WARN",
      confidence: proguardOn || proguardOff ? "HIGH" : "MEDIUM",
      detail: proguardOn
        ? `R8/ProGuard is enabled for Android release builds.`
        : `Android release shrinking is ${proguardOff ? "explicitly disabled" : "not enabled"} ` +
          `(\`enableProguardInReleaseBuilds\`). The APK then ships larger than it needs to be and with original class ` +
          `and method names intact, so the native side of the app — including how it talks to your API — reads ` +
          `straight out of a decompiler. Enable it and run the full test suite against a release build: shrinking is ` +
          `the classic source of "works in debug, crashes in production" reflection failures.`,
    });
  }

  // console.* stripped from release. Presence-based on the babel config.
  const stripsConsole = /transform-remove-console/.test(ctx.babel);
  const consoleCalls = (ctx.source.match(/\bconsole\.(log|debug|info|warn|error)\s*\(/g) ?? []).length;
  if (consoleCalls > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "rn_release_logging",
      label: "console output is stripped from release builds",
      status: stripsConsole ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: stripsConsole
        ? `${consoleCalls} console call(s) found, and \`babel-plugin-transform-remove-console\` is configured for ` +
          `release — confirm it is inside the production env block rather than applied unconditionally.`
        : `${consoleCalls} console call(s) and no \`babel-plugin-transform-remove-console\` in the Babel config, so ` +
          `they ship. Two costs: on Android every call is readable via adb and is captured in the bug reports users ` +
          `send to support — which is how tokens and request bodies leak — and each call is a synchronous bridge ` +
          `round trip in the old architecture, so a logging loop inside a render path measurably drops frames.`,
        evidence: `${consoleCalls} console call(s)`,
    });
  }

  // Source maps. Without them a production stack trace is minified nonsense.
  const uploadsSourceMaps =
    /sourcemap|sourceMap|SENTRY_.*UPLOAD|sentry-cli|upload-sourcemaps|hermesFlags/i.test(ctx.gradle + ctx.appConfig) ||
    ctx.paths.some((p) => /sentry\.properties$/i.test(p));
  checks.push({
    category: CATEGORIES.OBSERVABILITY,
    checkKey: "rn_source_maps",
    label: "Source maps are generated for release builds",
    status: uploadsSourceMaps ? "PASS" : "WARN",
    confidence: "MEDIUM",
    detail: uploadsSourceMaps
      ? `Source-map generation or upload is configured.`
      : `No source-map generation or upload found. Release JavaScript is minified — and, under Hermes, compiled to ` +
        `bytecode — so a production crash arrives as a stack of single-letter names at meaningless offsets. Without ` +
        `maps uploaded to your crash reporter, every production error is unactionable, which is the state most RN ` +
        `apps are in when they say crashes are hard to reproduce.`,
  });

  return checks;
}

// ── Performance ─────────────────────────────────────────────────────────────
function performanceChecks(ctx: RnContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Long lists rendered with .map inside a ScrollView mount every row at once.
  const scrollViewMap = /<ScrollView[\s\S]{0,400}\.map\s*\(/.test(ctx.source);
  const usesVirtualList = /<(FlatList|SectionList|FlashList|VirtualizedList)\b/.test(ctx.source);
  if (scrollViewMap) {
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "rn_list_virtualization",
      label: "Long lists are virtualised",
      status: usesVirtualList ? "WARN" : "FAIL",
      confidence: "MEDIUM",
      detail:
        `A \`ScrollView\` renders items with \`.map()\`${usesVirtualList
          ? ", alongside virtualised lists elsewhere in the app"
          : ", and no FlatList/FlashList appears anywhere in the sampled source"}. A ScrollView mounts EVERY child ` +
        `immediately, so a list of a few hundred rows blocks the JS thread on mount and holds all of it in memory — ` +
        `this is the most common cause of "the app freezes when I open that screen" in React Native. Use \`FlatList\` ` +
        `(or \`FlashList\`) so only visible rows are mounted.`,
    });
  }

  // Image caching. RN's stock <Image> has no persistent disk cache on Android.
  const cachedImages = anyDependency(ctx.pkg, /^(react-native-fast-image|expo-image|@d11\/react-native-fast-image)$/);
  checks.push(absence(ctx, {
    category: CATEGORIES.PERFORMANCE,
    checkKey: "rn_image_caching",
    label: "Remote images are cached on disk",
    status: cachedImages ? "PASS" : "WARN",
    detail: cachedImages
      ? `A caching image component (FastImage / expo-image) is in use.`
      : `No caching image library found, so remote images go through React Native's stock \`<Image>\`. On Android that ` +
        `has no persistent disk cache — every scroll back up refetches the same images over the network. On a metered ` +
        `or weak connection this is felt directly as both slowness and data use. \`expo-image\` or ` +
        `\`react-native-fast-image\` add disk caching and priority control.`,
  }));

  // HTTP response caching.
  checks.push(absence(ctx, {
    category: CATEGORIES.PERFORMANCE,
    checkKey: "rn_response_cache",
    label: "API responses are cached",
    status: /@tanstack\/react-query|swr|apollo|redux-persist|Cache-Control|staleTime/i.test(
      ctx.source + JSON.stringify(allDependencies(ctx.pkg)),
    ) ? "PASS" : "WARN",
    detail: /@tanstack\/react-query|swr|apollo|redux-persist|Cache-Control|staleTime/i.test(
      ctx.source + JSON.stringify(allDependencies(ctx.pkg)),
    )
      ? `A response cache or data-fetching cache layer is present.`
      : `No response caching found — no query cache (React Query / SWR / Apollo) and no Cache-Control handling. Every ` +
        `screen re-fetches from the network on every visit, so navigating back shows a spinner over data the device ` +
        `already had a second ago. This is the difference between an app that feels instant offline-ish and one that ` +
        `feels broken on a train.`,
  }));

  // Metered / cellular awareness for large transfers.
  checks.push(absence(ctx, {
    category: CATEGORIES.PERFORMANCE,
    checkKey: "rn_metered_network",
    label: "Large transfers respect metered connections",
    status: /useNetInfo|NetInfo\.|isConnectionExpensive|type\s*===\s*['"]cellular['"]/i.test(ctx.source) ? "PASS" : "WARN",
    detail: /useNetInfo|NetInfo\.|isConnectionExpensive|type\s*===\s*['"]cellular['"]/i.test(ctx.source)
      ? `Connection-type checks are present before transfers.`
      : `No NetInfo connection-type check found. Downloads, media prefetch and background sync then behave identically ` +
        `on Wi-Fi and on cellular, which is what turns into "the app used all my data". Gate large transfers on ` +
        `\`useNetInfo().type\` or \`isConnectionExpensive\`, and offer a Wi-Fi-only setting for anything bulky.`,
  }));

  return checks;
}

// ── Quality and accessibility ───────────────────────────────────────────────
function qualityChecks(ctx: RnContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Accessibility labels — a ratio, not a presence test. Presence alone passed an
  // app with 358 hardcoded font sizes and one accessible control (§34.3).
  const touchables = (ctx.source.match(/<(TouchableOpacity|TouchableHighlight|Pressable|TouchableWithoutFeedback|Button)\b/g) ?? []).length;
  const labelled = (ctx.source.match(/accessibilityLabel\s*=/g) ?? []).length;
  if (touchables >= 5) {
    const ratio = labelled / touchables;
    checks.push(absence(ctx, {
      category: CATEGORIES.ACCESSIBILITY,
      checkKey: "rn_accessibility_labels",
      label: "Interactive elements have accessibility labels",
      status: ratio >= 0.5 ? "PASS" : ratio > 0 ? "WARN" : "FAIL",
      detail: ratio >= 0.5
        ? `${labelled} accessibility label(s) across ${touchables} touchable element(s).`
        : `${labelled} \`accessibilityLabel\` across ${touchables} touchable element(s) (${Math.round(ratio * 100)}%). ` +
          `An unlabelled touchable is announced by VoiceOver and TalkBack as just "button" — an icon-only control is ` +
          `then completely unusable with a screen reader. Labels are also what automated UI tests target, so adding ` +
          `them pays twice.`,
      evidence: `${labelled}/${touchables} labelled`,
    }));
  }

  // Over-the-air updates must be signed — an unsigned OTA channel is a code
  // execution path onto every install.
  const usesOta = anyDependency(ctx.pkg, /^(react-native-code-push|expo-updates|@rnef\/|react-native-ota)/);
  if (usesOta) {
    const signed = /codeSigningCertificate|publicKey|"codeSigning"|CodePushPublicKey/i.test(
      ctx.appConfig + ctx.source + ctx.iosPlist + ctx.gradle,
    );
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "rn_ota_update_signing",
      label: "Over-the-air updates are signature-verified",
      status: signed ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: signed
        ? `Code signing is configured for over-the-air updates.`
        : `An over-the-air update mechanism (CodePush / expo-updates) is in use with no code-signing configuration ` +
          `found. OTA replaces the JavaScript bundle on every install without going through the app stores — so ` +
          `whoever can write to that update channel can run their code inside your signed app, with your ` +
          `permissions. Enable code signing (\`expo-updates\` \`codeSigningCertificate\`, or CodePush's public key) ` +
          `so the client refuses a bundle it cannot verify.`,
    });
  }

  // Test suite proportionate to the codebase. Directory-based, so absence is
  // checkable from the tree — no confidence downgrade needed.
  const testFiles = ctx.paths.filter(
    (p) => /(\.(test|spec)\.(js|jsx|ts|tsx)$|(^|\/)__tests__\/)/i.test(p) && !isVendoredPath(p),
  );
  const sourceCount = ctx.paths.filter(
    (p) => /\.(js|jsx|ts|tsx)$/i.test(p) && !isVendoredPath(p) && !/^(android|ios)\//i.test(p),
  ).length;
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "rn_test_coverage",
    label: "Test suite proportionate to the codebase",
    status: testFiles.length === 0 ? "FAIL" : testFiles.length < Math.max(3, sourceCount * 0.02) ? "WARN" : "PASS",
    confidence: "HIGH",
    detail: testFiles.length === 0
      ? `No test files found against ${sourceCount} JavaScript/TypeScript source files — nothing verifies a change ` +
        `before it reaches the stores, where a bad release takes days to replace.`
      : `${testFiles.length} test file(s) against ${sourceCount} source files.`,
    evidence: `${testFiles.length} test / ${sourceCount} source`,
  });

  // TypeScript. RN ships a TS template by default now, so a JS-only app of any
  // size is worth flagging — the bridge between JS and native is untyped and
  // this is where prop-shape bugs become native crashes.
  if (ctx.lines >= MIN_LINES_FOR_DENSITY) {
    const tsFiles = ctx.paths.filter((p) => /\.tsx?$/i.test(p) && !isVendoredPath(p)).length;
    const jsFiles = ctx.paths.filter((p) => /\.jsx?$/i.test(p) && !isVendoredPath(p) && !/^(android|ios)\//i.test(p)).length;
    const total = tsFiles + jsFiles;
    if (total >= 20) {
      const tsRatio = tsFiles / total;
      checks.push({
        category: CATEGORIES.CODE_QUALITY,
        checkKey: "rn_typescript_adoption",
        label: "TypeScript used across the app",
        status: tsRatio >= 0.8 ? "PASS" : tsRatio > 0.2 ? "WARN" : "WARN",
        confidence: "HIGH",
        detail: tsRatio >= 0.8
          ? `${Math.round(tsRatio * 100)}% of source files are TypeScript.`
          : `${Math.round(tsRatio * 100)}% of source files are TypeScript (${tsFiles} of ${total}). React Native ships ` +
            `a TypeScript template by default, and the JS↔native boundary is the one place where a wrong prop shape ` +
            `stops being a rendering bug and becomes a native crash on a device you cannot debug. Converting ` +
            `incrementally — \`allowJs\` on, file by file — is the usual path.`,
        evidence: `${tsFiles}/${total} TypeScript`,
      });
    }
  }

  return checks;
}
