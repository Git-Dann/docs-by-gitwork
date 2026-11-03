// ─────────────────────────────────────────────────────────────────────────────
// CROSS-PLATFORM MOBILE — SECOND FAMILY (Flutter + React Native).
//
// flutter-app.ts (21) and react-native-app.ts (22) cover the storage, environment
// and release-logging defects found in the client apps. This file covers what
// cross-platform specifically gets wrong that neither native family has to think
// about: the JS/Dart bridge, over-the-air update channels, bundled source maps,
// and the two-platform build drift that lets iOS and Android ship different code.
//
// Runs for BOTH shapes because the failure modes are shared — an OTA channel with
// no signature check is the same exposure whether it is CodePush or Shorebird.
// Checks that only make sense for one runtime SKIP on the other rather than
// failing it.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";
import { isVendoredPath } from "./native-mobile";
import {
  RN_NON_APP_SOURCE,
  RN_OLDEST_SUPPORTED_MINOR,
  parseExpoNativeConfig,
  rnAppShell,
  type ExpoNativeConfig,
  type RnAppShell,
} from "./react-native-app";

const SOUND_ABSENCE_COVERAGE = 0.3;

export type CrossPlatformRuntime = "flutter" | "react-native";

interface Ctx {
  runtime: CrossPlatformRuntime;
  source: string;
  sampled: number;
  total: number;
  manifests: string;
  packageJson: string;
  iosPlist: string;
  androidManifest: string;
  /** Release Android manifests only (no src/debug, test or profile overlays), for deep-link reads. */
  releaseAndroidManifest: string;
  /** All .entitlements contents: where iOS associated domains (universal links) live. */
  entitlements: string;
  coverage: number;
  paths: string[];
  /** React Native only: the shipping native shell and the Expo config (CNG apps have no shell). */
  shell: RnAppShell | null;
  expo: ExpoNativeConfig | null;
  /** React Native only: the ROOT package.json — the app's, not a workspace package's. */
  rootPackageJson: string;
  /** React Native only: app.json / app.config.(js|ts). */
  appConfig: string;
}

/** Strip // and /* *\/ comments, preserving both quote styles (Dart uses both). */
export function stripBridgeComments(source: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (quote) {
      if (source[i] === "\\") {
        out += source.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (source[i] === quote) quote = null;
      out += source[i++];
      continue;
    }
    if (source[i] === '"' || source[i] === "'" || source[i] === "`") {
      quote = source[i];
      out += source[i++];
      continue;
    }
    if (two === "//") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (two === "/*") {
      i += 2;
      while (i < source.length && source.slice(i, i + 2) !== "*/") i++;
      i += 2;
      continue;
    }
    out += source[i++];
  }
  return out;
}

function buildCtx(snapshot: RepoSnapshot, runtime: CrossPlatformRuntime): Ctx {
  const src: string[] = [];
  const manifests: string[] = [];
  let packageJson = "";
  const plist: string[] = [];
  const androidManifest: string[] = [];
  const releaseAndroidManifest: string[] = [];
  let entitlements = "";
  let sampled = 0;
  const ext = runtime === "flutter" ? /\.dart$/i : /\.(ts|tsx|js|jsx)$/i;
  const isRn = runtime === "react-native";
  // React Native: tests, mocks and e2e helpers are not app code (a Jest test was what
  // passed xp_ota_rollback on Bluesky), and they leave the coverage ratio on both sides.
  const isSource = (path: string) =>
    ext.test(path) && (!isRn || (!RN_NON_APP_SOURCE.test(path) && !isVendoredPath(path)));
  let appConfig = "";

  for (const [path, text] of snapshot.files) {
    if (isRn && /(^|\/)(app\.json|app\.config\.(js|ts))$/i.test(path) && !isVendoredPath(path)) appConfig += "\n" + text;
    if (isSource(path)) {
      src.push(text);
      sampled++;
    } else if (/pubspec\.ya?ml$/i.test(path)) manifests.push(text);
    else if (/(^|\/)package\.json$/i.test(path) && !packageJson) packageJson = text;
    else if (/Info\.plist$/i.test(path)) plist.push(text);
    else if (/AndroidManifest\.xml$/i.test(path)) {
      androidManifest.push(text);
      if (!/(^|\/)src\/(debug|profile|androidTest|test)\//i.test(path)) releaseAndroidManifest.push(text);
    } else if (/\.entitlements$/i.test(path) && !isVendoredPath(path)) entitlements += "\n" + text;
  }

  const total = snapshot.paths.filter(isSource).length;
  // React Native reads the app SHELL, not every plist/manifest in the repo: share and
  // notification extensions, test targets, the debug manifest and library modules
  // were all being counted as the app (see rnAppShell). Flutter keeps the old reads.
  const shell = isRn ? rnAppShell(snapshot) : null;
  return {
    runtime,
    source: stripBridgeComments(src.join("\n")),
    sampled,
    total,
    manifests: manifests.join("\n"),
    packageJson,
    iosPlist: shell ? shell.iosPlist : plist.join("\n"),
    androidManifest: shell ? shell.androidManifest : androidManifest.join("\n"),
    releaseAndroidManifest: releaseAndroidManifest.join("\n"),
    entitlements,
    coverage: total === 0 ? 0 : sampled / total,
    paths: snapshot.paths,
    shell,
    expo: isRn ? parseExpoNativeConfig(appConfig) : null,
    rootPackageJson: snapshot.files.get("package.json") ?? "",
    appConfig,
  };
}

const CATALOGUE: [string, string][] = [
  ["xp_ota_updates_signed", "Over-the-air code updates are signature-verified"],
  ["xp_ota_rollback", "Over-the-air updates can be rolled back"],
  ["xp_source_maps_bundled", "Source maps are not shipped inside the app bundle"],
  ["xp_bridge_eval", "The JS/Dart bridge does not evaluate remote code"],
  ["xp_platform_parity_permissions", "iOS and Android request a consistent permission set"],
  ["xp_platform_parity_version", "iOS and Android build from the same version number"],
  ["xp_deep_link_both_platforms", "Deep links are configured on both platforms"],
  ["xp_native_module_count", "Native module usage is proportionate to the codebase"],
  ["xp_dependency_maintenance", "Cross-platform dependencies are actively maintained"],
  ["xp_hardcoded_dimensions", "Layouts are not built from hardcoded pixel values"],
  ["xp_safe_area", "Layouts respect the device safe area"],
  ["xp_list_virtualisation", "Long lists are virtualised"],
  ["xp_image_caching", "Remote images are cached rather than refetched"],
  ["xp_error_boundary", "The UI tree has a top-level error boundary"],
  ["xp_release_assertions", "Debug-only assertions do not run in release"],
  ["xp_locale_formatting", "Dates and numbers are formatted by locale"],
];

export const CROSS_PLATFORM_EXTENDED_KEYS: string[] = CATALOGUE.map(([k]) => k);

export function evaluateCrossPlatformExtendedChecks(
  snapshot: RepoSnapshot,
  runtime: CrossPlatformRuntime,
): PulseScanCheckInput[] {
  const ctx = buildCtx(snapshot, runtime);
  const checks: PulseScanCheckInput[] = [];
  const soundAbsence = ctx.coverage >= SOUND_ABSENCE_COVERAGE;
  const isFlutter = runtime === "flutter";

  const add = (
    checkKey: string,
    label: string,
    status: PulseScanCheckInput["status"],
    detail: string,
    opts: { absence?: boolean; nonePass?: boolean } = {},
  ) => {
    // Only an adverse verdict is an absence claim. SKIPPED ("no remote images at all") is a
    // decision about applicability and must not be rewritten to INCONCLUSIVE.
    const weak = opts.absence === true && !soundAbsence && (status === "WARN" || status === "FAIL");
    // A PASS that means "found none of the bad pattern" is ALSO an absence claim. On a
    // 5–7% sample it cannot be HIGH — the pattern may well sit in the 93% unread.
    // (Shared with Flutter: the same sampling, the same honesty rule.)
    const weakPass = opts.nonePass === true && status === "PASS" && !soundAbsence;
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey,
      label,
      // Not finding a pattern in a minority sample of the source is not evidence that it is missing.
      status: weak ? "INCONCLUSIVE" : status,
      confidence: weak ? "LOW" : weakPass ? "MEDIUM" : "HIGH",
      ...(weak
        ? {
            confidenceReason:
              `Only ${ctx.sampled} of ${ctx.total} source files were read, so the absence of this pattern is not ` +
              "established.",
          }
        : weakPass
          ? {
              confidenceReason:
                `Only ${ctx.sampled} of ${ctx.total} source files were read; none of them showed the pattern.`,
            }
          : {}),
      detail: weak ? `Not established from the sampled source. ${detail}` : detail,
    });
  };

  if (ctx.total === 0) {
    for (const [key, label] of CATALOGUE) {
      checks.push({
        category: CATEGORIES.APP_STORE,
        checkKey: key,
        label,
        status: "SKIPPED",
        confidence: "HIGH",
        detail: "No cross-platform source was read, so the extended cross-platform family did not run.",
      });
    }
    return checks;
  }

  const isRn = runtime === "react-native";
  // React Native: the root package.json and the Expo config (where expo-updates is
  // configured), not whichever workspace package.json happened to be read first.
  const all = isRn ? ctx.source + ctx.rootPackageJson + ctx.appConfig : ctx.source + ctx.packageJson + ctx.manifests;

  // ── Over-the-air updates ───────────────────────────────────────────────────
  const usesOta = /codepush|code-push|expo-updates|shorebird|EXUpdates|app_center/i.test(all);
  // React Native: only the real signing settings. A bare `publicKey` matched any crypto
  // code. Flutter (Shorebird) keeps its previous pattern.
  const otaSigned = isRn
    ? /codeSigningCertificate|codeSigningMetadata|CodePushPublicKey/.test(all)
    : /publicKey|code_signing|codeSigningCertificate|expo-updates.*codeSigning|signingKey/i.test(all);
  add(
    "xp_ota_updates_signed",
    "Over-the-air code updates are signature-verified",
    !usesOta ? "SKIPPED" : otaSigned ? "PASS" : "WARN",
    !usesOta
      ? "No over-the-air update mechanism was found, so there is no update channel to secure."
      : otaSigned
        ? "The OTA update channel is configured with code signing, so the device rejects a bundle it cannot verify."
        : "An over-the-air update mechanism is configured with no code-signing key. OTA delivers executable code " +
          "outside the App Store and Play review, so whoever can publish to that channel — or intercept it — can " +
          "replace your application logic on every installed device. This is the one place a cross-platform app has " +
          "a distribution risk a native app does not.",
  );

  if (isRn) {
    // Rollback for expo-updates and CodePush is a publishing action (`eas update:rollback`,
    // the App Center CLI / dashboard), and expo-updates falls back to the embedded bundle
    // on its own. So it is not visible in a repo — the old /rollback|revert/ test passed on
    // a `rollbackConvoOptimistic` helper and a test. Only an explicit client setting counts.
    const explicitRollback = /rollbackRetryOptions|codePush\.rollback|CodePush\.rollback/.test(all);
    add(
      "xp_ota_rollback",
      "Over-the-air updates can be rolled back",
      !usesOta || !explicitRollback ? "SKIPPED" : "PASS",
      !usesOta
        ? "No over-the-air update mechanism was found."
        : explicitRollback
          ? "The OTA client is configured with an explicit rollback setting."
          : "Rolling back an over-the-air update is done from the publishing side (`eas update:rollback`, or the " +
            "CodePush CLI / dashboard), not in the app's code, and expo-updates falls back to the bundle embedded in " +
            "the build when an update fails to launch. Whether a rollback is possible therefore cannot be read from " +
            "the repository — confirm the team knows the rollback command before the next release.",
    );
  } else {
    const otaRollback = /rollback|rollbackRetryOptions|previousVersion|revert/i.test(all);
    add(
      "xp_ota_rollback",
      "Over-the-air updates can be rolled back",
      !usesOta ? "SKIPPED" : otaRollback ? "PASS" : "WARN",
      !usesOta
        ? "No over-the-air update mechanism was found."
        : otaRollback
          ? "The OTA configuration includes a rollback path."
          : "OTA updates are configured with no rollback. A bad bundle then reaches every device at once with no way " +
            "back except shipping another one — and if the bad bundle crashes on launch, it may never get far enough " +
            "to fetch the fix.",
    );
  }

  const sourceMaps = ctx.paths.some((p) => /\.(js|dart)\.map$|\.bundle\.map$/i.test(p));
  add(
    "xp_source_maps_bundled",
    "Source maps are not shipped inside the app bundle",
    sourceMaps ? "WARN" : "PASS",
    sourceMaps
      ? "Source-map files are committed alongside the bundle. If they ship inside the app, anyone who extracts the " +
        "package gets your original source with comments and variable names intact. Upload them to the crash " +
        "reporter instead and keep them out of the build."
      : "No source maps were found in the app bundle paths.",
  );

  const bridgeEval = isFlutter
    ? /Isolate\.spawnUri\(|dart:mirrors/.test(ctx.source)
    // `eval(` as a call, not as the tail of `retrieval(` or `obj.eval(`.
    : /(?<![\w.$])eval\(|new Function\(|globalEval|Function\(['"`]return/.test(ctx.source);
  add(
    "xp_bridge_eval",
    "The JS/Dart bridge does not evaluate remote code",
    bridgeEval ? "FAIL" : "PASS",
    bridgeEval
      ? "The app evaluates code at runtime. In a cross-platform app the bridge already has access to native modules, " +
        "so any string that reaches an evaluator runs with the app's full device permissions — camera, location, " +
        "storage and the token store."
      : "No runtime code evaluation was found in the sampled source.",
    { absence: true, nonePass: true },
  );

  // ── Platform parity — the failure mode unique to cross-platform ────────────
  const bothPresent = ctx.iosPlist.length > 0 && ctx.androidManifest.length > 0;
  if (isRn && ctx.shell && ctx.expo) {
    rnPermissionParity(ctx.shell, ctx.expo, add);
  } else {
    const iosPerms = (ctx.iosPlist.match(/NS\w+UsageDescription/g) ?? []).length;
    const androidPerms = (ctx.androidManifest.match(/uses-permission/g) ?? []).length;
    add(
      "xp_platform_parity_permissions",
      "iOS and Android request a consistent permission set",
      !bothPresent ? "SKIPPED" : Math.abs(iosPerms - androidPerms) <= 3 ? "PASS" : "WARN",
      !bothPresent
        ? "Only one platform's manifest was read, so parity could not be compared."
        : Math.abs(iosPerms - androidPerms) <= 3
          ? `iOS declares ${iosPerms} usage descriptions against ${androidPerms} Android permissions — broadly aligned.`
          : `iOS declares ${iosPerms} usage descriptions but Android declares ${androidPerms} permissions. A large gap ` +
            "usually means one platform requests something the other does not, so a feature silently does nothing on " +
            "one of them — or, worse, iOS is missing a usage description for a permission the shared code path " +
            "requests, which crashes the app on first use and fails review.",
    );
  }

  const iosVersion = /<key>CFBundleShortVersionString<\/key>\s*<string>([\d.]+)/.exec(ctx.iosPlist)?.[1];
  const pubspecVersion = /^version:\s*([\d.]+)/m.exec(ctx.manifests)?.[1];
  add(
    "xp_platform_parity_version",
    "iOS and Android build from the same version number",
    !iosVersion || !pubspecVersion ? "SKIPPED" : iosVersion === pubspecVersion ? "PASS" : "WARN",
    !iosVersion || !pubspecVersion
      ? "Version numbers for both platforms could not be read, so parity could not be compared."
      : iosVersion === pubspecVersion
        ? `Both platforms build version ${iosVersion}.`
        : `The manifest declares ${pubspecVersion} but Info.plist declares ${iosVersion}. Divergent version numbers ` +
          "make a crash report ambiguous about which build it came from, and store listings show different versions " +
          "for the same release.",
  );

  if (isRn && ctx.shell && ctx.expo) {
    rnDeepLinkParity(ctx.shell, ctx.expo, add);
  } else {
    // Universal links are declared in the .entitlements file, not Info.plist. And an
    // intent-filter is not a deep link: every Android app has the MAIN/LAUNCHER one. A
    // deep link is a filter with a <data android:scheme>, or a verified App Link.
    const iosLinks = /CFBundleURLSchemes/.test(ctx.iosPlist) || /associated-domains/.test(ctx.entitlements);
    const androidLinks = /<data\b[^>]*android:scheme/.test(ctx.releaseAndroidManifest) ||
      /android:autoVerify\s*=\s*"true"/.test(ctx.releaseAndroidManifest);
    add(
      "xp_deep_link_both_platforms",
      "Deep links are configured on both platforms",
      !bothPresent ? "SKIPPED" : iosLinks === androidLinks ? "PASS" : "WARN",
      !bothPresent
        ? "Only one platform's manifest was read."
        : iosLinks === androidLinks
          ? iosLinks
            ? "Deep linking is configured on both platforms."
            : "Neither platform configures deep links, which is consistent."
          : `Deep links are configured on ${iosLinks ? "iOS but not Android" : "Android but not iOS"}. Any link you ` +
            "send by email or push opens the app for half your users and the website for the other half.",
    );
  }

  // ── Quality signals ────────────────────────────────────────────────────────
  const nativeModules = ctx.paths.filter((p) => /(^|\/)(ios|android)\/.*\.(swift|m|mm|kt|java)$/i.test(p)).length;
  // Measured against every shared JS/TS file, tests included, as before: excluding
  // tests from the RN sample ratio must not quietly tighten this unrelated threshold.
  const sharedFiles = isRn ? ctx.paths.filter((p) => /\.(ts|tsx|js|jsx)$/i.test(p)).length : ctx.total;
  const nativeProportionate = nativeModules <= 25 || nativeModules <= sharedFiles * 0.1;
  add(
    "xp_native_module_count",
    "Native module usage is proportionate to the codebase",
    nativeProportionate ? "PASS" : "WARN",
    nativeProportionate
      ? `${nativeModules} platform-native source files against ${sharedFiles} shared source files — the shared ` +
        "codebase is doing the work, which is the point of a cross-platform framework."
      : `${nativeModules} platform-native source files sit alongside only ${sharedFiles} shared source files. Past a certain amount of ` +
        "native glue the project carries the cost of three codebases rather than one, and every feature needs a " +
        "developer who can write all three.",
  );

  // React Native uses the SAME support floor as rn_version_supported, read from the
  // ROOT package.json. The old hardcoded 0.60–0.73 window passed 0.81 and 0.83 as
  // "within the supported range" while rn_version_supported warned on them.
  const rnMinor = Number(/"react-native"\s*:\s*"[^"\d]*0\.(\d+)\./.exec(ctx.rootPackageJson || ctx.packageJson)?.[1] ?? -1);
  const oldDeps = isFlutter
    ? /flutter:\s*"?[<^]?1\.|sdk:\s*">=2\.[0-9]\./.test(ctx.manifests)
    : rnMinor >= 0 && rnMinor < RN_OLDEST_SUPPORTED_MINOR;
  add(
    "xp_dependency_maintenance",
    "Cross-platform dependencies are actively maintained",
    oldDeps ? "WARN" : "PASS",
    oldDeps
      ? "The project pins a framework version that is several releases behind. Cross-platform frameworks move fast " +
        "and each store SDK bump forces an upgrade eventually — the longer the gap, the more breaking changes have " +
        "to be absorbed at once, usually under deadline when a store rejects a build."
      : !isFlutter && rnMinor < 0
        ? "The React Native version could not be read from package.json."
        : "The framework version is within the supported range.",
  );

  const hardcodedDims = (ctx.source.match(/(width|height):\s*\d{2,4}\b/g) ?? []).length;
  const responsive = /MediaQuery|useWindowDimensions|Dimensions\.get|LayoutBuilder|flex:/i.test(ctx.source);
  add(
    "xp_hardcoded_dimensions",
    "Layouts are not built from hardcoded pixel values",
    hardcodedDims < 10 ? "PASS" : responsive ? "PASS" : "WARN",
    hardcodedDims < 10
      ? "Few hardcoded dimensions in the sampled source."
      : responsive
        ? `${hardcodedDims} fixed dimensions were found, but the codebase also uses responsive layout primitives.`
        : `${hardcodedDims} hardcoded width/height values and no responsive layout primitives in the sampled source. ` +
          "A layout built from fixed pixels is correct on the device it was written on and wrong on a small phone, " +
          "a tablet and any device with display zoom enabled.",
    { nonePass: hardcodedDims < 10 },
  );

  const safeArea = /SafeArea|useSafeAreaInsets|SafeAreaView|viewPadding/i.test(ctx.source);
  add(
    "xp_safe_area",
    "Layouts respect the device safe area",
    safeArea ? "PASS" : "WARN",
    safeArea
      ? "The UI uses safe-area insets, so content clears the notch, dynamic island and home indicator."
      : "No safe-area handling was found in the sampled source. Content then renders under the status bar and the " +
        "home indicator on most current devices — the single most visible sign of an app that was not tested on " +
        "modern hardware.",
    { absence: true },
  );

  const listVirtualised = isFlutter
    ? /ListView\.builder|SliverList|GridView\.builder/.test(ctx.source)
    : /FlatList|SectionList|FlashList|VirtualizedList/.test(ctx.source);
  const listNaive = isFlutter
    ? /ListView\(\s*children:|Column\(\s*children:\s*\[?\s*\.\.\./.test(ctx.source)
    : /\.map\([^)]*=>\s*<(View|Text|TouchableOpacity)/.test(ctx.source);
  add(
    "xp_list_virtualisation",
    "Long lists are virtualised",
    !listNaive ? "PASS" : listVirtualised ? "PASS" : "WARN",
    !listNaive
      ? "No unvirtualised list rendering was found."
      : listVirtualised
        ? "Lists use the framework's virtualised builders where it matters."
        : "Lists are rendered by mapping an array straight into views, with no virtualised list component in the " +
          "sampled source. Every row is built and held in memory whether or not it is on screen, so the app is " +
          "fine with test data and unusable once a real account has a few hundred items.",
    { nonePass: !listNaive },
  );

  const imageCache = isFlutter
    ? /CachedNetworkImage|cacheWidth|precacheImage/i.test(ctx.source)
    : /FastImage|expo-image|prefetch\(/i.test(ctx.source);
  const remoteImages = /Image\.network|source=\{\{\s*uri:|<Image[^>]*uri/i.test(ctx.source);
  add(
    "xp_image_caching",
    "Remote images are cached rather than refetched",
    !remoteImages ? "SKIPPED" : imageCache ? "PASS" : "WARN",
    !remoteImages
      ? "The sampled source loads no remote images."
      : imageCache
        ? "Remote images go through a caching image component."
        : "Remote images are loaded with the framework's default image widget and no caching layer. Each scroll " +
          "back up the list refetches them, which is slow on a good connection and expensive on a metered one.",
    { absence: true },
  );

  const errorBoundary = isFlutter
    ? /FlutterError\.onError|runZonedGuarded|ErrorWidget\.builder/.test(ctx.source)
    : /ErrorBoundary|componentDidCatch|ErrorUtils\.setGlobalHandler|setJSExceptionHandler/.test(ctx.source);
  add(
    "xp_error_boundary",
    "The UI tree has a top-level error boundary",
    errorBoundary ? "PASS" : "WARN",
    errorBoundary
      ? "A global error handler or error boundary is installed, so a render failure is caught and reported."
      : "No top-level error boundary or global error handler was found. An exception thrown during render then " +
        "takes down the whole UI tree — the user sees a blank screen or a crash rather than a recoverable error, " +
        "and without a global handler it may never be reported.",
    { absence: true },
  );

  const assertions = isFlutter
    ? /\bassert\(/.test(ctx.source)
    : /__DEV__|console\.assert/.test(ctx.source);
  // __DEV__ in any condition is a guard: `if (IS_TEST || __DEV__)` and `__DEV__ && …`
  // are as stripped from release as `if (__DEV__)` (rainbow uses the first form).
  const guarded = isFlutter
    ? true
    : /\bif\s*\([^)]*\b__DEV__\b|\b__DEV__\s*(?:&&|\?|\|\|)|(?:&&|\|\|)\s*__DEV__\b|typeof\s+__DEV__/.test(ctx.source);
  add(
    "xp_release_assertions",
    "Debug-only assertions do not run in release",
    !assertions ? "SKIPPED" : guarded ? "PASS" : "WARN",
    !assertions
      ? "No debug assertions were found in the sampled source."
      : guarded
        ? isFlutter
          ? "Dart's `assert` is stripped from release builds by the compiler, so these carry no runtime cost."
          : "Development-only code is guarded by __DEV__, so it is stripped from the release bundle."
        : "Development-only code was found without a __DEV__ guard, so it ships to users — as a runtime cost at " +
          "best, and as a visible debug affordance at worst.",
  );

  const localeFormatting = /Intl\.|NumberFormat|DateFormat|toLocaleDateString|toLocaleString|intl\.|i18n\.(?:date|number)\(/i.test(
    ctx.source,
  );
  // Only date/clock-component arithmetic counts. `.split('/')` is far more often URL / AT-URI parsing and a bare
  // `padStart(2, '0')` is usually a mm:ss duration — neither is a locale defect. A zero-padded local getHours() is a
  // hand-built 24h clock and still counts.
  // `getMonth() + 1` only counts where it is being FORMATTED: inside a template
  // literal, or concatenated with a / - . separator. As an object-literal value
  // (`month: date.getMonth() + 1,` — rainbow builds a date-picker model) it is just
  // the month number.
  const manualFormatting =
    /\$\{[^}]*\.get(?:UTC)?Month\(\)\s*\+\s*1[^}]*\}|\.get(?:UTC)?Month\(\)\s*\+\s*1\)?\s*\+\s*['"`][\/.-]|['"`][\/.-]['"`]\s*\+\s*\(?[\w.]*\.get(?:UTC)?Month\(\)\s*\+\s*1|\.get(?:(?:UTC)?(?:Date|Month)|Hours)\(\)\)?\s*\.(?:toString\(\)\s*\.)?padStart\(/.test(
      ctx.source,
    );
  add(
    "xp_locale_formatting",
    "Dates and numbers are formatted by locale",
    localeFormatting ? "PASS" : manualFormatting ? "WARN" : "SKIPPED",
    localeFormatting
      ? "Dates and numbers are formatted through locale-aware APIs."
      : manualFormatting
        ? "Dates are assembled by hand from their components rather than formatted by locale, so every user sees " +
          "the same hard-coded date order whatever their locale — the kind of defect that reads as carelessness " +
          "rather than as a bug."
        : "No date or number formatting was found in the sampled source.",
    // "No locale API anywhere" is an absence claim on a sample.
    { absence: true },
  );

  return checks;
}

type AddFn = (
  checkKey: string,
  label: string,
  status: PulseScanCheckInput["status"],
  detail: string,
  opts?: { absence?: boolean; nonePass?: boolean },
) => void;

/**
 * Runtime-permission categories, paired across the two platforms. Comparing raw
 * counts was meaningless: Android lists NORMAL permissions (INTERNET, VIBRATE,
 * ACCESS_NETWORK_STATE…) that have no iOS counterpart at all, so every real app
 * looked "unbalanced" — mattermost and rainbow both WARNed at HIGH while asking for
 * exactly the same things on each side. Only a category requested on ONE side is a
 * finding. Unmapped permissions on either side are ignored, not counted.
 */
const PERMISSION_CATEGORIES: { name: string; android: RegExp; ios: RegExp }[] = [
  { name: "camera", android: /^CAMERA$/, ios: /^NSCameraUsageDescription$/ },
  { name: "microphone", android: /^RECORD_AUDIO$/, ios: /^NSMicrophoneUsageDescription$/ },
  { name: "location", android: /^ACCESS_(?:FINE|COARSE|BACKGROUND)_LOCATION$/, ios: /^NSLocation\w*UsageDescription$/ },
  { name: "contacts", android: /^(?:READ|WRITE)_CONTACTS$/, ios: /^NSContactsUsageDescription$/ },
  { name: "calendar", android: /^(?:READ|WRITE)_CALENDAR$/, ios: /^NSCalendars\w*UsageDescription$/ },
  {
    name: "photo library",
    android: /^(?:READ_MEDIA_(?:IMAGES|VIDEO|VISUAL_USER_SELECTED)|(?:READ|WRITE)_EXTERNAL_STORAGE)$/,
    ios: /^NSPhotoLibrary\w*UsageDescription$/,
  },
  { name: "Bluetooth", android: /^BLUETOOTH_(?:CONNECT|SCAN)$/, ios: /^NSBluetooth(?:Always|Peripheral)UsageDescription$/ },
];

/** `android.permission.X` names a manifest requests — minus ones it removes (`tools:node="remove"`). */
export function manifestPermissions(manifest: string): string[] {
  const out = new Set<string>();
  for (const m of manifest.matchAll(/<uses-permission(?:-sdk-\d+)?\b[^>]*>/g)) {
    if (/tools:node\s*=\s*"remove"/.test(m[0])) continue;
    const name = /android:name\s*=\s*"(?:android\.permission\.)?([\w.]+)"/.exec(m[0])?.[1];
    if (name) out.add(name);
  }
  return [...out];
}

function rnPermissionParity(shell: RnAppShell, expo: ExpoNativeConfig, add: AddFn): void {
  const key = "xp_platform_parity_permissions";
  const label = "iOS and Android request a consistent permission set";
  const android = shell.hasAndroid && shell.androidManifest
    ? manifestPermissions(shell.androidManifest)
    : !shell.hasAndroid ? expo.androidPermissions : null;
  const ios = shell.hasIos && shell.iosPlist
    ? [...new Set(shell.iosPlist.match(/\bNS\w+UsageDescription\b/g) ?? [])]
    : !shell.hasIos && expo.iosUsageDescriptions.length > 0 ? expo.iosUsageDescriptions : null;

  if (android === null || ios === null) {
    const missing = android === null ? "Android" : "iOS";
    add(
      key,
      label,
      "SKIPPED",
      (missing === "Android" ? !shell.hasAndroid : !shell.hasIos) && expo.present
        ? `This app has no committed ${missing} project and its Expo config does not list ${missing}'s permissions — ` +
          `Expo generates them at prebuild from the installed modules — so there is no ${missing} set in the ` +
          "repository to compare against."
        : `${missing}'s permission declarations could not be read, so parity could not be compared.`,
    );
    return;
  }
  const androidCats = PERMISSION_CATEGORIES.filter((c) => android.some((p) => c.android.test(p))).map((c) => c.name);
  const iosCats = PERMISSION_CATEGORIES.filter((c) => ios.some((k) => c.ios.test(k))).map((c) => c.name);
  const androidOnly = androidCats.filter((c) => !iosCats.includes(c));
  const iosOnly = iosCats.filter((c) => !androidCats.includes(c));
  add(
    key,
    label,
    androidOnly.length || iosOnly.length ? "WARN" : "PASS",
    androidOnly.length || iosOnly.length
      ? [
          androidOnly.length
            ? `Android requests ${androidOnly.join(", ")} but iOS has no matching usage description. If the shared ` +
              "code path asks for it on iOS, the app is terminated on the spot — and App Review rejects a build that " +
              "requests a protected resource without one."
            : "",
          iosOnly.length
            ? `iOS declares a usage description for ${iosOnly.join(", ")} but Android does not request it, so that ` +
              "feature cannot work on Android (or the iOS description is a leftover that App Review will ask about)."
            : "",
        ].filter(Boolean).join(" ")
      : androidCats.length
        ? `Both platforms declare the same runtime-permission categories (${androidCats.join(", ")}).`
        : "Neither platform requests a runtime permission that the other lacks.",
  );
}

function rnDeepLinkParity(shell: RnAppShell, expo: ExpoNativeConfig, add: AddFn): void {
  const key = "xp_deep_link_both_platforms";
  const label = "Deep links are configured on both platforms";
  // A committed shell is what ships; without one (Expo CNG) the config generates it.
  // Expo's top-level `scheme` registers on BOTH platforms.
  const iosKnown = shell.hasIos ? shell.iosPlist.length > 0 : expo.present;
  const androidKnown = shell.hasAndroid ? shell.androidManifest.length > 0 : expo.present;
  if (!iosKnown || !androidKnown) {
    add(key, label, "SKIPPED", "Only one platform's link configuration could be read.");
    return;
  }
  const iosLinks = shell.hasIos
    ? /CFBundleURLSchemes/.test(shell.iosPlist) || /associated-domains/.test(shell.iosEntitlements)
    : expo.scheme || expo.associatedDomains;
  // An intent-filter is not a deep link — every app has the MAIN/LAUNCHER one. A
  // deep link is an intent-filter with a <data android:scheme>, or a verified one.
  const androidLinks = shell.hasAndroid
    ? /<data\b[^>]*android:scheme/.test(shell.androidManifest) || /android:autoVerify\s*=\s*"true"/.test(shell.androidManifest)
    : expo.scheme || expo.intentFilters;
  add(
    key,
    label,
    iosLinks === androidLinks ? "PASS" : "WARN",
    iosLinks === androidLinks
      ? iosLinks
        ? `Deep linking is configured on both platforms${shell.hasIos || shell.hasAndroid ? "" : " (in the Expo config)"}.`
        : "Neither platform configures deep links, which is consistent."
      : `Deep links are configured on ${iosLinks ? "iOS but not Android" : "Android but not iOS"}. Any link you ` +
        "send by email or push opens the app for half your users and the website for the other half.",
  );
}
