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
import { isVendoredPath, stripCStyleComments } from "./native-mobile";

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
    coverage: sourcePaths.length === 0 ? 0 : Math.min(1, read.length / sourcePaths.length),
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
  checks.push(...secretsChecks(ctx));
  checks.push(...storeReadinessChecks(ctx));
  checks.push(...qualityChecks(ctx));

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
function secretsChecks(ctx: AndroidContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Tokens in SharedPreferences. The exact inversion found across this client's
  // iOS and Flutter apps: a secure store exists in the project and the tokens are
  // not in it.
  const TOKEN_KEY = /("[^"]*(?:access|refresh|auth|bearer|id)_?token[^"]*"|\b(?:access|refresh|auth)Token\b)/i;
  const usesPrefs = /getSharedPreferences\s*\(|PreferenceManager\.|\bdataStore\b/i.test(ctx.source);
  const usesEncrypted = /EncryptedSharedPreferences|MasterKeys?\.|androidx\.security/i.test(ctx.source + ctx.gradle);
  const tokenNearPrefs = usesPrefs && TOKEN_KEY.test(ctx.source);

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
  if (/"[^"]*password[^"]*"\s*(,|\))/i.test(ctx.source) && usesPrefs) {
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
