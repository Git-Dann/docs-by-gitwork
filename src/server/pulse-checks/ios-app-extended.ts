// ─────────────────────────────────────────────────────────────────────────────
// iOS — SECOND FAMILY. Depth on top of ios-app.ts's 39 checks.
//
// ios-app.ts was written from a hand review of one shipping client app, so it
// covers what that review found: credential logging, Keychain vs UserDefaults,
// ATS, privacy manifest, Dynamic Type, caching. This file covers the things that
// review did not reach — App Store review rejections, data-protection classes,
// modern concurrency, and the build settings that decide whether a crash report
// is readable.
//
// Same evidence discipline as ios-app.ts and for the same reason: Swift sources
// are SAMPLED. A "we found X" finding is sound on a sample; a "there is no X
// anywhere" finding is not, so absence checks declare LOW confidence when coverage
// is thin and drop out of scoring rather than inventing a failure.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";

/** Below this share of Swift files read, an absence finding is not sound. */
const SOUND_ABSENCE_COVERAGE = 0.3;

interface Ctx {
  /** Sampled Swift source with comments stripped. */
  swift: string;
  /** Sampled Swift source as written, for signals that live in comments. */
  swiftRaw: string;
  swiftFileCount: number;
  totalSwiftFiles: number;
  plists: string;
  entitlements: string;
  pbxproj: string;
  packageManifests: string;
  coverage: number;
}

/**
 * Strip Swift comments while preserving string literals.
 *
 * ⚠️ The literal guard is load-bearing, not defensive. A URL contains `//`, so
 * naive stripping truncates `"https://api.example.com/v1"` mid-value and every
 * check that reads a URL silently stops matching. This cost a real finding in the
 * first cut of the Flutter family (CLAUDE.md §34.6).
 */
export function stripSwiftComments(source: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (inString) {
      if (source[i] === "\\") {
        out += source.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (source[i] === '"') inString = false;
      out += source[i++];
      continue;
    }
    if (source[i] === '"') {
      inString = true;
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
  const swiftRawParts: string[] = [];
  const plists: string[] = [];
  const entitlements: string[] = [];
  const pbxproj: string[] = [];
  const manifests: string[] = [];
  let swiftFileCount = 0;

  for (const [path, text] of snapshot.files) {
    if (/\.swift$/i.test(path)) {
      swiftRawParts.push(text);
      swiftFileCount++;
    } else if (/\.plist$/i.test(path)) plists.push(text);
    else if (/\.entitlements$/i.test(path)) entitlements.push(text);
    else if (/project\.pbxproj$/i.test(path)) pbxproj.push(text);
    else if (/(Package\.swift|Podfile)$/i.test(path)) manifests.push(text);
  }

  const totalSwiftFiles = snapshot.paths.filter((p) => /\.swift$/i.test(p)).length;
  const swiftRaw = swiftRawParts.join("\n");
  return {
    swift: stripSwiftComments(swiftRaw),
    swiftRaw,
    swiftFileCount,
    totalSwiftFiles,
    plists: plists.join("\n"),
    entitlements: entitlements.join("\n"),
    pbxproj: pbxproj.join("\n"),
    packageManifests: manifests.join("\n"),
    coverage: totalSwiftFiles === 0 ? 0 : swiftFileCount / totalSwiftFiles,
  };
}

const CATALOGUE: [string, string][] = [
  ["ios_x_data_protection", "Files are written with a data-protection class"],
  ["ios_x_biometric_fallback", "Biometric authentication is backed by a device-passcode fallback"],
  ["ios_x_pasteboard_sensitive", "Sensitive values are not written to the general pasteboard"],
  ["ios_x_screenshot_redaction", "Sensitive screens are hidden from the app switcher snapshot"],
  ["ios_x_webview_js_bridge", "WKWebView does not expose a native bridge to remote content"],
  ["ios_x_webview_file_access", "WKWebView does not grant remote content file access"],
  ["ios_x_url_scheme_validation", "Incoming deep links are validated before use"],
  ["ios_x_background_task_expiry", "Background tasks register an expiry handler"],
  ["ios_x_main_thread_io", "Networking is not performed synchronously on the main thread"],
  ["ios_x_strong_reference_cycles", "Escaping closures capture self weakly"],
  ["ios_x_crash_symbols", "Debug symbols are produced for crash reports"],
  ["ios_x_bitcode_deprecated", "The project does not still enable the removed Bitcode setting"],
  ["ios_x_swift_concurrency", "The project adopts structured concurrency rather than raw callbacks"],
  ["ios_x_deployment_target", "The deployment target is a currently-supported iOS version"],
  ["ios_x_localised_strings", "User-facing strings are localisable"],
  ["ios_x_encryption_declaration", "The export-compliance key is declared"],
];

export const IOS_EXTENDED_KEYS: string[] = CATALOGUE.map(([k]) => k);

export function evaluateIosExtendedChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const ctx = buildCtx(snapshot);
  const checks: PulseScanCheckInput[] = [];
  const soundAbsence = ctx.coverage >= SOUND_ABSENCE_COVERAGE;

  const add = (
    checkKey: string,
    label: string,
    status: PulseScanCheckInput["status"],
    detail: string,
    opts: { absence?: boolean; evidence?: string } = {},
  ) => {
    // An "absence" finding on a thin sample is not evidence. Declaring LOW here is
    // what stops a partial read inventing a failure — score-breakdown.ts drops it.
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
              `Only ${ctx.swiftFileCount} of ${ctx.totalSwiftFiles} Swift files were read, so the absence of this ` +
              "pattern is not established — it may simply sit outside the sample.",
          }
        : {}),
      detail,
      ...(opts.evidence ? { evidence: opts.evidence } : {}),
    });
  };

  if (ctx.totalSwiftFiles === 0) {
    for (const [key, label] of CATALOGUE) {
      checks.push({
        category: CATEGORIES.APP_STORE,
        checkKey: key,
        label,
        status: "SKIPPED",
        confidence: "HIGH",
        detail: "No Swift source was found in this repository, so the extended iOS family did not run.",
      });
    }
    return checks;
  }

  // ── Data at rest ───────────────────────────────────────────────────────────
  const writesFiles = /\.write\(to:|FileManager\.default\.createFile|Data\(contentsOf:/.test(ctx.swift);
  const hasProtection = /NSFileProtection|\.completeUnlessOpen|\.completeUntilFirstUserAuthentication|\.complete\b/.test(
    ctx.swift,
  );
  add(
    "ios_x_data_protection",
    "Files are written with a data-protection class",
    !writesFiles ? "SKIPPED" : hasProtection ? "PASS" : "WARN",
    !writesFiles
      ? "The sampled source does not write files to disk, so there is no data-protection class to set."
      : hasProtection
        ? "File writes specify a data-protection class, so their contents are encrypted while the device is locked."
        : "The app writes files to disk without specifying an NSFileProtection class. The default " +
          "(completeUntilFirstUserAuthentication) leaves data readable from the moment the device is first unlocked " +
          "after boot — including by a forensic extraction of a locked, powered-on phone. Anything personal or " +
          "financial should be written with .complete.",
    { absence: true },
  );

  const usesBiometrics = /LAContext|LocalAuthentication|\.biometryAny|evaluatePolicy/.test(ctx.swift);
  const hasFallback = /deviceOwnerAuthentication\b|\.deviceOwnerAuthentication[^W]/.test(ctx.swift);
  add(
    "ios_x_biometric_fallback",
    "Biometric authentication is backed by a device-passcode fallback",
    !usesBiometrics ? "SKIPPED" : hasFallback ? "PASS" : "WARN",
    !usesBiometrics
      ? "The sampled source does not use LocalAuthentication, so there is no biometric policy to grade."
      : hasFallback
        ? "Biometric prompts fall back to the device passcode, so a user whose Face ID fails — or who has it " +
          "disabled — can still authenticate."
        : "Biometric authentication uses deviceOwnerAuthenticationWithBiometrics with no passcode fallback. Face ID " +
          "and Touch ID lock out after five failed attempts and are unavailable to users who have not enrolled, so " +
          "this locks a real share of users out of the app entirely with no route back in.",
    { absence: true },
  );

  const pasteboard = /UIPasteboard\.general\.string\s*=/.test(ctx.swift);
  const sensitiveNearby = /password|token|secret|card|cvv|iban|account/i.test(ctx.swift);
  add(
    "ios_x_pasteboard_sensitive",
    "Sensitive values are not written to the general pasteboard",
    !pasteboard ? "PASS" : sensitiveNearby ? "WARN" : "PASS",
    !pasteboard
      ? "The app does not write to the general pasteboard."
      : sensitiveNearby
        ? "The app writes to UIPasteboard.general and the sampled source also handles credentials or card data. The " +
          "general pasteboard is readable by every other app on the device and, with Universal Clipboard, syncs to " +
          "the user's other devices. If a copied value is a password or card number, set " +
          "`UIPasteboard.general.setItems(_:options:)` with an expiry and `.localOnly`."
        : "Pasteboard writes were found but the sampled source shows no sensitive values being copied.",
  );

  const hidesSnapshot = /applicationWillResignActive|sceneWillResignActive|willResignActiveNotification/.test(ctx.swift);
  add(
    "ios_x_screenshot_redaction",
    "Sensitive screens are hidden from the app switcher snapshot",
    !sensitiveNearby ? "SKIPPED" : hidesSnapshot ? "PASS" : "WARN",
    !sensitiveNearby
      ? "The sampled source shows no obviously sensitive screens, so app-switcher redaction is not required."
      : hidesSnapshot
        ? "The app responds to resign-active, which is where a snapshot overlay is installed to keep sensitive " +
          "content out of the app-switcher thumbnail."
        : "iOS captures a screenshot of the app whenever it moves to the background, and stores it unencrypted for " +
          "the app-switcher. The sampled source handles credentials or financial data but never responds to " +
          "willResignActive, so whatever is on screen at that moment — a balance, a card number, a one-time code — " +
          "is written to disk as an image.",
    { absence: true },
  );

  // ── WebView ────────────────────────────────────────────────────────────────
  const usesWebView = /WKWebView|UIWebView/.test(ctx.swift);
  const bridge = /addScriptMessageHandler|WKScriptMessageHandler|userContentController\.add\(/.test(ctx.swift);
  const loadsRemote = /load\(URLRequest\(url:\s*URL\(string:\s*"https?:/.test(ctx.swift);
  add(
    "ios_x_webview_js_bridge",
    "WKWebView does not expose a native bridge to remote content",
    !usesWebView ? "SKIPPED" : bridge && loadsRemote ? "WARN" : "PASS",
    !usesWebView
      ? "The sampled source contains no web view."
      : bridge && loadsRemote
        ? "A WKWebView registers a native script-message handler and also loads remote URLs. Every message handler " +
          "is callable by any JavaScript running in that view — including script injected through a compromised CDN, " +
          "an ad, or a redirect. Scope the bridge to locally-bundled content, or validate the frame's origin inside " +
          "the handler before acting."
        : "The web view either exposes no native bridge or does not load remote content.",
  );

  const fileAccess = /allowFileAccessFromFileURLs|allowUniversalAccessFromFileURLs/.test(ctx.swift);
  add(
    "ios_x_webview_file_access",
    "WKWebView does not grant remote content file access",
    !usesWebView ? "SKIPPED" : fileAccess ? "FAIL" : "PASS",
    !usesWebView
      ? "The sampled source contains no web view."
      : fileAccess
        ? "The web view enables allowFileAccessFromFileURLs or allowUniversalAccessFromFileURLs. These are private " +
          "WebKit preferences that let content loaded from a file:// URL read arbitrary files in the app's " +
          "container and issue cross-origin requests — turning a single script injection into full access to the " +
          "app's stored data."
        : "The web view does not enable file or universal access for its content.",
  );

  const handlesUrls = /func application\([^)]*open url|onOpenURL|NSUserActivity/.test(ctx.swift);
  const validatesUrls = /url\.host\s*==|guard let host|components\.host|verifyHost|allowedHosts/.test(ctx.swift);
  add(
    "ios_x_url_scheme_validation",
    "Incoming deep links are validated before use",
    !handlesUrls ? "SKIPPED" : validatesUrls ? "PASS" : "WARN",
    !handlesUrls
      ? "The sampled source does not handle incoming URLs or user activities."
      : validatesUrls
        ? "Incoming URLs are inspected before being acted on."
        : "The app handles incoming URLs but the sampled source shows no validation of their host or parameters. A " +
          "custom URL scheme can be opened by any app on the device, and any web page can trigger one, so a deep " +
          "link is untrusted input — the same class of input as a query string on a public endpoint.",
    { absence: true },
  );

  // ── Runtime behaviour ──────────────────────────────────────────────────────
  const bgTask = /beginBackgroundTask/.test(ctx.swift);
  const bgExpiry = /expirationHandler|withExpirationHandler|endBackgroundTask/.test(ctx.swift);
  add(
    "ios_x_background_task_expiry",
    "Background tasks register an expiry handler",
    !bgTask ? "SKIPPED" : bgExpiry ? "PASS" : "WARN",
    !bgTask
      ? "The sampled source starts no background tasks."
      : bgExpiry
        ? "Background tasks provide an expiry handler and end their task assertion."
        : "beginBackgroundTask is called without an expiration handler. When the time allowance runs out iOS kills " +
          "the app outright rather than suspending it, which the user sees as a crash and which counts against the " +
          "app's crash rate in App Store Connect.",
    { absence: true },
  );

  const syncNetwork = /Data\(contentsOf:\s*URL|String\(contentsOf:\s*URL|semaphore\.wait\(\)/.test(ctx.swift);
  add(
    "ios_x_main_thread_io",
    "Networking is not performed synchronously on the main thread",
    syncNetwork ? "WARN" : "PASS",
    syncNetwork
      ? "The sampled source performs synchronous I/O — `Data(contentsOf: URL)`, `String(contentsOf:)` or a semaphore " +
        "wait around an async call. On the main thread this blocks the UI for the duration of the request, and on a " +
        "poor connection the watchdog terminates the app after roughly 20 seconds. It is the most common cause of " +
        "an app that 'freezes on a bad signal'."
      : "No synchronous network I/O was found in the sampled source.",
  );

  const escaping = (ctx.swift.match(/@escaping/g) ?? []).length;
  const weakSelf = (ctx.swift.match(/\[weak self\]|\[unowned self\]/g) ?? []).length;
  add(
    "ios_x_strong_reference_cycles",
    "Escaping closures capture self weakly",
    escaping < 3 ? "SKIPPED" : weakSelf >= escaping * 0.4 ? "PASS" : "WARN",
    escaping < 3
      ? "Too few escaping closures in the sampled source to judge capture semantics."
      : weakSelf >= escaping * 0.4
        ? `${weakSelf} weak/unowned captures against ${escaping} escaping closures — self is being captured weakly ` +
          "where it matters."
        : `${escaping} escaping closures were found but only ${weakSelf} weak or unowned captures. An escaping ` +
          "closure that captures self strongly keeps the whole view controller and its view hierarchy alive after " +
          "dismissal. This is measured as a ratio rather than a presence test because one `[weak self]` in a large " +
          "codebase proves nothing.",
  );

  // ── Build settings ─────────────────────────────────────────────────────────
  const dsym = /DEBUG_INFORMATION_FORMAT\s*=\s*"?dwarf-with-dsym/.test(ctx.pbxproj);
  add(
    "ios_x_crash_symbols",
    "Debug symbols are produced for crash reports",
    !ctx.pbxproj ? "SKIPPED" : dsym ? "PASS" : "WARN",
    !ctx.pbxproj
      ? "No Xcode project file was read, so build settings could not be inspected."
      : dsym
        ? "The project produces dSYM files, so crash reports symbolicate into function names and line numbers."
        : "DEBUG_INFORMATION_FORMAT is not set to dwarf-with-dsym for the release configuration. Without a dSYM, " +
          "every crash report from the App Store arrives as raw memory addresses — the crash is recorded but there " +
          "is no way to tell which line caused it.",
  );

  const bitcode = /ENABLE_BITCODE\s*=\s*YES/.test(ctx.pbxproj);
  add(
    "ios_x_bitcode_deprecated",
    "The project does not still enable the removed Bitcode setting",
    bitcode ? "WARN" : "PASS",
    bitcode
      ? "ENABLE_BITCODE is still YES. Apple removed Bitcode support in Xcode 14 and App Store Connect rejects " +
        "bitcode-enabled uploads, so this either produces a build warning today or will fail an upload on the next " +
        "toolchain bump."
      : "Bitcode is not enabled, matching current Xcode behaviour.",
  );

  const asyncAwait = /\basync\s+(func|let|throws)|await\s+\w/.test(ctx.swift);
  const completionHandlers = (ctx.swift.match(/completion:\s*@escaping/g) ?? []).length;
  add(
    "ios_x_swift_concurrency",
    "The project adopts structured concurrency rather than raw callbacks",
    asyncAwait ? "PASS" : completionHandlers > 5 ? "WARN" : "SKIPPED",
    asyncAwait
      ? "The codebase uses async/await, so concurrent work is structured and cancellation propagates."
      : completionHandlers > 5
        ? `${completionHandlers} completion-handler APIs were found and no async/await. Callback-based concurrency ` +
          "has no cancellation and no compiler-enforced ordering, which is why nested callbacks are the usual home " +
          "of race conditions and double-calls. This is a maintainability signal, not a defect."
        : "Too little concurrency in the sampled source to judge the approach.",
  );

  const target = /IPHONEOS_DEPLOYMENT_TARGET\s*=\s*([\d.]+)/.exec(ctx.pbxproj);
  const targetMajor = target ? parseInt(target[1], 10) : null;
  add(
    "ios_x_deployment_target",
    "The deployment target is a currently-supported iOS version",
    targetMajor === null ? "SKIPPED" : targetMajor >= 15 ? "PASS" : "WARN",
    targetMajor === null
      ? "No IPHONEOS_DEPLOYMENT_TARGET was found in the project file."
      : targetMajor >= 15
        ? `The deployment target is iOS ${target?.[1]}, which is within the range Apple and the current SDK support.`
        : `The deployment target is iOS ${target?.[1]}. Supporting a version this old blocks the whole codebase from ` +
          "using anything newer — including async/await availability, current SwiftUI APIs and several privacy " +
          "features — for a share of users that is now very small. Check the actual install base in App Store " +
          "Connect before treating this as a constraint.",
  );

  const stringsFiles = snapshot.paths.some((p) => /\.lproj\/.*\.strings$/i.test(p) || /Localizable\.xcstrings$/i.test(p));
  const hardcodedText = (ctx.swift.match(/Text\("(?![\s{}]*$)[^"]{6,}"\)/g) ?? []).length;
  add(
    "ios_x_localised_strings",
    "User-facing strings are localisable",
    stringsFiles ? "PASS" : hardcodedText > 15 ? "WARN" : "SKIPPED",
    stringsFiles
      ? "The project ships .strings or .xcstrings catalogues, so user-facing text can be translated without a code " +
        "change."
      : hardcodedText > 15
        ? `${hardcodedText} literal user-facing strings were found in the sampled source and no string catalogue ` +
          "exists. Adding a second language later then means touching every view rather than shipping a file."
        : "Too little user-facing text in the sampled source to judge localisation.",
  );

  const encryption = /ITSAppUsesNonExemptEncryption/.test(ctx.plists);
  add(
    "ios_x_encryption_declaration",
    "The export-compliance key is declared",
    encryption ? "PASS" : "WARN",
    encryption
      ? "ITSAppUsesNonExemptEncryption is declared in Info.plist, so uploads skip the export-compliance prompt."
      : "Info.plist does not declare ITSAppUsesNonExemptEncryption. Without it, App Store Connect asks the export " +
        "compliance question on every single upload before the build can be distributed — a manual step in the " +
        "middle of every release, and a common cause of a build sitting unnoticed in 'Missing Compliance'.",
  );

  return checks;
}
