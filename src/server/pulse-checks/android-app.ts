// ─────────────────────────────────────────────────────────────────────────────
// NATIVE ANDROID (Kotlin / Java + Gradle) CHECK FAMILY.
//
// WHY THIS EXISTS. "Android app" has been selectable in the scan dropdown since
// before the iOS family shipped, but it had NO checks of its own — only the
// applicability skips that stop web-shaped checks failing a mobile repo. So a
// native Kotlin app was scored entirely on generic repo hygiene (README, .gitignore,
// CI, licence): exactly the hole iOS was in before §34.
//
// The findings mirror the ones the Flutter family (§34.6) found in the SAME client's
// codebases, because they are one house pattern rather than three teams' mistakes:
// tokens in plaintext preferences while a secure store sits unused, cleartext HTTP
// permitted app-wide, logging left on in release, and the environment selected by
// editing a source line.
//
// EVIDENCE MODEL (identical to ios-app.ts, and it matters):
//   • PRESENCE findings ("we found X") are sound on a sample — we saw it.
//   • ABSENCE findings ("no X anywhere") are NOT sound on a sample. Those declare
//     confidence: "LOW" when coverage is thin, which score-breakdown.ts excludes
//     from scoring and the UI shows as Inconclusive. A thin sample can therefore
//     never invent a failure.
//
// Comments are stripped from sampled source before matching (stripCStyleComments),
// because a commented-out guard is not a live guard — that bug shipped twice, in
// §34.3 and §34.6.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";
import { isVendoredPath, stripCStyleComments, sampleCoverage } from "./native-mobile";

/** Below this sampled-file coverage, absence findings self-downgrade to LOW. */
const SOUND_ABSENCE_COVERAGE = 0.3;

/**
 * Google Play's minimum target API level. Play rejects new apps and updates below
 * the floor, so this is a store-blocking finding rather than a style preference.
 * Bump this line each August when Play's requirement moves.
 */
const PLAY_TARGET_SDK_FLOOR = 35;

/** Density findings need a denominator — below this, they SKIP instead of guessing. */
const MIN_LINES_FOR_DENSITY = 200;

interface AndroidContext {
  /** Sampled Kotlin/Java source with comments stripped — for "is this live code?" */
  source: string;
  /** Same source, comments intact — for signals that legitimately live in comments. */
  sourceRaw: string;
  /** All AndroidManifest.xml content joined. */
  manifest: string;
  /** All build.gradle / build.gradle.kts content joined. */
  gradle: string;
  /** Non-vendored source line count, for density metrics. */
  lines: number;
  /** Sampled fraction of the repo's Kotlin/Java files (0–1). */
  coverage: number;
  paths: string[];
}

function buildContext(snapshot: RepoSnapshot): AndroidContext {
  const sourcePaths = snapshot.paths.filter((p) => /\.(kt|java)$/i.test(p) && !isVendoredPath(p));
  const read: string[] = [];
  let manifest = "";
  let gradle = "";

  for (const [path, text] of snapshot.files) {
    if (/AndroidManifest\.xml$/i.test(path)) manifest += "\n" + text;
    else if (/build\.gradle(\.kts)?$/i.test(path)) gradle += "\n" + text;
    else if (/\.(kt|java)$/i.test(path) && !isVendoredPath(path)) read.push(text);
  }

  const sourceRaw = read.join("\n");
  const source = stripCStyleComments(sourceRaw);
  return {
    source,
    sourceRaw,
    manifest,
    gradle,
    lines: sourceRaw.split("\n").length,
    coverage: sampleCoverage(read.length, sourcePaths.length, snapshot.truncated),
    paths: snapshot.paths,
  };
}

/**
 * An ABSENCE finding: "we looked and did not find X". Sound only when the sample is
 * broad enough, so below the threshold it self-downgrades to LOW confidence and
 * drops out of scoring rather than reporting a failure we cannot support.
 */
function absence(
  ctx: AndroidContext,
  check: Omit<PulseScanCheckInput, "confidence">,
): PulseScanCheckInput {
  const sound = ctx.coverage >= SOUND_ABSENCE_COVERAGE;
  return {
    ...check,
    confidence: sound ? "HIGH" : "LOW",
    detail: sound
      ? check.detail
      : `${check.detail} (Based on ${Math.round(ctx.coverage * 100)}% of this app's Kotlin/Java files — ` +
        `below the threshold for a confident "not present anywhere", so this is inconclusive rather than a failure.)`,
  };
}

export function evaluateAndroidChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  if (!snapshot.accessible) return [];
  const ctx = buildContext(snapshot);
  const checks: PulseScanCheckInput[] = [];

  checks.push(...securityChecks(ctx));
  checks.push(...componentSecurityChecks(ctx));
  checks.push(...secretsChecks(ctx));
  checks.push(...storeReadinessChecks(ctx));
  checks.push(...qualityChecks(ctx));
  checks.push(...platformQualityChecks(ctx));

  return checks;
}

// ── Component & IPC security ────────────────────────────────────────────────
//
// Everything in this section is about the boundary between this app and OTHER
// apps on the same device. Android's defaults here are permissive for historical
// reasons, so each of these is a case where doing nothing is the insecure choice.
function componentSecurityChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // PendingIntent mutability. A mutable PendingIntent handed to another app lets
  // that app fill in the blanks and have YOUR app execute the result.
  const pendingIntents = (ctx.source.match(/PendingIntent\.(getActivity|getService|getBroadcast|getForegroundService)\s*\(/g) ?? []).length;
  if (pendingIntents > 0) {
    const immutable = /FLAG_IMMUTABLE/.test(ctx.source);
    const mutable = /FLAG_MUTABLE/.test(ctx.source);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_pending_intent_mutability",
      label: "PendingIntents are immutable",
      status: immutable ? (mutable ? "WARN" : "PASS") : "WARN",
      confidence: "MEDIUM",
      detail: immutable && !mutable
        ? `${pendingIntents} PendingIntent(s) created, with FLAG_IMMUTABLE in use.`
        : immutable && mutable
          ? `${pendingIntents} PendingIntent(s) created; both FLAG_IMMUTABLE and FLAG_MUTABLE appear. A mutable ` +
            `PendingIntent is only safe when the recipient is trusted AND the base Intent names an explicit ` +
            `component — check each FLAG_MUTABLE site for both.`
          : `${pendingIntents} PendingIntent(s) created with no FLAG_IMMUTABLE anywhere in the sampled source. A ` +
            `PendingIntent runs with YOUR app's identity and permissions; if it is mutable, whichever app receives ` +
            `it can fill in the unset fields — including the target component — and have your app perform an action ` +
            `of their choosing. Android 12+ requires the flag to be stated explicitly for exactly this reason. Use ` +
            `FLAG_IMMUTABLE unless you have a specific need not to.`,
      evidence: `${pendingIntents} PendingIntent(s)`,
    });
  }

  // Task hijacking (StrandHogg). Default taskAffinity lets a malicious app insert
  // its activity into your task and present a convincing fake login screen.
  const hasLauncher = /android\.intent\.category\.LAUNCHER/.test(ctx.manifest);
  if (hasLauncher) {
    const defended = /android:taskAffinity\s*=\s*""|android:launchMode\s*=\s*"singleTask"|android:launchMode\s*=\s*"singleInstance"/i.test(ctx.manifest);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_task_hijacking",
      label: "Activities are protected against task hijacking",
      status: defended ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: defended
        ? `Task affinity or launch mode is set to limit task reuse.`
        : `No \`android:taskAffinity=""\` and no \`singleTask\`/\`singleInstance\` launch mode. By default every ` +
          `activity shares a task affinity derived from the package name, which lets another installed app declare ` +
          `the same affinity and have ITS activity appear inside your task — the user taps your icon and is shown ` +
          `the attacker's screen, styled like yours. This is the StrandHogg class of attack, and it needs no ` +
          `permissions. Set \`android:taskAffinity=""\` on activities that handle credentials or payment.`,
    });
  }

  // sharedUserId collapses the sandbox between apps signed with the same key.
  if (/android:sharedUserId\s*=/i.test(ctx.manifest)) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_shared_user_id",
      label: "sharedUserId is not used",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `\`android:sharedUserId\` is declared. It puts this app in the same Linux UID as every other app declaring ` +
        `the same id, so they share a sandbox and can read each other's private files directly. A compromise of any ` +
        `one of them is a compromise of all. It is deprecated — Android has been removing support — and migrating ` +
        `away later is disruptive because the UID is baked into installed copies. Use explicit IPC (a bound service, ` +
        `or a content provider with a signature-level permission) instead.`,
    });
  }

  // Custom permissions at protectionLevel normal/dangerous can be acquired by any
  // app that asks; signature-level restricts them to your own signing key.
  const customPermissions = (ctx.manifest.match(/<permission\b/gi) ?? []).length;
  if (customPermissions > 0) {
    const signatureLevel = /android:protectionLevel\s*=\s*"signature/i.test(ctx.manifest);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_custom_permission_level",
      label: "Custom permissions use signature protection",
      status: signatureLevel ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: signatureLevel
        ? `${customPermissions} custom permission(s) declared, with signature-level protection in use.`
        : `${customPermissions} custom permission(s) declared with no \`android:protectionLevel="signature"\`. At ` +
          `\`normal\` the permission is granted automatically to any app that requests it, and at \`dangerous\` it is ` +
          `one user tap away — so a permission meant to restrict a component to your own apps restricts it to ` +
          `nobody. Worse, a malicious app can define your permission FIRST if it installs before you. Use ` +
          `\`signature\`, which binds the grant to your signing key.`,
    });
  }

  // Content providers are exported by default below API 17 and are a direct
  // read/write path into app data when left open.
  const providers = (ctx.manifest.match(/<provider\b/gi) ?? []).length;
  if (providers > 0) {
    const exportedProvider = /<provider[\s\S]*?android:exported\s*=\s*"true"/i.test(ctx.manifest);
    const guarded = /<provider[\s\S]*?android:(permission|readPermission|writePermission)\s*=/i.test(ctx.manifest);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_content_provider_exposure",
      label: "Content providers are not openly exported",
      status: exportedProvider && !guarded ? "WARN" : "PASS",
      confidence: "MEDIUM",
      detail: exportedProvider && !guarded
        ? `A \`<provider>\` is exported with no \`android:permission\`, \`readPermission\` or \`writePermission\`. A ` +
          `content provider is a direct query interface to app data — an exported, unguarded one lets any installed ` +
          `app read (and often write) whatever it backs, with no user prompt. If it exists only to share files with ` +
          `other apps, use \`FileProvider\` with \`grantUriPermissions\` and per-URI grants instead of blanket export.`
        : `${providers} content provider(s) declared, either not exported or permission-guarded.`,
    });
  }

  // WebView file access. Combined with universal access from file URLs, a
  // malicious local HTML file can read every file the app can.
  if (/WebView|webView/.test(ctx.source)) {
    const fileAccess = /setAllowFileAccess\s*\(\s*true|setAllowFileAccessFromFileURLs\s*\(\s*true/.test(ctx.source);
    const universalAccess = /setAllowUniversalAccessFromFileURLs\s*\(\s*true/.test(ctx.source);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_webview_file_access",
      label: "WebView file access is disabled",
      status: universalAccess ? "FAIL" : fileAccess ? "WARN" : "PASS",
      confidence: "HIGH",
      detail: universalAccess
        ? `\`setAllowUniversalAccessFromFileURLs(true)\` lets content loaded from a \`file://\` URL make requests to ` +
          `ANY origin and read the responses — bypassing the same-origin policy entirely. Any HTML that reaches the ` +
          `WebView from disk (a downloaded file, a cache entry another app can write) can then read the app's private ` +
          `files and exfiltrate them. Set it to false; Android defaults it off from API 30 for this reason.`
        : fileAccess
          ? `\`setAllowFileAccess(true)\` permits the WebView to load \`file://\` URLs. Combined with any path the ` +
            `app writes from untrusted input, this becomes a local file read. Disable it unless the app genuinely ` +
            `renders local HTML, and use \`WebViewAssetLoader\` if it does.`
          : `WebView file access is not explicitly enabled.`,
    });
  }

  // Raw SQL built by concatenation.
  if (/rawQuery\s*\(|execSQL\s*\(/.test(ctx.source)) {
    // The literal must be matched per-quote-style rather than with a shared
    // [^"']* class: a SQL string very often CONTAINS the other quote character
    // (`"... WHERE email = '"` + email), which made the shared class fail to match
    // exactly the concatenation this check exists to find.
    const concatenated =
      /(rawQuery|execSQL)\s*\(\s*(?:"[^"]*"|'[^']*')\s*\+/i.test(ctx.source) ||
      /(rawQuery|execSQL)\s*\(\s*`[^`]*\$\{/i.test(ctx.source) ||
      /(rawQuery|execSQL)\s*\(\s*\w+\s*\+/i.test(ctx.source);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_sql_injection",
      label: "SQL queries are parameterised",
      status: concatenated ? "FAIL" : "PASS",
      confidence: "MEDIUM",
      detail: concatenated
        ? `A \`rawQuery\`/\`execSQL\` call builds its SQL by string concatenation or interpolation. Any user-supplied ` +
          `value reaching it can change the query — read other users' cached rows, or drop the table. Pass values as ` +
          `\`selectionArgs\` with \`?\` placeholders, which SQLite binds rather than parses. If the app syncs data ` +
          `from your API, remember the "user input" here includes anything the server sent.`
        : `Raw SQL calls are present and do not appear to concatenate values into the statement.`,
    });
  }

  // Sensitive data on external storage is world-readable on older API levels and
  // survives uninstall.
  if (/getExternalStorage(Directory|PublicDirectory)|Environment\.getExternalStorage/.test(ctx.source)) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_external_storage",
      label: "Sensitive files are not written to shared storage",
      status: "WARN",
      confidence: "MEDIUM",
      detail:
        `The app writes to shared external storage (\`Environment.getExternalStorageDirectory\`). Files there are ` +
        `outside the app sandbox: readable by other apps on older API levels, retained after your app is uninstalled, ` +
        `and backed up to the user's cloud account. Use \`context.getFilesDir()\` for anything private, or ` +
        `\`getExternalFilesDir()\` for large non-sensitive caches — the latter is at least removed on uninstall.`,
    });
  }

  return checks;
}

// ── Platform quality: deep links, notifications, threading, dependencies ────
function platformQualityChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // App Links verification. Without autoVerify, the OS shows a disambiguation
  // dialog (or opens the browser) instead of your app.
  const hasHttpIntentFilter = /<data[^>]*android:scheme\s*=\s*"https?"/i.test(ctx.manifest);
  if (hasHttpIntentFilter) {
    const autoVerify = /android:autoVerify\s*=\s*"true"/i.test(ctx.manifest);
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "android_app_links_verified",
      label: "HTTP deep links are verified App Links",
      status: autoVerify ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: autoVerify
        ? `\`android:autoVerify="true"\` is set — confirm \`/.well-known/assetlinks.json\` is served on the domain, ` +
          `since verification fails silently if it is missing or malformed.`
        : `The app registers an intent filter for http/https links without \`android:autoVerify="true"\`. Unverified ` +
          `links do not open the app directly: Android shows a "open with" chooser, or just opens the browser — so ` +
          `every marketing link, password reset and share link lands on the website instead of the app, and any ` +
          `other app can claim the same links. Add \`autoVerify\` and publish \`assetlinks.json\` with your signing ` +
          `certificate fingerprint.`,
    });
  }

  // POST_NOTIFICATIONS became a runtime permission at API 33; apps that never
  // request it silently stop notifying anyone on modern devices.
  const usesNotifications = /NotificationManager|NotificationCompat|FirebaseMessagingService/.test(ctx.source) ||
    /com\.google\.firebase\.MESSAGING_EVENT/.test(ctx.manifest);
  if (usesNotifications) {
    const requestsPermission = /POST_NOTIFICATIONS/.test(ctx.manifest + ctx.source);
    checks.push({
      category: CATEGORIES.MOBILE,
      checkKey: "android_notification_permission",
      label: "POST_NOTIFICATIONS is requested",
      status: requestsPermission ? "PASS" : "FAIL",
      confidence: "HIGH",
      detail: requestsPermission
        ? `\`POST_NOTIFICATIONS\` is declared — confirm the app also requests it at runtime and handles a refusal.`
        : `The app posts notifications but never declares \`android.permission.POST_NOTIFICATIONS\`. Since Android 13 ` +
          `(API 33) that is a runtime permission, and without it notifications are silently dropped — no error, no ` +
          `log, nothing in the tray. On any modern device this app's notifications simply do not arrive, which is ` +
          `usually reported as "push isn't working" and debugged on the server side for a long time first.`,
    });
  }

  // Network on the main thread. StrictMode catches this in development; in
  // production it is ANRs.
  const mainThreadIo = /\.permitAll\s*\(\)|StrictMode\.setThreadPolicy[\s\S]{0,120}permitNetwork/.test(ctx.source);
  if (mainThreadIo) {
    checks.push({
      category: CATEGORIES.PERFORMANCE,
      checkKey: "android_main_thread_io",
      label: "Main-thread network policy is not relaxed",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `A StrictMode thread policy calls \`permitAll()\` (or explicitly permits network), which disables the guard ` +
        `that stops network and disk I/O running on the UI thread. That guard exists because main-thread I/O is the ` +
        `direct cause of ANRs — the system kills an app whose UI thread is blocked for 5 seconds, and Play Console ` +
        `surfaces the ANR rate as a store-quality metric. Move the work to a coroutine or executor rather than ` +
        `silencing the detector.`,
    });
  }

  // Dynamic version ranges make builds non-reproducible and pull unreviewed code.
  const dynamicVersions = /(implementation|api|compileOnly)\s*\(?\s*["'][^"']*:(\+|latest\.release|\d+\.\+)["']/i.test(ctx.gradle);
  if (ctx.gradle) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_dependency_pinning",
      label: "Dependencies are pinned to exact versions",
      status: dynamicVersions ? "WARN" : "PASS",
      confidence: "HIGH",
      detail: dynamicVersions
        ? `A Gradle dependency uses a dynamic version (\`+\` or \`latest.release\`). Two builds of the same commit can ` +
          `then produce different apps, so a crash report cannot be tied to a dependency set — and a compromised ` +
          `release of that library is pulled into your next build with no diff to review and no approval step. Pin ` +
          `exact versions and use a lockfile or version catalog.`
        : `No dynamic Gradle version ranges — dependency versions are pinned.`,
    });
  }

  // minSdk that is very old carries platform-level weaknesses the app cannot fix.
  const minSdk = /minSdk(?:Version)?\s*=?\s*(\d{1,2})/i.exec(ctx.gradle);
  if (minSdk) {
    const level = Number(minSdk[1]);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_min_sdk_floor",
      label: "Minimum SDK excludes unsupported Android versions",
      status: level >= 24 ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: level >= 24
        ? `minSdk ${level} — the app does not run on Android versions that predate the modern security model.`
        : `minSdk ${level} supports Android versions that no longer receive security updates and that lack platform ` +
          `protections the app cannot supply for itself: TLS 1.2 by default (API 20+), cleartext blocked by default ` +
          `(API 28+), and scoped storage. Supporting them also means shipping compatibility code and testing devices ` +
          `almost nobody uses — Play's own distribution data will show the share, and it is usually under 1%.`,
      evidence: `minSdk ${level}`,
    });
  }

  // Firebase config committed. Deliberately NOT a failure — Google ships these
  // keys in every app binary and treats them as public identifiers. Same call as
  // the iOS family makes for GoogleService-Info.plist (§34.5).
  if (ctx.paths.some((p) => /(^|\/)google-services\.json$/i.test(p))) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "android_firebase_config_committed",
      label: "Firebase configuration is restricted, not secret",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `\`google-services.json\` is committed. This is expected and not a leak — Google ships these values inside ` +
        `every published app binary and treats them as public identifiers, so rotating the key achieves nothing. ` +
        `The action is to confirm in the Cloud console that the API key is restricted to your package name and ` +
        `signing-certificate fingerprint, and that Firestore/Storage security rules do not rely on the key being ` +
        `secret — that cannot be seen from the repository, which is why this is flagged for confirmation rather than ` +
        `scored as a failure.`,
    });
  }

  return checks;
}

// ── Security ────────────────────────────────────────────────────────────────
function securityChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Cleartext HTTP app-wide. The exact finding the Flutter family caught in the
  // same client's Android app — worth checking against the iOS side, where ATS is
  // usually enforced; the two drifting apart is the common case.
  const cleartext = /android:usesCleartextTraffic\s*=\s*"true"/i.test(ctx.manifest);
  const hasNetworkConfig = /android:networkSecurityConfig\s*=/i.test(ctx.manifest);
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "android_cleartext_traffic",
    label: "Cleartext HTTP disabled",
    status: cleartext ? "FAIL" : "PASS",
    confidence: "HIGH",
    detail: cleartext
      ? `\`android:usesCleartextTraffic="true"\` permits plaintext HTTP app-wide, so any request can be downgraded ` +
        `and read on a hostile network. ${hasNetworkConfig
          ? "A networkSecurityConfig is also declared — scope the exception to the single host that needs it and remove the app-wide flag."
          : "Remove it, or scope a single host with a networkSecurityConfig."}`
      : `Cleartext HTTP is not enabled app-wide (API 28+ blocks it by default).`,
  });

  // debuggable=true in a shipped manifest is a straightforward compromise: it lets
  // anyone attach a debugger to a release build on a normal device.
  const debuggable = /android:debuggable\s*=\s*"true"/i.test(ctx.manifest);
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "android_debuggable_release",
    label: "Release build is not debuggable",
    status: debuggable ? "FAIL" : "PASS",
    confidence: "HIGH",
    detail: debuggable
      ? `\`android:debuggable="true"\` is set in the manifest. In a shipped build that lets anyone attach a debugger ` +
        `to the running app on an ordinary device and read memory, including tokens and keys. Remove it — Gradle sets ` +
        `it automatically for debug builds, so it never belongs in the manifest.`
      : `The manifest does not force debuggable — Gradle controls it per build type, which is correct.`,
  });

  // Backup allows the app's private data (including any plaintext prefs) to be
  // pulled off the device over ADB on many configurations.
  const allowBackup = /android:allowBackup\s*=\s*"true"/i.test(ctx.manifest);
  const explicitlyDisabled = /android:allowBackup\s*=\s*"false"/i.test(ctx.manifest);
  const backupRules = /android:(fullBackupContent|dataExtractionRules)\s*=/i.test(ctx.manifest);
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "android_backup_rules",
    label: "Backup excludes sensitive data",
    status: explicitlyDisabled || backupRules ? "PASS" : allowBackup ? "WARN" : "WARN",
    confidence: "HIGH",
    detail: explicitlyDisabled
      ? `Backup is disabled, so app-private files cannot be extracted through the backup channel.`
      : backupRules
        ? `Backup rules are declared — confirm they exclude the files holding tokens and any cached personal data.`
        : `No \`android:allowBackup="false"\` and no backup rules. Backup defaults to ON, so app-private files — ` +
          `including SharedPreferences XML holding any tokens — can be pulled off the device through the backup ` +
          `channel. Either disable backup or declare dataExtractionRules that exclude the sensitive files.`,
  });

  // Exported components without a permission are reachable by any other app.
  const exportedTrue = (ctx.manifest.match(/android:exported\s*=\s*"true"/gi) ?? []).length;
  const permissionGuards = (ctx.manifest.match(/android:permission\s*=/gi) ?? []).length;
  if (exportedTrue > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_exported_components",
      label: "Exported components are permission-guarded",
      status: permissionGuards === 0 ? "WARN" : "PASS",
      confidence: "MEDIUM",
      detail: permissionGuards === 0
        ? `${exportedTrue} component(s) are \`android:exported="true"\` and no \`android:permission\` guard appears ` +
          `anywhere in the manifest. An exported activity, service or receiver can be started by ANY other app on the ` +
          `device. The launcher activity must be exported; anything else usually should not be. Check each one, and ` +
          `add a signature-level permission to those that must stay open.`
        : `${exportedTrue} exported component(s), with permission guards declared — confirm each exported component ` +
          `that is not the launcher is covered.`,
    });
  }

  // Release logging. Presence-based: we found a log call with no build guard.
  const logCalls = (ctx.source.match(/\bLog\.[vdiwe]\s*\(|\bprintln\s*\(|\bTimber\.[vdiwe]\s*\(/g) ?? []).length;
  const hasBuildGuard = /BuildConfig\.DEBUG/.test(ctx.source);
  if (logCalls > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_release_logging",
      label: "Logging is disabled in release builds",
      status: hasBuildGuard ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: hasBuildGuard
        ? `${logCalls} log call(s) found, and BuildConfig.DEBUG guards are present — confirm the guard wraps the ` +
          `logger itself rather than a handful of call sites.`
        : `${logCalls} log call(s) and NO \`BuildConfig.DEBUG\` guard anywhere in the sampled source, so logging ` +
          `ships enabled. Android logs are readable by anyone with the device and adb, and are captured in bug ` +
          `reports users send to support. Gate the logger on BuildConfig.DEBUG, or strip logs with a ProGuard rule.`,
      evidence: `${logCalls} log call(s), no BuildConfig.DEBUG`,
    });
  }

  // WebView JavaScript bridge — addJavascriptInterface exposes native methods to
  // page JS, which is remote-code-execution territory when the page is not yours.
  if (/addJavascriptInterface\s*\(/.test(ctx.source)) {
    const loadsRemote = /loadUrl\s*\(\s*"https?:\/\//i.test(ctx.source);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "android_webview_js_bridge",
      label: "WebView JavaScript bridge is not exposed to remote content",
      status: loadsRemote ? "FAIL" : "WARN",
      confidence: "MEDIUM",
      detail: loadsRemote
        ? `\`addJavascriptInterface\` exposes native methods to page JavaScript, and the WebView also loads a remote ` +
          `URL. Any script on that page — including one injected by a compromised third party or an ad — can call ` +
          `into the app. Remove the bridge, or restrict the WebView to content you ship in the APK.`
        : `\`addJavascriptInterface\` exposes native methods to page JavaScript. Safe only while the WebView loads ` +
          `content you control; confirm it never loads a remote URL.`,
    });
  }

  return checks;
}

// ── Secrets & keys ──────────────────────────────────────────────────────────
/**
 * A password reaching preference storage — the WRITE, not the word.
 *
 * Matches the SharedPreferences/DataStore write APIs with a password-shaped key,
 * as either a literal or a `*_PASSWORD` constant. Those are the two ways it is
 * actually written; a string that merely mentions passwords is not one of them.
 *
 * Exported because this predicate is the whole check, and the difference between
 * a true finding and a 100% false-positive rate lives in it alone.
 */
export function tokenKeyInPrefsApi(source: string): boolean {
  return /\b(?:put|get)(?:String|StringSet)\s*\(\s*(?:"[^"\n]*(?:access|refresh|auth|bearer|id)[_-]?token[^"\n]*"|[A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*)\s*[,)]/i
    .test(source);
}

export function writesPasswordToPrefs(source: string): boolean {
  return /\bput(?:String|Boolean|Int|Long|Float|StringSet)\s*\(\s*(?:"[^"\n]*password[^"\n]*"|[A-Za-z0-9_]*PASSWORD[A-Za-z0-9_]*)\s*,/i
    .test(source);
}

function secretsChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Tokens in SharedPreferences. The exact inversion found across this client's
  // iOS and Flutter apps: a secure store exists in the project and the tokens are
  // not in it.
  // ⚠️ Same co-occurrence defect as android_password_retention below, same fix.
  // The old rule was "a token-shaped identifier anywhere" AND "SharedPreferences
  // anywhere" — so any app with an `accessToken` variable and a settings screen
  // FAILED. Measured across the corpus it fired on 5 of 6 real Android apps. The
  // finding claims tokens are "read from or written to SharedPreferences", so it
  // has to match the preference API itself.
  const usesPrefs = /getSharedPreferences\s*\(|PreferenceManager\.|\bdataStore\b/i.test(ctx.source);
  const usesEncrypted = /EncryptedSharedPreferences|MasterKeys?\.|androidx\.security/i.test(ctx.source + ctx.gradle);
  const tokenNearPrefs = usesPrefs && tokenKeyInPrefsApi(ctx.source);

  if (tokenNearPrefs) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "android_token_storage",
      label: "Auth tokens stored in encrypted storage",
      status: usesEncrypted ? "WARN" : "FAIL",
      confidence: usesEncrypted ? "MEDIUM" : "HIGH",
      detail: usesEncrypted
        ? `Auth token keys appear alongside SharedPreferences use, and EncryptedSharedPreferences is also present in ` +
          `this project. Confirm the TOKENS specifically go to the encrypted store — a half-finished migration, where ` +
          `the secure store exists but the tokens were never moved into it, is the common case.`
        : `Auth token keys are read from or written to SharedPreferences with no sign of EncryptedSharedPreferences ` +
          `anywhere. SharedPreferences is a plaintext XML file in app-private storage: readable on a rooted device, ` +
          `and extractable via ADB backup wherever backup is allowed. Move tokens to EncryptedSharedPreferences ` +
          `(androidx.security-crypto) or the Android Keystore.`,
    });
  }

  // A password persisted at all is worse than where it is persisted.
  //
  // ⚠️ This must match the WRITE, not the word. The rule was previously "a string
  // literal containing 'password'" AND "SharedPreferences used somewhere in the
  // sampled source" — co-occurrence in a concatenated blob, not a relationship.
  // Run across 7 real Android apps it reported a FAIL on ALL SEVEN, including
  // nextcloud/android, duckduckgo/Android and mozilla-mobile/reference-browser.
  // The actual matches were:
  //
  //     @property providerId ... ("google.com", "facebook.com", "password")   ← KDoc
  //     message?.contains("password", ignoreCase = true)                      ← error text
  //     message = "Create user with email and password was cancelled"         ← UI copy
  //     Timber.w(e, "Failed to save password credential for: %s", email)      ← a log line
  //
  // Not one is a password reaching storage. A 100% FAIL rate in SECRETS_KEYS —
  // a category every release-gate policy blocks on — is not seven security
  // incidents, it is a broken check. Requiring the preference-write API is what
  // makes the finding mean what it says; the key may be a literal or a
  // *_PASSWORD constant, which are the two ways it is actually written.
  if (writesPasswordToPrefs(ctx.source) && usesPrefs) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "android_password_retention",
      label: "User password is not persisted on device",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `A password key appears to be written to on-device preference storage, typically for a "remember me" feature. ` +
        `Encrypted storage is the right place for secrets, but a password never needs to be retained at all: keep a ` +
        `refresh token and re-authenticate with that. Retaining it widens the blast radius of any device compromise ` +
        `to the user's actual credential, which is very often reused elsewhere.`,
    });
  }

  // API keys committed in Gradle or source rather than injected at build time.
  const KEY_LITERAL = /(api_?key|apiKey|secret|clientSecret)\s*[=:]\s*"[A-Za-z0-9_\-]{16,}"/i;
  const inGradle = KEY_LITERAL.test(ctx.gradle);
  const inSource = KEY_LITERAL.test(ctx.source);
  if (inGradle || inSource) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "android_hardcoded_api_key",
      label: "API keys are not hardcoded in the repo",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `A long key-shaped literal is committed in ${inGradle ? "a Gradle build file" : "application source"}. Anything ` +
        `in the APK is readable — \`apktool\` takes seconds — so treat a committed key as public: rotate it, then inject ` +
        `it at build time from gradle.properties (git-ignored) or CI secrets, and restrict it by package name and ` +
        `signing certificate where the provider supports that.`,
    });
  }

  // Signing config with a literal password in Gradle: the key that IS the app.
  if (/storePassword\s*=?\s*"[^"]+"|keyPassword\s*=?\s*"[^"]+"/i.test(ctx.gradle)) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "android_signing_credentials_committed",
      label: "Signing credentials are not committed",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        `A signing store or key password is written literally into a Gradle build file. The upload/signing key is the ` +
        `one credential that cannot be rotated cheaply — whoever holds it can publish an update AS you. Move it to ` +
        `gradle.properties outside version control (or CI secrets), and if this was ever pushed to a shared remote, ` +
        `treat the key as compromised and start a Play upload-key reset.`,
    });
  }

  return checks;
}

// ── Store readiness ─────────────────────────────────────────────────────────
function storeReadinessChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // targetSdk floor — Play REJECTS below it, so this blocks release outright.
  const target = /targetSdk(?:Version)?\s*=?\s*(\d{2})/i.exec(ctx.gradle);
  if (target) {
    const level = Number(target[1]);
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "android_target_sdk_current",
      label: "targetSdk meets the Play Store floor",
      status: level >= PLAY_TARGET_SDK_FLOOR ? "PASS" : "FAIL",
      confidence: "HIGH",
      detail: level >= PLAY_TARGET_SDK_FLOOR
        ? `targetSdk ${level} meets Google Play's current minimum (${PLAY_TARGET_SDK_FLOOR}).`
        : `targetSdk ${level} is below Google Play's minimum of ${PLAY_TARGET_SDK_FLOOR}. Play will REJECT new ` +
          `releases until it is raised — this blocks shipping, it is not a warning. Raising it also opts the app into ` +
          `newer platform behaviour (permissions, background limits), so budget testing rather than only bumping the number.`,
      evidence: `targetSdk ${level}`,
    });
  }

  // Dangerous permissions need a user-facing justification at review.
  const DANGEROUS = [
    ["ACCESS_FINE_LOCATION", "precise location"],
    ["ACCESS_BACKGROUND_LOCATION", "background location"],
    ["READ_CONTACTS", "contacts"],
    ["RECORD_AUDIO", "microphone"],
    ["READ_SMS", "SMS"],
    ["QUERY_ALL_PACKAGES", "the full installed-app list"],
    ["READ_EXTERNAL_STORAGE", "external storage"],
  ] as const;
  const requested = DANGEROUS.filter(([p]) => new RegExp(`android\\.permission\\.${p}\\b`).test(ctx.manifest));
  if (requested.length > 0) {
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "android_sensitive_permissions",
      label: "Sensitive permissions are justified",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `The manifest requests ${requested.map(([, label]) => label).join(", ")}. Each of these needs a declared ` +
        `purpose in the Play listing, and several (background location, SMS, QUERY_ALL_PACKAGES) require a separate ` +
        `Play declaration and are refused without a strong justification. Remove any the app does not actually use — ` +
        `an unused sensitive permission is a rejection risk for no benefit.`,
      evidence: requested.map(([p]) => p).join(", "),
    });
  }

  // Code shrinking / obfuscation off means the shipped APK is trivially readable.
  const minifyOff = /minifyEnabled\s+false|isMinifyEnabled\s*=\s*false/i.test(ctx.gradle);
  const minifyOn = /minifyEnabled\s+true|isMinifyEnabled\s*=\s*true/i.test(ctx.gradle);
  checks.push({
    category: CATEGORIES.APP_STORE,
    checkKey: "android_minify_enabled",
    label: "Release build is minified and shrunk",
    status: minifyOn ? "PASS" : minifyOff ? "WARN" : "WARN",
    confidence: minifyOn || minifyOff ? "HIGH" : "MEDIUM",
    detail: minifyOn
      ? `R8/ProGuard shrinking is enabled for release.`
      : `Release shrinking (\`minifyEnabled true\`) is ${minifyOff ? "explicitly disabled" : "not configured"}. ` +
        `Without it the APK ships larger than it needs to be and with original class and method names intact, so ` +
        `reading the app's logic — including how it talks to your API — is straightforward. Enable R8 for release.`,
  });

  return checks;
}

// ── Code quality ────────────────────────────────────────────────────────────
function qualityChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Test target. Android's convention is real directories, so absence is checkable
  // from the tree rather than a sample — no confidence downgrade needed.
  const testFiles = ctx.paths.filter(
    (p) => /(^|\/)src\/(test|androidTest)\//i.test(p) && /\.(kt|java)$/i.test(p) && !isVendoredPath(p),
  );
  const sourceCount = ctx.paths.filter((p) => /\.(kt|java)$/i.test(p) && !isVendoredPath(p)).length;
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "android_test_coverage",
    label: "Test suite proportionate to the codebase",
    status: testFiles.length === 0 ? "FAIL" : testFiles.length < Math.max(3, sourceCount * 0.02) ? "WARN" : "PASS",
    confidence: "HIGH",
    detail: testFiles.length === 0
      ? `No test sources under src/test or src/androidTest, against ${sourceCount} Kotlin/Java files — nothing ` +
        `verifies a change before it reaches the Play Store.`
      : `${testFiles.length} test file(s) against ${sourceCount} source files.`,
    evidence: `${testFiles.length} test / ${sourceCount} source`,
  });

  // Environment selected by editing source — the defect the Flutter family exists
  // for, in its Kotlin form. Presence-based: we can see the commented alternatives.
  const baseUrlDecl = /(?:const\s+val|val|static\s+final\s+String)\s+\w*BASE_?URL\w*\s*[:=]/i;
  if (baseUrlDecl.test(ctx.sourceRaw)) {
    const commentedAlternatives = (ctx.sourceRaw.match(/^\s*\/\/\s*(?:const\s+val|val)\s+\w*BASE_?URL/gim) ?? []).length;
    const NON_PROD = /(staging|\.test\.|test\.|dev\.|\.local|localhost|10\.0\.2\.2|ngrok|preprod|uat|sandbox)/i;
    const liveUrl = /(?:const\s+val|val)\s+\w*BASE_?URL\w*\s*[:=]\s*"([^"]+)"/i.exec(ctx.source)?.[1] ?? "";
    const liveIsNonProd = NON_PROD.test(liveUrl);

    if (commentedAlternatives > 0 || liveIsNonProd) {
      checks.push({
        category: CATEGORIES.SECURITY,
        checkKey: "android_env_baseurl",
        label: "API environment is not selected by editing source",
        status: liveIsNonProd ? "FAIL" : "WARN",
        confidence: "HIGH",
        detail: liveIsNonProd
          ? `The active API base URL is a NON-PRODUCTION host: \`${liveUrl}\`${commentedAlternatives > 0
              ? `, with ${commentedAlternatives} alternative(s) commented out beside it` : ""}. If a release was built ` +
            `from this state the app is talking to that environment. Select the environment with a build type or ` +
            `product flavour (buildConfigField) so it is a build input, not a code edit someone has to remember to undo.`
          : `The API base URL has ${commentedAlternatives} alternative(s) commented out beside it, so the environment ` +
            `is chosen by editing a source line. That makes every release depend on someone remembering to swap it ` +
            `back. Use buildConfigField per build type or product flavour instead.`,
        evidence: liveUrl || `${commentedAlternatives} commented alternatives`,
      });
    }
  }

  // Force-unwrap density, per 1,000 lines — a raw count grows with any codebase and
  // would fire on every large repo forever (the §34.5 lesson).
  if (ctx.lines >= MIN_LINES_FOR_DENSITY) {
    const bangs = (ctx.source.match(/!!/g) ?? []).length;
    const per1k = (bangs / ctx.lines) * 1000;
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "android_force_unwrap_density",
      label: "Null assertions (!!) used sparingly",
      status: per1k > 8 ? "WARN" : "PASS",
      confidence: "HIGH",
      detail: per1k > 8
        ? `${bangs} \`!!\` null assertions across ${ctx.lines.toLocaleString()} sampled lines (${per1k.toFixed(1)} per ` +
          `1,000). Each one is a crash the compiler offered to prevent. Prefer \`?.\`, \`?:\` or an explicit ` +
          `requireNotNull with a message that says what was missing.`
        : `${per1k.toFixed(1)} \`!!\` assertions per 1,000 sampled lines — within normal range.`,
      evidence: `${bangs} in ${ctx.lines.toLocaleString()} lines`,
    });
  }

  // Absence findings — these self-downgrade on a thin sample.
  checks.push(absence(ctx, {
    category: CATEGORIES.ACCESSIBILITY,
    checkKey: "android_content_descriptions",
    label: "Interactive elements have content descriptions",
    status: /contentDescription|setContentDescription|semantics\s*\{/i.test(ctx.source) ? "PASS" : "WARN",
    detail: /contentDescription|setContentDescription|semantics\s*\{/i.test(ctx.source)
      ? `Content descriptions are set, so TalkBack has something to announce.`
      : `No contentDescription or Compose semantics found. Every non-text control is then announced by TalkBack as ` +
        `"button" with no indication of what it does, which makes the app unusable with a screen reader and is a ` +
        `common accessibility-complaint trigger.`,
  }));

  checks.push(absence(ctx, {
    category: CATEGORIES.PERFORMANCE,
    checkKey: "android_http_cache",
    label: "HTTP responses are cached",
    status: /\bCache\s*\(|cacheControl|OkHttpClient[\s\S]{0,200}\.cache\s*\(/i.test(ctx.source) ? "PASS" : "WARN",
    detail: /\bCache\s*\(|cacheControl|OkHttpClient[\s\S]{0,200}\.cache\s*\(/i.test(ctx.source)
      ? `An HTTP cache is configured on the client.`
      : `No OkHttp cache or Cache-Control handling found, so every screen re-fetches over the network. On a weak or ` +
        `metered connection that is felt directly as slowness, and it burns the user's data allowance re-downloading ` +
        `content the device already had.`,
  }));

  checks.push(absence(ctx, {
    category: CATEGORIES.PERFORMANCE,
    checkKey: "android_metered_network",
    label: "Large transfers respect metered connections",
    status: /isActiveNetworkMetered|NetworkCapabilities\.NET_CAPABILITY_NOT_METERED|setRequiredNetworkType/i.test(ctx.source)
      ? "PASS" : "WARN",
    detail: /isActiveNetworkMetered|NetworkCapabilities\.NET_CAPABILITY_NOT_METERED|setRequiredNetworkType/i.test(ctx.source)
      ? `Metered-connection checks are present before large transfers.`
      : `No metered-network check found. Downloads and media prefetch then run identically on Wi-Fi and on cellular, ` +
        `which is what turns into "the app used all my data". Gate large transfers on ` +
        `ConnectivityManager.isActiveNetworkMetered, or a WorkManager constraint.`,
  }));

  return checks;
}
