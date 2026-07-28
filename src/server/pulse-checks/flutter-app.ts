// ─────────────────────────────────────────────────────────────────────────────
// FLUTTER APP CHECK FAMILY — production readiness for a Dart/Flutter repo.
//
// Built from a hand review of a real client app (Fellas Android, 1,113 Dart files
// / 90,681 LOC, live on Google Play). Two of its findings are the reason this
// family exists at all, because both are invisible to every generic repo check and
// both recurred across three separate Fellas codebases:
//
//   1. The API host is selected by COMMENTING OUT lines in a Dart constants file.
//      The branch that ships had production commented out and staging active.
//   2. Auth tokens sit in SharedPreferences while flutter_secure_storage is present
//      in the same repo — used for the user's PASSWORD instead. The same inversion
//      appears in the native iOS app (Keychain holding the password, tokens in
//      UserDefaults), which is what makes it a house pattern worth a check.
//
// Same evidence model as ios-app.ts: config files are always read, Dart sources are
// sampled and relevance-ranked, and ABSENCE findings drop to LOW confidence (and so
// out of the score) when coverage is thin. See ios-app.ts for the full rationale.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import { isVendoredPath, stripCStyleComments, type RepoSnapshot } from "./native-mobile";

const SOUND_ABSENCE_COVERAGE = 0.3;
const INCONCLUSIVE_NOTE =
  " (Based on a partial source sample, so this result is inconclusive and is not counted toward the score.)";

/**
 * Google Play's minimum target API for app updates. 35 since 31 Aug 2025; an upload
 * below the floor is rejected outright, so this is a shipping gate, not advice.
 */
const PLAY_TARGET_SDK_FLOOR = 35;
/** Flutter minor versions behind current before the pin is called stale. */
const FLUTTER_STALE_MINOR = 6;
/** Roughly-current Flutter minor at time of writing; only used for a distance heuristic. */
const FLUTTER_CURRENT_MINOR = 32;

interface FlutterContext {
  snapshot: RepoSnapshot;
  /** Sampled Dart with comments stripped — use for CODE patterns. */
  dart: string;
  /** Sampled Dart verbatim — for signals that live IN comments (commented-out code, TODOs). */
  dartRaw: string;
  pubspec: string;
  pubspecLock: string;
  analysisOptions: string;
  androidManifest: string;
  buildGradle: string;
  fvm: string;
  dartTotal: number;
  dartRead: number;
  coverage: number;
}

function buildContext(snapshot: RepoSnapshot): FlutterContext {
  const isDart = (p: string) => /\.dart$/i.test(p) && !isVendoredPath(p);
  const dartTotal = snapshot.paths.filter(isDart).length;
  const read: string[] = [];
  let pubspec = "";
  let pubspecLock = "";
  let analysisOptions = "";
  let androidManifest = "";
  let buildGradle = "";
  let fvm = "";

  for (const [path, text] of snapshot.files) {
    if (isDart(path)) read.push(text);
    else if (/(^|\/)pubspec\.lock$/i.test(path)) pubspecLock += `\n${text}`;
    else if (/(^|\/)pubspec\.ya?ml$/i.test(path)) pubspec += `\n${text}`;
    else if (/(^|\/)analysis_options\.ya?ml$/i.test(path)) analysisOptions += `\n${text}`;
    else if (/(^|\/)AndroidManifest\.xml$/i.test(path)) androidManifest += `\n${text}`;
    else if (/(^|\/)build\.gradle(\.kts)?$/i.test(path)) buildGradle += `\n${text}`;
    else if (/(fvm_config\.json|\.fvmrc)$/i.test(path)) fvm += `\n${text}`;
  }

  const dartRaw = read.join("\n");
  return {
    snapshot,
    dart: stripCStyleComments(dartRaw),
    dartRaw,
    pubspec,
    pubspecLock,
    analysisOptions,
    androidManifest,
    buildGradle,
    fvm,
    dartTotal,
    dartRead: read.length,
    coverage: dartTotal === 0 ? 0 : read.length / dartTotal,
  };
}

function countMatches(haystack: string, re: RegExp): number {
  const m = haystack.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`));
  return m ? m.length : 0;
}

function absence(ctx: FlutterContext, check: PulseScanCheckInput): PulseScanCheckInput {
  if (check.status === "PASS" || ctx.coverage >= SOUND_ABSENCE_COVERAGE) return check;
  return {
    ...check,
    detail: `${check.detail ?? ""}${INCONCLUSIVE_NOTE}`,
    confidence: "LOW",
    confidenceReason: `Read ${ctx.dartRead} of ${ctx.dartTotal} Dart files — not enough to prove an absence.`,
  };
}

/** Dependencies declared under `dependencies:` (not dev_dependencies). */
function productionDependencies(pubspec: string): string[] {
  const start = pubspec.search(/^dependencies:\s*$/m);
  if (start === -1) return [];
  const rest = pubspec.slice(start);
  const end = rest.search(/^(dev_dependencies|dependency_overrides|flutter):\s*$/m);
  const block = end === -1 ? rest : rest.slice(0, end);
  return Array.from(block.matchAll(/^ {2}([a-z0-9_]+):/gim)).map((m) => m[1]);
}

// ─────────────────────────────────────────────────────────────────────────────

export function evaluateFlutterChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const ctx = buildContext(snapshot);
  return [
    ...environmentChecks(ctx),
    ...credentialChecks(ctx),
    ...releaseChecks(ctx),
    ...performanceChecks(ctx),
    ...qualityChecks(ctx),
  ];
}

// ── Environment & transport ─────────────────────────────────────────────────

function environmentChecks(ctx: FlutterContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const C = CATEGORIES.SECURITY;

  // THE headline check. Look for a baseUrl-ish const whose value is a non-production
  // host, and for the tell-tale stack of commented-out alternatives beside it.
  const baseUrlDecl = /^\s*(?:const|final|static\s+const)\s+String\s+\w*[bB]aseU\w*\s*=\s*'([^']+)'/m.exec(ctx.dart);
  const activeHost = baseUrlDecl?.[1] ?? null;
  const commentedAlternatives = countMatches(
    ctx.dartRaw,
    /^\s*\/\/\s*(?:const|final|static\s+const)\s+String\s+\w*[bB]aseU\w*\s*=/m,
  );
  const NON_PROD = /(staging|\.test\.|test\.|dev\.|\.local|localhost|127\.0\.0\.1|ngrok|preprod|uat|sandbox)/i;
  const activeIsNonProd = activeHost !== null && NON_PROD.test(activeHost);
  const switchedByComment = commentedAlternatives > 0;

  checks.push({
    category: C,
    checkKey: "flutter_env_baseurl",
    label: "API environment is not selected by editing source",
    status: activeHost === null ? "SKIPPED" : activeIsNonProd ? "FAIL" : switchedByComment ? "WARN" : "PASS",
    detail:
      activeHost === null
        ? "No baseUrl constant found in the sampled Dart source."
        : activeIsNonProd
          ? `The active API base URL is a NON-PRODUCTION host: \`${activeHost}\`${switchedByComment ? `, with ${commentedAlternatives} alternative host${commentedAlternatives !== 1 ? "s" : ""} commented out beside it` : ""}. If a release was built from this state the app is talking to staging. Selecting the environment by editing a source line makes every release depend on someone remembering to swap it back — use --dart-define or Flutter flavors so the environment is a build input, not a code edit.`
          : switchedByComment
            ? `The API base URL points at production (\`${activeHost}\`), but ${commentedAlternatives} alternative host${commentedAlternatives !== 1 ? "s are" : " is"} commented out beside it — so the environment is chosen by editing source. That works until someone forgets to swap it back before a release. Move it to --dart-define or a flavor.`
            : `API base URL is a single production value (\`${activeHost}\`) with no commented-out alternatives.`,
    evidence: activeIsNonProd ? `Active baseUrl: ${activeHost}` : undefined,
  });

  // Cleartext HTTP, the Android counterpart of iOS's NSAllowsArbitraryLoads.
  const hasManifest = ctx.androidManifest.length > 0;
  const cleartext = /android:usesCleartextTraffic\s*=\s*"true"/i.test(ctx.androidManifest);
  const networkConfig = /android:networkSecurityConfig/i.test(ctx.androidManifest);
  checks.push({
    category: C,
    checkKey: "flutter_cleartext_traffic",
    label: "Cleartext HTTP disabled on Android",
    status: !hasManifest ? "SKIPPED" : cleartext ? "FAIL" : "PASS",
    detail: !hasManifest
      ? "No AndroidManifest.xml could be read."
      : cleartext
        ? `\`android:usesCleartextTraffic="true"\` permits plaintext HTTP app-wide, so any request can be downgraded and read on a hostile network.${networkConfig ? " A networkSecurityConfig is also present — scope the exception there and drop the blanket flag." : " Remove it, or scope a single host with a networkSecurityConfig."} Worth checking against the iOS side, which usually has ATS enforced — the two drifting apart is the common case.`
        : "Cleartext HTTP is not enabled app-wide.",
  });

  // Logging that is not compile-excluded from release.
  const logCalls = countMatches(ctx.dart, /(?:^|[^\w.])(?:print|debugPrint)\s*\(/);
  const devLogCalls = countMatches(ctx.dart, /(?:^|[^\w.])log\s*\(/);
  const debugGuards = countMatches(ctx.dart, /kDebugMode|kReleaseMode|kProfileMode/);
  const unguarded = logCalls + devLogCalls > 10 && debugGuards === 0;
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "flutter_release_logging",
      label: "Logging excluded from release builds",
      status: unguarded ? "FAIL" : devLogCalls > 0 && debugGuards > 0 ? "WARN" : "PASS",
      detail: unguarded
        ? `${logCalls + devLogCalls} logging call sites and no kDebugMode/kReleaseMode guard anywhere. \`print\` is stripped in release by the Dart compiler only when tree-shaken away — \`dart:developer\`'s \`log()\` is not, and neither writes nothing on a real device. Wrap diagnostics in \`if (kDebugMode)\`.`
        : devLogCalls > 0 && debugGuards > 0
          ? `${debugGuards} build-mode guard${debugGuards !== 1 ? "s" : ""} present, but ${devLogCalls} \`dart:developer\` \`log()\` call${devLogCalls !== 1 ? "s are" : " is"} also used. Unlike \`print\`, \`log()\` is NOT removed in release — check none of them carry auth state or user data.`
          : "Logging is either absent or gated on a build-mode flag.",
    }),
  );

  // Development endpoints left in shipped source.
  const devEndpoints: string[] = [];
  if (/ngrok(-free)?\.(app|io)/i.test(ctx.dartRaw)) devEndpoints.push("an ngrok tunnel URL");
  if (/https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)/i.test(ctx.dartRaw)) devEndpoints.push("a localhost endpoint");
  checks.push({
    category: C,
    checkKey: "flutter_dev_endpoints",
    label: "No development endpoints in shipped source",
    status: ctx.dartRaw === "" ? "SKIPPED" : devEndpoints.length > 0 ? "WARN" : "PASS",
    detail:
      ctx.dartRaw === ""
        ? "No Dart source could be read."
        : devEndpoints.length > 0
          ? `Development endpoints present in source: ${devEndpoints.join("; ")}. Even commented out these are worth removing — they document the team's internal hosts to anyone who unpacks the app, and they are exactly what gets uncommented by accident.`
          : "No ngrok or localhost endpoints found in the sampled source.",
  });

  return checks;
}

// ── Credential storage ──────────────────────────────────────────────────────

function credentialChecks(ctx: FlutterContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const C = CATEGORIES.SECRETS_KEYS;

  const hasSecureStorage =
    /flutter_secure_storage|FlutterSecureStorage/.test(ctx.dart) || /flutter_secure_storage/.test(ctx.pubspec);
  const tokenInPrefs =
    /(?:sharedPreferences|prefs|_prefs)\s*\.\s*(?:get|set)String\s*\(\s*'[^']*(?:access|refresh|auth|id)[Tt]oken/i.test(ctx.dart) ||
    /SharedPreferences[\s\S]{0,200}?(accessToken|refreshToken|authToken)/i.test(ctx.dart);

  checks.push({
    category: C,
    checkKey: "flutter_token_storage",
    label: "Auth tokens stored in secure storage",
    status: tokenInPrefs ? "FAIL" : hasSecureStorage ? "PASS" : "WARN",
    detail: tokenInPrefs
      ? `Auth token keys are read from or written to SharedPreferences. On Android that is a plaintext XML file in app-private storage — readable on a rooted device and via ADB backup where allowed; on iOS it is a plist in the app container, included in unencrypted backups.${hasSecureStorage ? " `flutter_secure_storage` is ALREADY a dependency in this project, so the secure store exists and the tokens simply were not moved into it — a migration that was started and left unfinished." : " Add `flutter_secure_storage` and keep session material there."}`
      : hasSecureStorage
        ? "flutter_secure_storage is in use and no token keys were found in SharedPreferences."
        : "No secure storage package and no token persistence located in the sampled source — confirm where the session token is kept.",
    evidence: tokenInPrefs ? "Token key accessed via SharedPreferences" : undefined,
  });

  // Retaining the password is never necessary, secure store or not.
  const passwordPersisted =
    /(?:write|setString|save)\s*\([^)]{0,120}(?:password|_kSavedPassword|remember_password)/i.test(ctx.dart) ||
    /(?:key\s*:\s*)?['"][\w.]*(?:saved|remember)[\w.]*password[\w.]*['"]/i.test(ctx.dart);
  checks.push({
    category: C,
    checkKey: "flutter_password_retention",
    label: "User password is not persisted on device",
    status: passwordPersisted ? "FAIL" : "PASS",
    detail: passwordPersisted
      ? "The user's password appears to be written to on-device storage, typically for a \"remember me\" feature. Secure storage is the right place for secrets, but a password never needs to be retained at all: keep a refresh token and re-authenticate with that. Retaining it widens the blast radius of any device compromise to the user's actual credential, which is very often reused elsewhere."
      : "No on-device password persistence detected.",
    evidence: passwordPersisted ? "Password written to on-device storage" : undefined,
  });

  // Firebase config committed — not a leak, but the key wants restricting.
  const firebaseConfigCommitted = ctx.snapshot.paths.some(
    (p) => /(^|\/)(google-services\.json|GoogleService-Info\.plist)$/i.test(p) && !isVendoredPath(p),
  );
  checks.push({
    category: C,
    checkKey: "flutter_firebase_config_committed",
    label: "Firebase config keys are restricted",
    status: firebaseConfigCommitted ? "WARN" : "PASS",
    detail: firebaseConfigCommitted
      ? "A Firebase config file (google-services.json / GoogleService-Info.plist) is committed. This is NOT a leak — Google ships these in every app binary and treats them as public identifiers, so rotating achieves nothing. The action is confirming in the Google Cloud console that the API key is restricted to this app's package/bundle id and to the APIs it actually needs; an unrestricted key is callable by anyone who unpacks the app."
      : "No Firebase config files committed.",
  });

  return checks;
}

// ── Release / store readiness ───────────────────────────────────────────────

function releaseChecks(ctx: FlutterContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const C = CATEGORIES.APP_STORE;
  const hasGradle = ctx.buildGradle.length > 0;

  // Play's target-API floor is a hard upload gate.
  const targetMatch = /targetSdk(?:Version)?\s*[= ]\s*(\d+)/.exec(ctx.buildGradle);
  const target = targetMatch ? Number(targetMatch[1]) : null;
  const inheritsFromFlutter = /targetSdk(?:Version)?\s+flutter\.targetSdkVersion/.test(ctx.buildGradle);
  checks.push({
    category: C,
    checkKey: "flutter_target_sdk",
    label: "Android targetSdk meets Play's floor",
    status: !hasGradle
      ? "SKIPPED"
      : target === null
        ? inheritsFromFlutter ? "WARN" : "SKIPPED"
        : target >= PLAY_TARGET_SDK_FLOOR ? "PASS" : "FAIL",
    detail: !hasGradle
      ? "No build.gradle could be read."
      : target === null
        ? inheritsFromFlutter
          ? `targetSdk is inherited from the pinned Flutter SDK (\`flutter.targetSdkVersion\`) rather than declared, so it cannot be read from source. Google Play requires targetSdk ${PLAY_TARGET_SDK_FLOOR}+ for updates and rejects anything lower — verify the resolved value with a real build, because an old Flutter pin silently puts you under the floor.`
          : "No targetSdk declaration found."
        : target >= PLAY_TARGET_SDK_FLOOR
          ? `targetSdk ${target} meets Google Play's current floor of ${PLAY_TARGET_SDK_FLOOR}.`
          : `targetSdk ${target} is below Google Play's floor of ${PLAY_TARGET_SDK_FLOOR}. Play REJECTS app updates below the floor, so no release can be shipped until this rises — which for a Flutter app usually means upgrading the Flutter SDK first.`,
  });

  // Flutter SDK currency, from an FVM pin or the environment constraint.
  const pinned = /"flutterSdkVersion"\s*:\s*"(\d+)\.(\d+)/.exec(ctx.fvm) ?? /^\s*(\d+)\.(\d+)\.\d+\s*$/m.exec(ctx.fvm);
  const minor = pinned ? Number(pinned[2]) : null;
  const behind = minor === null ? null : FLUTTER_CURRENT_MINOR - minor;
  checks.push({
    category: C,
    checkKey: "flutter_sdk_currency",
    label: "Flutter SDK pin is current",
    status: minor === null ? "SKIPPED" : behind !== null && behind >= FLUTTER_STALE_MINOR ? "WARN" : "PASS",
    detail:
      minor === null
        ? "No pinned Flutter SDK version found (no FVM config)."
        : behind !== null && behind >= FLUTTER_STALE_MINOR
          ? `Flutter is pinned to 3.${minor}.x, roughly ${behind} minor releases behind. An old pin caps the Android targetSdk the toolchain will produce, which is how a project ends up unable to upload to Play, and leaves engine-level security fixes unapplied.`
          : `Flutter pinned to 3.${minor}.x — reasonably current.`,
  });

  // R8 / resource shrinking on release.
  const shrinks = /minifyEnabled\s+true|isMinifyEnabled\s*=\s*true|shrinkResources\s+true/i.test(ctx.buildGradle);
  checks.push({
    category: C,
    checkKey: "flutter_release_shrinking",
    label: "Release build shrinks code and resources",
    status: !hasGradle ? "SKIPPED" : shrinks ? "PASS" : "WARN",
    detail: !hasGradle
      ? "No build.gradle could be read."
      : shrinks
        ? "Release builds enable R8 minification and/or resource shrinking."
        : "The release build type sets neither `minifyEnabled true` nor `shrinkResources true`. Dart is AOT-compiled so the Dart side is unaffected, but the Java/Kotlin layer and unused resources ship at full size — a straightforward download-size win, and it strips plugin class names from the artefact.",
  });

  return checks;
}

// ── Performance, caching & metered networks ─────────────────────────────────
//
// This group exists because a client reported the app was slow on low data. On
// Flutter the usual causes are: no HTTP response cache, no image cache, progressive
// video instead of HLS, and no adaptation to a metered connection.

function performanceChecks(ctx: FlutterContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const C = CATEGORIES.PERFORMANCE;

  const cacheInterceptor = /dio_cache|DioCacheInterceptor|CacheOptions|CacheInterceptor|HiveCacheStore/i.test(
    `${ctx.dart}\n${ctx.pubspec}`,
  );
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "flutter_response_cache",
      label: "HTTP response caching configured",
      status: cacheInterceptor ? "PASS" : "WARN",
      detail: cacheInterceptor
        ? "An HTTP response cache is configured on the client."
        : "No HTTP response cache found. Without one, every screen refetches the same list and detail payloads on each visit — cheap on wifi, and the main reason an app feels slow on a weak or metered connection. `dio_cache_interceptor` with a disk store is the usual fix.",
    }),
  );

  const imageCache = /cached_network_image|CachedNetworkImage|flutter_cache_manager/i.test(
    `${ctx.dart}\n${ctx.pubspec}`,
  );
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "flutter_image_cache",
      label: "Image caching in place",
      status: imageCache ? "PASS" : "WARN",
      detail: imageCache
        ? "A caching image loader is in use, so images are not refetched on every appearance."
        : "No image caching detected. Flutter's `Image.network` caches only in memory, so scrolling back through a feed refetches full-size images — expensive on a metered connection. Use `cached_network_image`.",
    }),
  );

  const playsVideo = /video_player|VideoPlayerController|better_player|chewie|AVPlayer/i.test(
    `${ctx.dart}\n${ctx.pubspec}`,
  );
  const usesHls = /\.m3u8|hls_parser|HlsPlaylist/i.test(`${ctx.dart}\n${ctx.pubspec}`);
  const usesProgressive = /\.mp4/i.test(ctx.dart);
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "flutter_adaptive_streaming",
      label: "Video uses adaptive-bitrate streaming (HLS)",
      status: !playsVideo ? "SKIPPED" : usesHls ? "PASS" : usesProgressive ? "FAIL" : "WARN",
      detail: !playsVideo
        ? "No video playback detected."
        : usesHls
          ? "HLS playback detected — the player can adapt bitrate to available bandwidth."
          : usesProgressive
            ? "Video is played from progressive .mp4 URLs with no HLS manifest. A progressive file has ONE fixed bitrate, so on a weak or metered connection the player cannot step down — it just buffers. For a video-led app this is usually the single largest cause of \"slow on low data\"."
            : "Video playback detected but no media URLs found in the sampled source — confirm whether delivery is HLS.",
    }),
  );

  // Metered-connection handling, including the case where the guard was commented out.
  const checksConnectivity = /Connectivity\(\)|connectivity_plus|ConnectivityResult/i.test(ctx.dart);
  const guardsCellular = /ConnectivityResult\.mobile|isMobileData|allowMobileData|meteredConnection/i.test(ctx.dart);
  // Count commented-out guards independently of live ones. Reporting only
  // "commented AND no live guard" hid the real defect on a real app: the download
  // path's guard was commented out while an unrelated screen still had one, so the
  // check passed and the "used all my data" cause stayed invisible. Partial
  // disablement is its own state and deserves its own verdict.
  const commentedGuards = countMatches(
    ctx.dartRaw,
    /^\s*\/\/[^\n]*(ConnectivityResult\.mobile|isMobileData|MobileData)/im,
  );
  const status = commentedGuards > 0 && !guardsCellular
    ? "FAIL"
    : commentedGuards > 0
      ? "WARN"
      : guardsCellular
        ? "PASS"
        : "WARN";
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "flutter_metered_network",
      label: "Adapts to metered / cellular connections",
      status,
      detail:
        commentedGuards > 0 && !guardsCellular
          ? `A cellular/metered-data guard exists in the source but is COMMENTED OUT (${commentedGuards} line${commentedGuards !== 1 ? "s" : ""}), and no live guard remains — so the shipped app ignores the user's mobile-data setting entirely and downloads proceed on cellular regardless. This is the most direct cause of a "used all my data" or "slow on low data" complaint, and it is invisible to any check that only reads live code.`
          : commentedGuards > 0
            ? `Cellular/metered guards are present in some paths but COMMENTED OUT in others (${commentedGuards} commented line${commentedGuards !== 1 ? "s" : ""}). Metered-data handling is therefore partial: whichever path had its guard disabled — typically downloads — now transfers on cellular regardless of the user's setting, while other screens still respect it. Inconsistent is worse than either, because the setting appears to work.`
            : guardsCellular
              ? "Cellular/metered connections are detected and gated on before heavy transfers."
              : checksConnectivity
                ? "Connectivity is checked, but only for online/offline — nothing distinguishes a metered cellular link from wifi, so large downloads and high-bitrate playback proceed identically on both."
                : "No connectivity or metered-network handling detected. Large transfers will behave identically on wifi and cellular.",
      evidence: commentedGuards > 0 ? `${commentedGuards} cellular guard line(s) commented out` : undefined,
    }),
  );

  return checks;
}

// ── Quality & delivery ──────────────────────────────────────────────────────

function qualityChecks(ctx: FlutterContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const C = CATEGORIES.CODE_QUALITY;
  const paths = ctx.snapshot.paths;

  // Tests, measured against codebase size — one template file is not a test suite.
  const testFiles = paths.filter((p) => /^test\/.*_test\.dart$|_test\.dart$/i.test(p) && !isVendoredPath(p)).length;
  const onlyTemplate =
    testFiles <= 1 && paths.some((p) => /^test\/widget_test\.dart$/i.test(p));
  checks.push({
    category: C,
    checkKey: "flutter_test_coverage",
    label: "Test suite proportionate to the codebase",
    status: ctx.dartTotal === 0 ? "SKIPPED" : testFiles === 0 || onlyTemplate ? "FAIL" : testFiles < ctx.dartTotal / 50 ? "WARN" : "PASS",
    detail:
      ctx.dartTotal === 0
        ? "No Dart source found."
        : testFiles === 0
          ? `No test files against ${ctx.dartTotal} Dart files. Nothing verifies a change before it reaches the store.`
          : onlyTemplate
            ? `The only test file is Flutter's generated \`test/widget_test.dart\`, against ${ctx.dartTotal} Dart files — so there is effectively no test suite, and the one file present makes it look like there is.`
            : `${testFiles} test file${testFiles !== 1 ? "s" : ""} against ${ctx.dartTotal} Dart files.`,
  });

  // Lockfile.
  const hasLock = paths.some((p) => /(^|\/)pubspec\.lock$/i.test(p));
  checks.push({
    category: C,
    checkKey: "flutter_dependency_pinning",
    label: "Dependencies pinned (pubspec.lock committed)",
    status: ctx.pubspec === "" && !hasLock ? "SKIPPED" : hasLock ? "PASS" : "FAIL",
    detail:
      ctx.pubspec === "" && !hasLock
        ? "No pubspec found."
        : hasLock
          ? "pubspec.lock is committed, so builds resolve identical dependency versions."
          : "pubspec.lock is not committed. Two builds from the same commit can resolve different package versions, so a release is not reproducible and a bad upstream publish lands silently. Applications should always commit the lockfile.",
  });

  // Git dependencies tracking a moving branch.
  const gitRefs = Array.from(ctx.pubspec.matchAll(/ref:\s*([\w.\-/]+)/g)).map((m) => m[1]);
  const movingRefs = gitRefs.filter((r) => !/^[0-9a-f]{7,40}$/i.test(r) && !/^v?\d+\.\d+/.test(r));
  checks.push({
    category: C,
    checkKey: "flutter_unpinned_git_dep",
    label: "Git dependencies pinned to a commit",
    status: ctx.pubspec === "" ? "SKIPPED" : movingRefs.length > 0 ? "WARN" : "PASS",
    detail:
      ctx.pubspec === ""
        ? "No pubspec found."
        : movingRefs.length > 0
          ? `${movingRefs.length} git dependenc${movingRefs.length !== 1 ? "ies track" : "y tracks"} a moving branch rather than a commit or tag (${movingRefs.slice(0, 3).join(", ")}). pubspec.lock pins the resolved commit today, so builds are reproducible — but the next \`pub upgrade\` silently takes whatever that branch has become, from a repository you do not control.`
          : "No git dependencies, or all are pinned to a commit or tag.",
    evidence: movingRefs.length > 0 ? `ref: ${movingRefs.slice(0, 3).join(", ")}` : undefined,
  });

  // Test/mock libraries shipping in the production dependency set.
  const TEST_ONLY = ["faker", "mockito", "mocktail", "test", "flutter_test", "build_runner", "fake_async"];
  const prodDeps = productionDependencies(ctx.pubspec);
  const leaked = prodDeps.filter((d) => TEST_ONLY.includes(d));
  checks.push({
    category: C,
    checkKey: "flutter_dev_deps_in_prod",
    label: "No test-only packages in production dependencies",
    status: ctx.pubspec === "" ? "SKIPPED" : leaked.length > 0 ? "WARN" : "PASS",
    detail:
      ctx.pubspec === ""
        ? "No pubspec found."
        : leaked.length > 0
          ? `${leaked.length} test-only package${leaked.length !== 1 ? "s are" : " is"} declared under \`dependencies\` rather than \`dev_dependencies\`: ${leaked.join(", ")}. They are compiled into the shipped app, adding size and, in the case of fake-data generators, making it possible for placeholder content to reach a real screen.`
          : "No test-only packages in the production dependency set.",
  });

  // Dart analyzer configuration — the Dart equivalent of a linter config.
  const hasLints = /include:\s*package:(flutter_lints|lints|very_good_analysis)/i.test(ctx.analysisOptions);
  const hasRules = /^\s*rules:/m.test(ctx.analysisOptions);
  checks.push({
    category: C,
    checkKey: "flutter_analyzer_lints",
    label: "Dart analyzer lint set configured",
    status: ctx.analysisOptions === "" ? "FAIL" : hasLints || hasRules ? "PASS" : "WARN",
    detail:
      ctx.analysisOptions === ""
        ? "No analysis_options.yaml. The Dart analyzer runs with defaults only, so the lint rules that would catch unawaited futures, dead null-aware operators and unused imports are off."
        : hasLints || hasRules
          ? "analysis_options.yaml configures a lint set."
          : "analysis_options.yaml exists but includes no lint package and defines no rules, so it is not actually enforcing anything.",
  });

  // Screen-reader support.
  const semantics = countMatches(ctx.dart, /Semantics\s*\(|semanticsLabel\s*:|semanticLabel\s*:/);
  const interactive = countMatches(
    ctx.dart,
    /(?:^|[^\w])(?:GestureDetector|InkWell|ElevatedButton|TextButton|IconButton|OutlinedButton)\s*\(/,
  );
  checks.push(
    absence(ctx, {
      category: CATEGORIES.ACCESSIBILITY,
      checkKey: "flutter_semantics",
      label: "Screen-reader labels on interactive elements",
      status:
        interactive === 0 ? "SKIPPED" : semantics === 0 ? "FAIL" : semantics / interactive >= 0.2 ? "PASS" : "WARN",
      detail:
        interactive === 0
          ? "No interactive widgets found in the sampled source."
          : semantics === 0
            ? `${interactive} interactive widget${interactive !== 1 ? "s" : ""} found with no Semantics or semanticLabel anywhere. TalkBack and VoiceOver will announce icon-only controls as unlabelled buttons, which makes the app effectively unusable with a screen reader.`
            : semantics / interactive >= 0.2
              ? `${semantics} semantic label${semantics !== 1 ? "s" : ""} across ${interactive} interactive widgets.`
              : `Only ${semantics} semantic label${semantics !== 1 ? "s" : ""} across ${interactive} interactive widgets. Icon-only controls need an explicit label or a screen reader announces them as just "button".`,
    }),
  );

  // Feature code commented out in shipped source — a behaviour change hiding as a diff.
  const commentedFeature = countMatches(
    ctx.dartRaw,
    /^\s*\/\/\s*TODO[^\n]{0,120}(re-?enable|reenable|restore|uncomment|temporar)/im,
  );
  checks.push({
    category: C,
    checkKey: "flutter_commented_features",
    label: "No disabled features left commented out",
    status: ctx.dartRaw === "" ? "SKIPPED" : commentedFeature > 0 ? "WARN" : "PASS",
    detail:
      ctx.dartRaw === ""
        ? "No Dart source could be read."
        : commentedFeature > 0
          ? `${commentedFeature} "re-enable later" TODO${commentedFeature !== 1 ? "s" : ""} found beside commented-out code. Disabling a feature by commenting it out changes shipped behaviour while leaving no trace in the UI, no flag to flip and nothing that expires — so it survives far longer than intended, and the next person reading the file finds the logic and assumes it runs. Use a feature flag or remote config instead.`
          : "No commented-out features awaiting re-enablement.",
    evidence: commentedFeature > 0 ? `${commentedFeature} re-enable TODO(s)` : undefined,
  });

  return checks;
}
