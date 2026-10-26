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
import { isVendoredPath } from "./native-mobile";
import {
  ANDROID_BUILD_LOGIC_PATH,
  androidBuildInputs,
  concatenatedSql,
  gradleToggleState,
  manifestAbsence,
  pendingIntentSites,
  resolvedTargetSdk,
  stripJvmFile,
  webViewFileAccess,
  type AndroidBuildInputs,
} from "./android-app";

const SOUND_ABSENCE_COVERAGE = 0.3;

interface Ctx {
  source: string;
  /** Per-file stripped source — for patterns that must hold WITHIN one file (a guard and what it guards). */
  sourceFiles: { path: string; text: string }[];
  sampled: number;
  total: number;
  manifest: string;
  gradle: string;
  properties: string;
  coverage: number;
  build: AndroidBuildInputs;
  /** App source that exists in the tree but was not read. */
  unreadSource: string[];
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

// concatenatedSql lives in android-app.ts so BOTH families judge SQL the same way.
export { concatenatedSql } from "./android-app";

function buildCtx(snapshot: RepoSnapshot): Ctx {
  const isAppSource = (p: string) => /\.(kt|java)$/i.test(p) && !isVendoredPath(p) && !ANDROID_BUILD_LOGIC_PATH.test(p);
  const sourceFiles: { path: string; text: string }[] = [];
  const properties: string[] = [];

  for (const [path, text] of snapshot.files) {
    // Strip per FILE by its own language (stripJvmFile): stripping the joined sample
    // let one unterminated comment delete every file after it.
    if (isAppSource(path)) sourceFiles.push({ path, text: stripJvmFile(path, text) });
    else if (/gradle\.properties$/i.test(path)) properties.push(text);
  }

  const allSource = snapshot.paths.filter(isAppSource);
  const build = androidBuildInputs(snapshot);
  return {
    source: sourceFiles.map((f) => f.text).join("\n"),
    sourceFiles,
    sampled: sourceFiles.length,
    total: allSource.length,
    manifest: build.manifest,
    gradle: build.gradle,
    properties: properties.join("\n"),
    coverage: allSource.length === 0 ? 0 : Math.min(1, sourceFiles.length / allSource.length),
    build,
    unreadSource: allSource.filter((p) => !snapshot.files.has(p)),
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

/** Implicit ACTION_SEND / ACTION_VIEW intents, each judged on its own statement window. */
export function implicitIntentSites(
  files: { path: string; text: string }[],
): { path: string; action: string; sensitive: boolean; what: string }[] {
  const out: { path: string; action: string; sensitive: boolean; what: string }[] = [];
  const SECRET = /(?:access|refresh|auth|bearer|id|session)[_-]?token|\btoken\b|password|passwd|secret|api[_-]?key|session[_-]?id/i;
  for (const f of files) {
    for (const m of f.text.matchAll(/\bIntent\s*\(\s*(?:Intent\.)?(ACTION_SEND(?:TO|_MULTIPLE)?|ACTION_VIEW)\b/g)) {
      const at = m.index ?? 0;
      // To the send call (or 600 chars): the extras and data set on THIS intent.
      const rest = f.text.slice(at, at + 600);
      const end = rest.search(/\b(?:startActivity|startActivityForResult|sendBroadcast|createChooser)\s*\(/);
      const window = end >= 0 ? rest.slice(0, end + 200) : rest;
      if (/\bsetPackage\s*\(|\bsetComponent\s*\(|\bsetClass(?:Name)?\s*\(/.test(window)) continue;
      const extras = [...window.matchAll(/putExtra\s*\(\s*([^,]+),\s*([^)\n]+)\)/g)].map((e) => `${e[1]} ${e[2]}`);
      const uriParams = [...window.matchAll(/[?&]([A-Za-z_]+)=|appendQueryParameter\s*\(\s*"([^"]+)"/g)].map((q) => q[1] ?? q[2]);
      const hit = [...extras, ...uriParams].find((v) => SECRET.test(v));
      out.push({ path: f.path, action: m[1], sensitive: Boolean(hit), what: hit ? hit.trim().slice(0, 60) : "" });
    }
  }
  return out;
}

export function evaluateAndroidExtendedChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const ctx = buildCtx(snapshot);
  const checks: PulseScanCheckInput[] = [];
  const soundAbsence = ctx.coverage >= SOUND_ABSENCE_COVERAGE;

  const add = (
    checkKey: string,
    label: string,
    status: PulseScanCheckInput["status"],
    detail: string,
    opts: { absence?: boolean; hint?: string | null } = {},
  ) => {
    const weak = opts.absence === true && (!soundAbsence || !!opts.hint) && status !== "PASS";
    // SKIPPED means "does not apply". Not finding something in a partial sample is
    // NOT that — it is "we did not see it", which is INCONCLUSIVE. SKIPPED stands
    // only when coverage is sound AND no unread file suggests otherwise (`hint`).
    const notSeen = weak && status === "SKIPPED";
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey,
      label,
      status: notSeen ? "INCONCLUSIVE" : status,
      confidence: weak ? "LOW" : "HIGH",
      ...(weak
        ? {
            confidenceReason:
              (opts.hint ? `${opts.hint} was not read, ` : `Only ${ctx.sampled} of ${ctx.total} Kotlin/Java files were read, `) +
              "so the absence of this pattern is not established.",
          }
        : {}),
      detail: notSeen
        ? `${detail.replace(/\.$/, "")}, but ${opts.hint ? `${opts.hint} was not read` : `only ${ctx.sampled} of ${ctx.total} Kotlin/Java files were read`} — so whether this applies is not established.`
        : detail,
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

  // A verdict resting on a manifest NOT declaring something — inconclusive when some manifests were not read.
  const manifestGated = (fn: () => void, holds: boolean) => {
    const before = checks.length;
    fn();
    if (!holds) checks[before] = manifestAbsence(ctx.build, checks[before]);
  };

  // ── Backup ─────────────────────────────────────────────────────────────────
  const allowBackup = /android:allowBackup\s*=\s*"true"/i.test(ctx.manifest);
  const backupDisabled = /android:allowBackup\s*=\s*"false"/i.test(ctx.manifest);
  manifestGated(() => add(
    "android_x_allow_backup",
    "Application data is not silently backed up off-device",
    backupDisabled ? "PASS" : allowBackup ? "WARN" : "WARN",
    backupDisabled
      ? "android:allowBackup is false, so the app's private data is not copied into Google's backup service or " +
        "extractable over adb."
      : "android:allowBackup is enabled (explicitly, or by default — it defaults to true). The app's entire private " +
        "data directory is copied to Google Drive and can be pulled off a debuggable device with `adb backup`. " +
        "Anything the app stores locally — session tokens, cached personal data, a local database — travels with it.",
  ), backupDisabled);

  const backupRules = /android:(fullBackupContent|dataExtractionRules)\s*=/i.test(ctx.manifest);
  manifestGated(() => add(
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
  ), backupDisabled || backupRules);

  // ── Release build configuration ────────────────────────────────────────────
  // One predicate for both families (gradleToggleState). thunderbird's
  // `isMinifyEnabled = !isCI.get()` is a computed value — it was WARN HIGH here and
  // LOW in the base family; it is now INCONCLUSIVE in both.
  const minifyState = gradleToggleState(ctx.gradle, "minify");
  const shrinkState = gradleToggleState(ctx.gradle, "shrinkResources");
  const minify = minifyState === "on";
  const minifyUnknown = minifyState === "computed" || (minifyState === "unset" && ctx.build.gradleCoverage < 1);
  if (!ctx.gradle) {
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "android_x_code_shrinking",
      label: "Release builds are minified and obfuscated",
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail: "No Gradle build file was read, so build configuration could not be inspected.",
    });
  } else if (minifyUnknown) {
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "android_x_code_shrinking",
      label: "Release builds are minified and obfuscated",
      status: "INCONCLUSIVE",
      confidence: "LOW",
      detail:
        minifyState === "computed"
          ? "Release minification is set from a build-time expression that cannot be evaluated from source, so " +
            "whether R8 runs for release builds is not established — check the value the release build resolves."
          : "minifyEnabled was not found in the build files that were read, and some build files were not read, so " +
            "whether release builds are minified is not established.",
    });
  } else {
    add(
      "android_x_code_shrinking",
      "Release builds are minified and obfuscated",
      minify ? "PASS" : "WARN",
      minify
        ? "Release builds enable code shrinking, so the shipped APK is minified and obfuscated by R8."
        : "minifyEnabled is not set for release builds. The APK ships with original class, method and field names, " +
          "so decompiling it produces near-readable source — including the names of your API endpoints, feature " +
          "flags and any hardcoded logic. It is also a straight size increase for users.",
    );
  }

  // "Code shrinking not enabled" was reported (SKIPPED) when it was in fact computed;
  // when either value cannot be evaluated, this is not established.
  const shrinkRes = shrinkState === "on";
  if (!ctx.gradle || minifyUnknown || shrinkState === "computed") {
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "android_x_resource_shrinking",
      label: "Release builds shrink unused resources",
      status: shrinkRes && minify ? "PASS" : "INCONCLUSIVE",
      confidence: shrinkRes && minify ? "HIGH" : "LOW",
      detail: !ctx.gradle
        ? "No Gradle build file was read."
        : shrinkRes && minify
          ? "Unused resources are stripped from release builds."
          : "Whether release builds shrink resources depends on build-time values that cannot be evaluated from " +
            "source (code shrinking and/or shrinkResources are computed), so this is not established.",
    });
  } else {
    add(
      "android_x_resource_shrinking",
      "Release builds shrink unused resources",
      shrinkRes ? "PASS" : minify ? "WARN" : "SKIPPED",
      shrinkRes
        ? "Unused resources are stripped from release builds."
        : minify
          ? "Code shrinking is on but shrinkResources is not, so unused drawables, layouts and strings — including " +
            "everything pulled in transitively by libraries — still ship. On a media-heavy app this is usually the " +
            "largest single download-size saving available."
          : "Resource shrinking requires code shrinking, which is not enabled — so this is reported against the " +
            "minification finding rather than separately.",
    );
  }

  // ── Intents ────────────────────────────────────────────────────────────────
  // PendingIntentCompat states mutability in its last argument (pendingIntentSites).
  const sites = pendingIntentSites(ctx.source);
  const pendingIntents = sites.count > 0;
  const immutable = sites.immutable;
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

  // Judged per intent, in its own file: an implicit ACTION_SEND / ACTION_VIEW intent
  // whose extras or URI carry a credential. Two unrelated whole-codebase tests (any
  // share button, plus the word "auth" anywhere: author, FileProvider authorities)
  // warned almost every app.
  const implicitSites = implicitIntentSites(ctx.sourceFiles);
  const sensitiveIntent = implicitSites.find((s) => s.sensitive);
  if (implicitSites.length === 0) {
    add(
      "android_x_implicit_intent_sensitive",
      "Sensitive data is not sent via implicit intents",
      "SKIPPED",
      "The sampled source builds no implicit ACTION_SEND or ACTION_VIEW intents.",
      { absence: true },
    );
  } else {
    add(
      "android_x_implicit_intent_sensitive",
      "Sensitive data is not sent via implicit intents",
      sensitiveIntent ? "WARN" : "PASS",
      sensitiveIntent
        ? `An implicit ${sensitiveIntent.action} intent in ${sensitiveIntent.path} carries a credential-named value ` +
          `(${sensitiveIntent.what}). An implicit intent is delivered to whichever app the user picks, or any app ` +
          "registered for that action, so the value leaves your app. Use an explicit component, or send a link that " +
          "does not contain the credential."
        : `${implicitSites.length} implicit ACTION_SEND / ACTION_VIEW intent(s) found; none carries an extra or URI ` +
          "parameter named as a token, password or secret.",
    );
  }

  // ── WebView ────────────────────────────────────────────────────────────────
  const usesWebView = /WebView|webViewClient/i.test(ctx.source);
  // thunderbird's legacy/.../MessageWebView.kt was unread, and "no WebView" was SKIPPED HIGH.
  const unreadWebView = ctx.unreadSource.find((p) => /webview/i.test(p.split("/").pop() ?? ""));
  // Only "no WebView" is an absence; a finding about a WebView we saw is presence, sound on any sample.
  const webViewOpts = usesWebView ? {} : { absence: true, hint: unreadWebView ? `\`${unreadWebView}\`` : null };
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
    webViewOpts,
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
    webViewOpts,
  );

  // Both spellings (webViewFileAccess): the Kotlin property `settings.allowFileAccess = true`
  // is the dominant style and was not matched.
  const access = webViewFileAccess(ctx.source);
  const webViewFile = access.file || access.fileUrls || access.universal;
  // allowFileAccess defaults to TRUE below API 30, so "no enable call" is only "disabled"
  // when it is switched off explicitly or the app targets 30 or later.
  const target = resolvedTargetSdk(ctx.build);
  const fileDefaultOff = access.fileOff || (target !== null && target >= 30);
  if (usesWebView && !webViewFile && !fileDefaultOff) {
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "android_x_webview_file_access",
      label: "WebView file access is disabled",
      status: target !== null ? "WARN" : "INCONCLUSIVE",
      confidence: target !== null ? "HIGH" : "LOW",
      detail: target !== null
        ? `WebView file access is never switched off, and the app targets API ${target}. Below API 30 ` +
          "`allowFileAccess` defaults to true, so the WebView can load `file://` URLs. Set it to false explicitly."
        : "WebView file access is not switched on in the sampled source, but the app's targetSdk could not be read. " +
          "`allowFileAccess` defaults to true below API 30, so whether it is off is not established.",
    });
  } else {
    add(
      "android_x_webview_file_access",
      "WebView file access is disabled",
      !usesWebView ? "SKIPPED" : webViewFile ? "FAIL" : "PASS",
      !usesWebView
        ? "The sampled source contains no WebView."
        : webViewFile
          ? "The WebView enables file access. Combined with any content injection this lets a page read files out of " +
            "the app's private storage: the standard route from an XSS in a WebView to reading the app's session " +
            "tokens off disk."
          : access.fileOff
            ? "WebView file access is switched off explicitly."
            : `WebView file access is not switched on, and the app targets API ${target}, where it defaults to off.`,
      webViewOpts,
    );
  }

  // ── Data handling ──────────────────────────────────────────────────────────
  const rawQuery = concatenatedSql(ctx.source);
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
      ? "The sampled source does not use shared external storage APIs."
      : "The app uses shared external storage locations (getExternalStorageDirectory, a public directory or " +
        "MediaStore.Downloads). Files there are readable by other apps and survive uninstall, and the legacy path " +
        "APIs are the ones scoped storage restricted from Android 10 onward. That is expected for user-facing files " +
        "such as downloads or exports; make sure nothing private — tokens, cached personal data, databases — goes there.",
  );

  const flagSecure = /FLAG_SECURE/.test(ctx.source);
  // Signals of a credential or payment ENTRY screen. Bare words matched Compose `Card`, `&token=` in image URLs
  // and YouTube PoTokens, so news readers and video players were told they "handle credentials or financial data".
  // Layout XML is not in ctx.source, so View-based password fields are recognised by their id / binding name.
  const sensitiveUi =
    /PasswordVisualTransformation|PasswordTransformationMethod|KeyboardType\.(?:Number)?Password|TYPE_(?:TEXT|NUMBER)_VARIATION_PASSWORD|inputType\s*=\s*[^\n]*[Pp]assword|(?:R\.id|\bbinding)\.\w*(?:password|passcode|cvv|cvc|iban|card_?number)|\b\w*password(?:EditText|Input|Field|TextField|InputLayout|Layout|View)\b|CardInputWidget|CardMultilineWidget|CardNumberEditText|CardFormView|PaymentSheet|\b(?:cvv|cvc|iban)\b|\botp(?:Code|Input|Field|View|EditText)?\b|card_?number/i.test(
      ctx.source,
    );
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

  // `!BuildConfig.DEBUG || x` is TRUE in release, so it restricts (e.g. `isGone = !BuildConfig.DEBUG || !isPresent`)
  // and is not the widening OR this check is about.
  const debugEscape = /(?<!!\s*)BuildConfig\.DEBUG\s*\|\||(?<!!\s*)isDebuggable\s*\|\|/.test(ctx.source);
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
  // The guard must precede StrictMode IN THE SAME FILE — across the joined sample a
  // debug check in one file "guarded" StrictMode in another. `isDebuggable()` /
  // FLAG_DEBUGGABLE is the same guard as BuildConfig.DEBUG (nowinandroid uses it).
  const DEBUG_GUARD = /if\s*\(\s*(?:BuildConfig\.DEBUG|[\w.]*isDebuggable\w*(?:\(\))?|[\w.]*isDebugBuild\w*(?:\(\))?|[^)\n]*FLAG_DEBUGGABLE[^)\n]*)\s*\)/;
  const strictFiles = ctx.sourceFiles.filter((f) => /StrictMode\.set(?:Thread|Vm)Policy/.test(f.text));
  const strictGuarded =
    strictFiles.length > 0 &&
    strictFiles.every((f) => {
      const at = f.text.search(/StrictMode\.set(?:Thread|Vm)Policy/);
      const guard = DEBUG_GUARD.exec(f.text);
      return guard !== null && guard.index < at;
    });
  // StrictMode is set up in the Application subclass by convention, so "not used"
  // is not established while the class the manifest names was not read
  // (nowinandroid: NiaApplication.kt).
  const appClass = /<application\b[^>]*android:name\s*=\s*"([\w.$]+)"/i.exec(ctx.manifest)?.[1]?.split(".").pop();
  const unreadAppClass = appClass
    ? ctx.unreadSource.find((p) => (p.split("/").pop() ?? "").replace(/\.(kt|java)$/i, "") === appClass)
    : undefined;
  add(
    "android_x_strict_mode",
    "StrictMode is not enabled in release builds",
    !strictMode ? "SKIPPED" : strictGuarded ? "PASS" : "WARN",
    !strictMode
      ? "StrictMode is not used in the sampled source."
      : strictGuarded
        ? "StrictMode is enabled behind a debug-build guard, so it does not run in release."
        : "StrictMode is configured without a debug guard. With a penalty of death it crashes production users on " +
          "the exact disk and network violations it is meant to surface during development; with logging it is " +
          "still a per-operation cost paid on every device.",
    { absence: !strictMode, hint: !strictMode && unreadAppClass ? `the Application class \`${unreadAppClass}\`` : null },
  );

  return checks;
}
