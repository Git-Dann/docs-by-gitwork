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
  coverage: number;
  paths: string[];
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
  let sampled = 0;
  const ext = runtime === "flutter" ? /\.dart$/i : /\.(ts|tsx|js|jsx)$/i;

  for (const [path, text] of snapshot.files) {
    if (ext.test(path)) {
      src.push(text);
      sampled++;
    } else if (/pubspec\.ya?ml$/i.test(path)) manifests.push(text);
    else if (/(^|\/)package\.json$/i.test(path) && !packageJson) packageJson = text;
    else if (/Info\.plist$/i.test(path)) plist.push(text);
    else if (/AndroidManifest\.xml$/i.test(path)) androidManifest.push(text);
  }

  const total = snapshot.paths.filter((p) => ext.test(p)).length;
  return {
    runtime,
    source: stripBridgeComments(src.join("\n")),
    sampled,
    total,
    manifests: manifests.join("\n"),
    packageJson,
    iosPlist: plist.join("\n"),
    androidManifest: androidManifest.join("\n"),
    coverage: total === 0 ? 0 : sampled / total,
    paths: snapshot.paths,
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
    opts: { absence?: boolean } = {},
  ) => {
    const weak = opts.absence === true && !soundAbsence && status !== "PASS";
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey,
      label,
      status,
      confidence: weak ? "LOW" : "HIGH",
      ...(weak
        ? {
            confidenceReason:
              `Only ${ctx.sampled} of ${ctx.total} source files were read, so the absence of this pattern is not ` +
              "established.",
          }
        : {}),
      detail,
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

  const all = ctx.source + ctx.packageJson + ctx.manifests;

  // ── Over-the-air updates ───────────────────────────────────────────────────
  const usesOta = /codepush|code-push|expo-updates|shorebird|EXUpdates|app_center/i.test(all);
  const otaSigned = /publicKey|code_signing|codeSigningCertificate|expo-updates.*codeSigning|signingKey/i.test(all);
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
    : /eval\(|new Function\(|globalEval|Function\(['"`]return/.test(ctx.source);
  add(
    "xp_bridge_eval",
    "The JS/Dart bridge does not evaluate remote code",
    bridgeEval ? "FAIL" : "PASS",
    bridgeEval
      ? "The app evaluates code at runtime. In a cross-platform app the bridge already has access to native modules, " +
        "so any string that reaches an evaluator runs with the app's full device permissions — camera, location, " +
        "storage and the token store."
      : "No runtime code evaluation was found in the sampled source.",
    { absence: true },
  );

  // ── Platform parity — the failure mode unique to cross-platform ────────────
  const iosPerms = (ctx.iosPlist.match(/NS\w+UsageDescription/g) ?? []).length;
  const androidPerms = (ctx.androidManifest.match(/uses-permission/g) ?? []).length;
  const bothPresent = ctx.iosPlist.length > 0 && ctx.androidManifest.length > 0;
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

  const iosLinks = /associated-domains|CFBundleURLSchemes/.test(ctx.iosPlist);
  const androidLinks = /android:autoVerify|intent-filter/.test(ctx.androidManifest);
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

  // ── Quality signals ────────────────────────────────────────────────────────
  const nativeModules = ctx.paths.filter((p) => /(^|\/)(ios|android)\/.*\.(swift|m|mm|kt|java)$/i.test(p)).length;
  add(
    "xp_native_module_count",
    "Native module usage is proportionate to the codebase",
    nativeModules <= 25 ? "PASS" : "WARN",
    nativeModules <= 25
      ? `${nativeModules} platform-native source files — the shared codebase is doing the work, which is the point ` +
        "of a cross-platform framework."
      : `${nativeModules} platform-native source files sit alongside the shared code. Past a certain amount of ` +
        "native glue the project carries the cost of three codebases rather than one, and every feature needs a " +
        "developer who can write all three.",
  );

  const oldDeps = isFlutter
    ? /flutter:\s*"?[<^]?1\.|sdk:\s*">=2\.[0-9]\./.test(ctx.manifests)
    : /"react-native":\s*"[^"]*0\.(6[0-9]|7[0-3])\./.test(ctx.packageJson);
  add(
    "xp_dependency_maintenance",
    "Cross-platform dependencies are actively maintained",
    oldDeps ? "WARN" : "PASS",
    oldDeps
      ? "The project pins a framework version that is several releases behind. Cross-platform frameworks move fast " +
        "and each store SDK bump forces an upgrade eventually — the longer the gap, the more breaking changes have " +
        "to be absorbed at once, usually under deadline when a store rejects a build."
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
    : /ErrorBoundary|componentDidCatch|ErrorUtils\.setGlobalHandler/.test(ctx.source);
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
  const guarded = isFlutter ? true : /if\s*\(\s*__DEV__\s*\)/.test(ctx.source);
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

  const localeFormatting = /Intl\.|NumberFormat|DateFormat|toLocaleDateString|toLocaleString|intl\./i.test(ctx.source);
  const manualFormatting = /\.split\(['"]\/['"]\)|\.getMonth\(\)\s*\+\s*1|padStart\(2, ?['"]0['"]\)/.test(ctx.source);
  add(
    "xp_locale_formatting",
    "Dates and numbers are formatted by locale",
    localeFormatting ? "PASS" : manualFormatting ? "WARN" : "SKIPPED",
    localeFormatting
      ? "Dates and numbers are formatted through locale-aware APIs."
      : manualFormatting
        ? "Dates are assembled by hand from their components rather than formatted by locale. That produces a " +
          "US-ordered date for every user, and a decimal separator that is wrong across most of Europe — the kind " +
          "of defect that reads as carelessness rather than as a bug."
        : "No date or number formatting was found in the sampled source.",
  );

  return checks;
}
