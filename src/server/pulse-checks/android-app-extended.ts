// ─────────────────────────────────────────────────────────────────────────────
// ANDROID — SECOND FAMILY. Depth on top of android-app.ts's 33 checks.
//
// The first family covers the manifest-level exposures: cleartext traffic,
// debuggable release builds, exported components, target-SDK floor. This one
// covers what a Play Store review and a production incident actually turn up —
// backup exposure, WebView configuration, PendingIntent mutability, R8/ProGuard,
// and the storage APIs that changed under scoped storage.
//
// Same sampling discipline as the rest: Kotlin/Java sources are sampled, so
// "we found X" is sound and "there is no X anywhere" is downgraded to LOW
// confidence — and therefore unscored — when coverage is thin.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";

const SOUND_ABSENCE_COVERAGE = 0.3;

interface Ctx {
  source: string;
  sampled: number;
  total: number;
  manifest: string;
  gradle: string;
  properties: string;
  coverage: number;
}

/**
 * Strip Kotlin/Java comments, preserving both quote styles.
 *
 * Kotlin and Java both use `"`; a Java char literal uses `'`. Both are handled so
 * a URL inside a literal is never truncated at its `//` — the bug that silently
 * disabled a whole check in the Flutter family (CLAUDE.md §34.6).
 */
export function stripJvmComments(source: string): string {
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
    if (source[i] === '"' || source[i] === "'") {
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

function buildCtx(snapshot: RepoSnapshot): Ctx {
  const src: string[] = [];
  const manifest: string[] = [];
  const gradle: string[] = [];
  const properties: string[] = [];
  let sampled = 0;

  for (const [path, text] of snapshot.files) {
    if (/\.(kt|java)$/i.test(path)) {
      src.push(text);
      sampled++;
    } else if (/AndroidManifest\.xml$/i.test(path)) manifest.push(text);
    else if (/build\.gradle(\.kts)?$/i.test(path)) gradle.push(text);
    else if (/gradle\.properties$/i.test(path)) properties.push(text);
  }

  const total = snapshot.paths.filter((p) => /\.(kt|java)$/i.test(p)).length;
  return {
    source: stripJvmComments(src.join("\n")),
    sampled,
    total,
    manifest: manifest.join("\n"),
    gradle: gradle.join("\n"),
    properties: properties.join("\n"),
    coverage: total === 0 ? 0 : sampled / total,
  };
}

const CATALOGUE: [string, string][] = [
  ["android_x_allow_backup", "Application data is not silently backed up off-device"],
  ["android_x_backup_rules", "Backup rules exclude credentials and databases"],
  ["android_x_code_shrinking", "Release builds are minified and obfuscated"],
  ["android_x_resource_shrinking", "Release builds shrink unused resources"],
  ["android_x_pending_intent_mutable", "PendingIntents are explicitly immutable"],
  ["android_x_implicit_intent_sensitive", "Sensitive data is not sent via implicit intents"],
  ["android_x_webview_js_enabled", "WebView JavaScript is not enabled for remote content"],
  ["android_x_webview_js_interface", "No JavaScript interface is exposed to remote content"],
  ["android_x_webview_file_access", "WebView file access is disabled"],
  ["android_x_sql_raw_query", "Database queries are parameterised"],
  ["android_x_external_storage", "Sensitive files are not written to shared storage"],
  ["android_x_screenshot_flag", "Sensitive screens set FLAG_SECURE"],
  ["android_x_root_debug_detection", "Release builds do not ship debug-only escape hatches"],
  ["android_x_signing_config_committed", "Signing credentials are not committed"],
  ["android_x_app_bundle", "The project builds an Android App Bundle"],
  ["android_x_strict_mode", "StrictMode is not enabled in release builds"],
];

export const ANDROID_EXTENDED_KEYS: string[] = CATALOGUE.map(([k]) => k);

export function evaluateAndroidExtendedChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const ctx = buildCtx(snapshot);
  const checks: PulseScanCheckInput[] = [];
  const soundAbsence = ctx.coverage >= SOUND_ABSENCE_COVERAGE;

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
              `Only ${ctx.sampled} of ${ctx.total} Kotlin/Java files were read, so the absence of this pattern is ` +
              "not established.",
          }
        : {}),
      detail,
    });
  };

  if (!ctx.manifest && ctx.total === 0) {
    for (const [key, label] of CATALOGUE) {
      checks.push({
        category: CATEGORIES.APP_STORE,
        checkKey: key,
        label,
        status: "SKIPPED",
        confidence: "HIGH",
        detail: "No Android manifest or JVM source was found, so the extended Android family did not run.",
      });
    }
    return checks;
  }

  // ── Backup ─────────────────────────────────────────────────────────────────
  const allowBackup = /android:allowBackup\s*=\s*"true"/i.test(ctx.manifest);
  const backupDisabled = /android:allowBackup\s*=\s*"false"/i.test(ctx.manifest);
  add(
    "android_x_allow_backup",
    "Application data is not silently backed up off-device",
    backupDisabled ? "PASS" : allowBackup ? "WARN" : "WARN",
    backupDisabled
      ? "android:allowBackup is false, so the app's private data is not copied into Google's backup service or " +
        "extractable over adb."
      : "android:allowBackup is enabled (explicitly, or by default — it defaults to true). The app's entire private " +
        "data directory is copied to Google Drive and can be pulled off a debuggable device with `adb backup`. " +
        "Anything the app stores locally — session tokens, cached personal data, a local database — travels with it.",
  );

  const backupRules = /android:(fullBackupContent|dataExtractionRules)\s*=/i.test(ctx.manifest);
  add(
    "android_x_backup_rules",
    "Backup rules exclude credentials and databases",
    backupDisabled ? "SKIPPED" : backupRules ? "PASS" : "WARN",
    backupDisabled
      ? "Backup is disabled entirely, so there are no backup rules to write."
      : backupRules
        ? "The manifest points at explicit backup rules, so what leaves the device is a deliberate list rather than " +
          "everything."
        : "Backup is enabled with no fullBackupContent or dataExtractionRules, so the default is to back up " +
          "everything in the app's private directory. Declare an exclusion list covering shared preferences holding " +
          "tokens and any local database.",
  );

  // ── Release build configuration ────────────────────────────────────────────
  const minify = /minifyEnabled\s+true|isMinifyEnabled\s*=\s*true/i.test(ctx.gradle);
  add(
    "android_x_code_shrinking",
    "Release builds are minified and obfuscated",
    !ctx.gradle ? "SKIPPED" : minify ? "PASS" : "WARN",
    !ctx.gradle
      ? "No Gradle build file was read, so build configuration could not be inspected."
      : minify
        ? "Release builds enable code shrinking, so the shipped APK is minified and obfuscated by R8."
        : "minifyEnabled is not set for release builds. The APK ships with original class, method and field names, " +
          "so decompiling it produces near-readable source — including the names of your API endpoints, feature " +
          "flags and any hardcoded logic. It is also a straight size increase for users.",
  );

  const shrinkRes = /shrinkResources\s+true|isShrinkResources\s*=\s*true/i.test(ctx.gradle);
  add(
    "android_x_resource_shrinking",
    "Release builds shrink unused resources",
    !ctx.gradle ? "SKIPPED" : shrinkRes ? "PASS" : minify ? "WARN" : "SKIPPED",
    !ctx.gradle
      ? "No Gradle build file was read."
      : shrinkRes
        ? "Unused resources are stripped from release builds."
        : minify
          ? "Code shrinking is on but shrinkResources is not, so unused drawables, layouts and strings — including " +
            "everything pulled in transitively by libraries — still ship. On a media-heavy app this is usually the " +
            "largest single download-size saving available."
          : "Resource shrinking requires code shrinking, which is not enabled — so this is reported against the " +
            "minification finding rather than separately.",
  );

  // ── Intents ────────────────────────────────────────────────────────────────
  const pendingIntents = /PendingIntent\.(getActivity|getBroadcast|getService)/.test(ctx.source);
  const immutable = /FLAG_IMMUTABLE/.test(ctx.source);
  add(
    "android_x_pending_intent_mutable",
    "PendingIntents are explicitly immutable",
    !pendingIntents ? "SKIPPED" : immutable ? "PASS" : "FAIL",
    !pendingIntents
      ? "The sampled source creates no PendingIntents."
      : immutable
        ? "PendingIntents specify FLAG_IMMUTABLE, so another app cannot alter the wrapped intent before it is sent."
        : "PendingIntents are created without FLAG_IMMUTABLE. A mutable PendingIntent handed to another app can have " +
          "its fields rewritten and then fired with YOUR app's identity and permissions. Targeting API 31+ makes one " +
          "of FLAG_IMMUTABLE or FLAG_MUTABLE mandatory, so this also fails to build against a current target SDK.",
    { absence: true },
  );

  const implicitSensitive =
    /Intent\(\s*Intent\.ACTION_(SEND|VIEW)/.test(ctx.source) && /token|password|secret|auth/i.test(ctx.source);
  add(
    "android_x_implicit_intent_sensitive",
    "Sensitive data is not sent via implicit intents",
    implicitSensitive ? "WARN" : "PASS",
    implicitSensitive
      ? "The sampled source builds implicit intents (ACTION_SEND / ACTION_VIEW) and also handles tokens or " +
        "credentials. An implicit intent is delivered to whichever app the user picks — or, for a broadcast, to " +
        "every app registered for that action. Use an explicit component when the payload is sensitive."
      : "No implicit intent was found carrying obviously sensitive data.",
  );

  // ── WebView ────────────────────────────────────────────────────────────────
  const usesWebView = /WebView|webViewClient/i.test(ctx.source);
  const jsEnabled = /javaScriptEnabled\s*=\s*true|setJavaScriptEnabled\(true\)/.test(ctx.source);
  const loadsRemote = /loadUrl\(\s*"https?:/.test(ctx.source);
  add(
    "android_x_webview_js_enabled",
    "WebView JavaScript is not enabled for remote content",
    !usesWebView ? "SKIPPED" : jsEnabled && loadsRemote ? "WARN" : "PASS",
    !usesWebView
      ? "The sampled source contains no WebView."
      : jsEnabled && loadsRemote
        ? "JavaScript is enabled on a WebView that loads remote URLs. That is often necessary, but it means any " +
          "script the remote page pulls in — an ad network, an analytics tag, a compromised CDN — executes inside " +
          "your app's WebView. Restrict which origins can load, and never combine this with a JavaScript interface."
        : "The WebView either does not enable JavaScript or does not load remote content.",
  );

  const jsInterface = /addJavascriptInterface\(/.test(ctx.source);
  add(
    "android_x_webview_js_interface",
    "No JavaScript interface is exposed to remote content",
    !usesWebView ? "SKIPPED" : jsInterface && loadsRemote ? "FAIL" : "PASS",
    !usesWebView
      ? "The sampled source contains no WebView."
      : jsInterface && loadsRemote
        ? "addJavascriptInterface is called on a WebView that loads remote content. Every @JavascriptInterface method " +
          "becomes callable by any script on the loaded page, giving remote JavaScript a direct route into native " +
          "code with the app's own permissions."
        : "No JavaScript bridge is exposed to remotely-loaded content.",
  );

  const webViewFile = /setAllowFileAccess\(true\)|setAllowUniversalAccessFromFileURLs\(true\)|setAllowFileAccessFromFileURLs\(true\)/.test(
    ctx.source,
  );
  add(
    "android_x_webview_file_access",
    "WebView file access is disabled",
    !usesWebView ? "SKIPPED" : webViewFile ? "FAIL" : "PASS",
    !usesWebView
      ? "The sampled source contains no WebView."
      : webViewFile
        ? "The WebView enables file access. Combined with any content injection this lets a page read files out of " +
          "the app's private storage — the standard route from an XSS in a WebView to reading the app's session " +
          "tokens off disk."
        : "WebView file access is not enabled.",
  );

  // ── Data handling ──────────────────────────────────────────────────────────
  const rawQuery = /rawQuery\(\s*"[^"]*"\s*\+|execSQL\(\s*"[^"]*"\s*\+|rawQuery\(\s*'[^']*'\s*\+/.test(ctx.source);
  add(
    "android_x_sql_raw_query",
    "Database queries are parameterised",
    rawQuery ? "FAIL" : "PASS",
    rawQuery
      ? "A SQLite query is built by string concatenation (`rawQuery(\"… \" + value)`). Any value reaching it that " +
        "contains a quote changes the query's meaning — the local database is a smaller target than a server one, " +
        "but it usually holds exactly the personal data the app cached."
      : "No SQL string concatenation was found in the sampled source.",
  );

  const externalStorage = /getExternalStorageDirectory|Environment\.getExternalStoragePublicDirectory|MediaStore\.Downloads/.test(
    ctx.source,
  );
  add(
    "android_x_external_storage",
    "Sensitive files are not written to shared storage",
    !externalStorage ? "PASS" : "WARN",
    !externalStorage
      ? "The app does not write to shared external storage."
      : "The app writes to shared external storage. Files there are readable by other apps and survive uninstall, " +
        "and the APIs used are the ones scoped storage restricted from Android 10 onward — so this is both an " +
        "exposure and a forward-compatibility problem. Use the app-specific directory for anything private.",
  );

  const flagSecure = /FLAG_SECURE/.test(ctx.source);
  const sensitiveUi = /password|card|cvv|otp|token|balance|iban/i.test(ctx.source);
  add(
    "android_x_screenshot_flag",
    "Sensitive screens set FLAG_SECURE",
    !sensitiveUi ? "SKIPPED" : flagSecure ? "PASS" : "WARN",
    !sensitiveUi
      ? "The sampled source shows no obviously sensitive screens."
      : flagSecure
        ? "FLAG_SECURE is set, so sensitive screens are excluded from screenshots and the recents thumbnail."
        : "The app handles credentials or financial data but never sets FLAG_SECURE. Without it the OS captures a " +
          "thumbnail of the screen for the recents list, screenshots are permitted, and the screen is visible to " +
          "screen-recording and accessibility-based malware.",
    { absence: true },
  );

  const debugEscape = /BuildConfig\.DEBUG\s*\|\||isDebuggable\s*\|\|/.test(ctx.source);
  add(
    "android_x_root_debug_detection",
    "Release builds do not ship debug-only escape hatches",
    debugEscape ? "WARN" : "PASS",
    debugEscape
      ? "A `BuildConfig.DEBUG ||` guard was found. Written as an OR, the debug flag widens the condition rather than " +
        "restricting it — so whatever it protects is also reachable in release, which is the opposite of what the " +
        "author almost certainly meant."
      : "No inverted debug guard was found in the sampled source.",
  );

  const signingInGradle = /storePassword\s+["'][^"']+["']|keyPassword\s+["'][^"']+["']/.test(ctx.gradle);
  const signingInProps = /storePassword\s*=\s*\S|keyPassword\s*=\s*\S/.test(ctx.properties);
  add(
    "android_x_signing_config_committed",
    "Signing credentials are not committed",
    signingInGradle || signingInProps ? "FAIL" : "PASS",
    signingInGradle || signingInProps
      ? "A keystore or key password is written into a committed build file. Anyone with repository access can sign " +
        "an APK as your application — which Android treats as an update to the installed app, so a malicious build " +
        "can replace the real one on a sideloaded device. Rotate the key; removing the line leaves it in git history."
      : "No signing passwords were found in committed build configuration.",
  );

  const bundle = /bundle\s*\{|\.aab\b|bundleRelease/i.test(ctx.gradle);
  add(
    "android_x_app_bundle",
    "The project builds an Android App Bundle",
    !ctx.gradle ? "SKIPPED" : bundle ? "PASS" : "WARN",
    !ctx.gradle
      ? "No Gradle build file was read."
      : bundle
        ? "The project is configured for Android App Bundle output, which Play requires for new apps and updates."
        : "No App Bundle configuration was found. Play has required .aab rather than .apk for new applications since " +
          "August 2021, so an APK-only build cannot be published — and the bundle is also what lets Play ship each " +
          "device only the resources and native libraries it needs.",
  );

  const strictMode = /StrictMode\.setThreadPolicy|StrictMode\.setVmPolicy/.test(ctx.source);
  const strictGuarded = /if\s*\(\s*BuildConfig\.DEBUG\s*\)[\s\S]*?StrictMode/.test(ctx.source);
  add(
    "android_x_strict_mode",
    "StrictMode is not enabled in release builds",
    !strictMode ? "SKIPPED" : strictGuarded ? "PASS" : "WARN",
    !strictMode
      ? "StrictMode is not used in the sampled source."
      : strictGuarded
        ? "StrictMode is enabled behind a BuildConfig.DEBUG guard, so it does not run in release."
        : "StrictMode is configured without a debug guard. With a penalty of death it crashes production users on " +
          "the exact disk and network violations it is meant to surface during development; with logging it is " +
          "still a per-operation cost paid on every device.",
  );

  return checks;
}
