// ─────────────────────────────────────────────────────────────────────────────
// iOS APP CHECK FAMILY — production readiness for a NATIVE iOS repo.
//
// Every check here corresponds to a defect found by hand in a real client app
// (Fellas iOS, 39k LOC, live on the App Store) that Pulse's generic repo checks
// could not see. The generic family reported two findings — no README, no
// .gitignore — and missed a shipping build that logs plaintext passwords.
//
// ── EVIDENCE MODEL (important) ──────────────────────────────────────────────
// We cannot fetch every file: a 376-file app would blow the REST budget. So:
//
//   • Config files (Info.plist, entitlements, project.pbxproj, lockfiles) are
//     ALWAYS fetched — they're few, small, and carry most store-readiness signal.
//     Findings from them are definitive.
//   • Swift sources are SAMPLED (relevance-ranked, capped in native-repo.ts).
//     That makes two very different kinds of finding:
//       – PRESENCE ("we found `try!`", "we found a password write") is sound on a
//         sample: we saw it, it's there.
//       – ABSENCE ("no dynamic type anywhere") is NOT sound on a partial sample.
//         Those findings declare `confidence: "LOW"` when coverage is thin, which
//         score-breakdown.ts excludes from scoring and the UI shows as
//         "Inconclusive" — so a thin sample can never invent a failure.
//
// This module is PURE — it takes a RepoSnapshot and returns checks. All I/O is in
// native-repo.ts, which is what makes the whole family unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import { isVendoredPath, stripCStyleComments, type RepoSnapshot } from "./native-mobile";

/**
 * Below this fraction of Swift files read, absence-based findings drop to LOW
 * confidence (and so out of the score). 0.30 rather than a majority because the
 * sample is RELEVANCE-RANKED, not random: native-repo.ts reads every
 * networking/auth/storage file plus the largest view files, which is where a
 * codebase-wide idiom appears if it is used at all. A random 30% would not
 * support an absence claim; this ordering does.
 */
const SOUND_ABSENCE_COVERAGE = 0.3;

const INCONCLUSIVE_NOTE =
  " (Based on a partial source sample, so this result is inconclusive and is not counted toward the score.)";

/** Swift shares C-style comments — see stripCStyleComments for why this matters. */
export const stripSwiftComments = stripCStyleComments;

interface IosContext {
  snapshot: RepoSnapshot;
  /** Sampled Swift source with comments stripped — use for all CODE patterns. */
  swift: string;
  /** Sampled Swift source verbatim — only for signals that live IN comments (TODOs). */
  swiftRaw: string;
  /** All Info.plist contents concatenated (app + any extensions). */
  plist: string;
  /** All .entitlements contents concatenated. */
  entitlements: string;
  /** GoogleService-Info.plist, if committed — kept out of `plist` so it can't satisfy Info.plist checks. */
  googleServicePlist: string;
  /** project.pbxproj contents (build settings, targets, SPM pins). */
  pbxproj: string;
  swiftTotal: number;
  swiftRead: number;
  /** swiftRead / swiftTotal — drives absence-finding confidence. */
  coverage: number;
}

function buildContext(snapshot: RepoSnapshot): IosContext {
  const isSwift = (p: string) => /\.swift$/i.test(p) && !isVendoredPath(p);
  const swiftTotal = snapshot.paths.filter(isSwift).length;
  const readSwift: string[] = [];
  let plist = "";
  let entitlements = "";
  let pbxproj = "";
  let googleServicePlist = "";

  for (const [path, text] of snapshot.files) {
    if (isSwift(path)) readSwift.push(text);
    // GoogleService-Info.plist first: it must NOT land in `plist`, or its keys could
    // satisfy an Info.plist check it has nothing to do with.
    else if (/(^|\/)GoogleService-Info\.plist$/i.test(path)) googleServicePlist += `\n${text}`;
    else if (/(^|\/)Info\.plist$/i.test(path)) plist += `\n${text}`;
    else if (/\.entitlements$/i.test(path)) entitlements += `\n${text}`;
    else if (/project\.pbxproj$/i.test(path)) pbxproj += `\n${text}`;
  }

  const swiftRaw = readSwift.join("\n");
  return {
    snapshot,
    swift: stripSwiftComments(swiftRaw),
    swiftRaw,
    plist,
    entitlements,
    googleServicePlist,
    pbxproj,
    swiftTotal,
    swiftRead: readSwift.length,
    coverage: swiftTotal === 0 ? 0 : readSwift.length / swiftTotal,
  };
}

function countMatches(haystack: string, re: RegExp): number {
  const m = haystack.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`));
  return m ? m.length : 0;
}

/**
 * Build an absence-based finding. When source coverage is thin the verdict is kept
 * but marked LOW confidence + explained, so it informs without scoring.
 */
function absence(
  ctx: IosContext,
  check: PulseScanCheckInput,
): PulseScanCheckInput {
  if (check.status === "PASS" || ctx.coverage >= SOUND_ABSENCE_COVERAGE) return check;
  return {
    ...check,
    detail: `${check.detail ?? ""}${INCONCLUSIVE_NOTE}`,
    confidence: "LOW",
    confidenceReason: `Read ${ctx.swiftRead} of ${ctx.swiftTotal} Swift files — not enough to prove an absence.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export function evaluateIosChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const ctx = buildContext(snapshot);
  return [
    ...securityChecks(ctx),
    ...secretsChecks(ctx),
    ...storeReadinessChecks(ctx),
    ...accessibilityChecks(ctx),
    ...performanceChecks(ctx),
    ...codeQualityChecks(ctx),
    ...hygieneChecks(ctx),
  ];
}

// ── Hygiene / nice-to-haves ─────────────────────────────────────────────────
//
// Real findings that are never a launch consideration. All of these are WARN at
// worst and are listed in priority.ts's COSMETIC set, which damps their score so
// they always rank P3 and can't push a security finding down the fix list.
// They read the RAW source, because what they are looking for lives in comments.

function hygieneChecks(ctx: IosContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const C = CATEGORIES.CODE_QUALITY;
  const rawLines = ctx.swiftRaw === "" ? 0 : ctx.swiftRaw.split("\n").length;
  // Too little source to derive a rate — skip rather than report noise.
  const MIN_LINES = 200;

  // Development leftovers that made it into a shipped build.
  const leftovers: string[] = [];
  if (/ngrok(-free)?\.(app|io)/i.test(ctx.swiftRaw)) leftovers.push("an ngrok tunnel URL");
  if (/https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)/i.test(ctx.swiftRaw)) leftovers.push("a localhost endpoint");
  if (/^\/\/\s+(fdsf|untitled|file|temp|asdf|qwerty|test)\w*\.swift/im.test(ctx.swiftRaw)) {
    leftovers.push("a placeholder file header (the file was renamed but its header wasn't)");
  }
  // A media URL hardcoded as a DEFAULT PARAMETER value — a demo asset that ships.
  if (/=\s*"https?:\/\/[^"]+\.(mp4|m3u8|jpg|png)"/i.test(ctx.swiftRaw)) {
    leftovers.push("a hardcoded media URL used as a default value");
  }
  checks.push({
    category: C,
    checkKey: "ios_dev_leftovers",
    label: "No development leftovers in shipped code",
    status: rawLines === 0 ? "SKIPPED" : leftovers.length > 0 ? "WARN" : "PASS",
    detail:
      rawLines === 0
        ? "No Swift source could be read."
        : leftovers.length > 0
          ? `Development leftovers found in the shipped source: ${leftovers.join("; ")}. None of these break the app, but a tunnel or localhost URL in a release binary tells anyone who unzips it how the team develops, and a hardcoded demo asset eventually renders in front of a user when a real value is missing. Nice-to-have cleanup.`
          : "No ngrok/localhost endpoints, placeholder headers or hardcoded demo media found.",
    evidence: leftovers.length > 0 ? leftovers.join("; ") : undefined,
  });

  // TODO/FIXME density — a rate, not a raw count, so a big codebase isn't punished.
  const todos = countMatches(ctx.swiftRaw, /\/\/\s*(TODO|FIXME|HACK|XXX)\b/i);
  const todosPer1k = rawLines > 0 ? (todos / rawLines) * 1000 : 0;
  checks.push({
    category: C,
    checkKey: "ios_todo_density",
    label: "TODO / FIXME density",
    status: rawLines < MIN_LINES ? "SKIPPED" : todosPer1k <= 2 ? "PASS" : todosPer1k <= 6 ? "WARN" : "WARN",
    detail:
      rawLines < MIN_LINES
        ? `Only ${rawLines} line${rawLines !== 1 ? "s" : ""} of Swift source available — too little to measure a meaningful density.`
        : `${todos} TODO/FIXME/HACK marker${todos !== 1 ? "s" : ""} across ${rawLines.toLocaleString()} sampled lines (${todosPer1k.toFixed(1)} per 1,000).${todosPer1k <= 2 ? " That is a low density." : " Markers left in shipped code are unread by anyone who didn't write them; move the ones that matter to the tracker and delete the rest. Nice-to-have."}`,
  });

  // Commented-out CODE (not prose comments) — the difference is measurable, and this
  // is the metric that stays honest as a codebase grows.
  const commentLines = ctx.swiftRaw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("//"));
  const codeLike = commentLines.filter((l) =>
    /(\b(func|let|var|if|guard|return|import|class|struct|enum|case)\b|[{}]\s*$|\)\s*$|\s=\s)/.test(l.slice(2)),
  ).length;
  const codeLikePer1k = rawLines > 0 ? (codeLike / rawLines) * 1000 : 0;
  checks.push({
    category: C,
    checkKey: "ios_dead_code",
    label: "No commented-out code left in place",
    status: rawLines < MIN_LINES ? "SKIPPED" : codeLikePer1k <= 10 ? "PASS" : "WARN",
    detail:
      rawLines < MIN_LINES
        ? `Only ${rawLines} line${rawLines !== 1 ? "s" : ""} of Swift source available — too little to measure a meaningful density.`
        : `${codeLike} commented-out code line${codeLike !== 1 ? "s" : ""} across ${rawLines.toLocaleString()} sampled lines (${codeLikePer1k.toFixed(1)} per 1,000).${codeLikePer1k <= 10 ? " That is a low density." : " Version control already remembers deleted code, so commented-out blocks only cost reading time — and they actively mislead: a search for a symbol finds it in a block that never runs. (This scanner had exactly that bug: a check passed because the API it looked for appeared only in commented-out lines.) Nice-to-have."}`,
  });

  return checks;
}

// ── Security ────────────────────────────────────────────────────────────────

function securityChecks(ctx: IosContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const C = CATEGORIES.SECURITY;

  // Debug guards — the precondition for everything else being strippable.
  const debugGuards = countMatches(ctx.swift, /#if\s+DEBUG/);
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "ios_debug_guards",
      label: "Debug-only code is compile-gated (#if DEBUG)",
      status: debugGuards > 0 ? "PASS" : "WARN",
      detail:
        debugGuards > 0
          ? `${debugGuards} #if DEBUG guard${debugGuards !== 1 ? "s" : ""} found — debug-only code can be excluded from Release builds.`
          : "No #if DEBUG anywhere in the sampled source. Nothing in this app is compile-excluded from a Release build, so any diagnostic code ships to the App Store exactly as written.",
    }),
  );

  // Release logging — a logger with a hardcoded always-on flag and no build gate.
  const loggerAlwaysOn = /(isLoggingEnabled|loggingEnabled|isLogEnabled|enableLogging)\s*(:\s*Bool)?\s*=\s*true/i.test(ctx.swift);
  const printCalls = countMatches(ctx.swift, /(?:^|[^\w.])(?:print|NSLog|debugPrint)\s*\(/);
  const loggingUnguarded = (loggerAlwaysOn || printCalls > 10) && debugGuards === 0;
  checks.push({
    category: C,
    checkKey: "ios_release_logging",
    label: "Console logging disabled in Release builds",
    status: loggingUnguarded ? "FAIL" : printCalls > 10 ? "WARN" : "PASS",
    detail: loggingUnguarded
      ? `Logging is on unconditionally in Release: ${loggerAlwaysOn ? "a logger flag is hardcoded to true" : `${printCalls} print/NSLog call sites`}, with no #if DEBUG guard anywhere. Device logs are readable by anyone with the phone and a Mac (Console.app, no jailbreak needed) and are captured in sysdiagnose bundles users email to support. Wrap the logger in #if DEBUG.`
      : printCalls > 10
        ? `${printCalls} print/NSLog call sites found. Some #if DEBUG guards exist — confirm the logging paths are inside them, since console output persists on device in Release.`
        : "No unconditional console logging detected in the sampled source.",
    evidence: loggerAlwaysOn ? "Logger flag hardcoded to true" : undefined,
  });

  // The escalation: request/response bodies logged where a credential model exists.
  const logsPayload =
    /Logger\.(log|logAPICall|logRequest|logResponse)[\s\S]{0,400}?(body|payload|httpBody|parameters)/i.test(ctx.swift) ||
    /(print|NSLog|debugPrint)\s*\([^)]{0,120}(requestBody|httpBody|responseString|responseJSON|jsonObject)/i.test(ctx.swift);
  const hasCredentialModel = /(struct|class)\s+\w*(Login|Auth|SignIn|Register|Credential)\w*[\s\S]{0,400}?\blet\s+password\b/i.test(ctx.swift);
  const leaksCredentials = logsPayload && hasCredentialModel && debugGuards === 0;
  checks.push({
    category: C,
    checkKey: "ios_sensitive_payload_logging",
    label: "Request/response bodies not logged in Release",
    status: leaksCredentials ? "FAIL" : logsPayload ? "WARN" : "PASS",
    detail: leaksCredentials
      ? "CRITICAL: the networking layer logs full request and/or response bodies, a request model carries a plaintext `password` field, and there is no #if DEBUG guard. Every login therefore writes the user's credentials — and the tokens returned in the response — to the device console in the shipped build. This is a UK GDPR Art. 32 exposure, not just untidy logging. Redact auth payloads and gate the logger on #if DEBUG."
      : logsPayload
        ? "The networking layer logs request or response bodies. Confirm auth endpoints are redacted and the logging is Release-excluded — a body log is the usual way credentials and tokens reach the device console."
        : "No request/response body logging detected in the sampled networking code.",
    evidence: leaksCredentials ? "Body logging + a password-bearing request model + no #if DEBUG" : undefined,
  });

  // App Transport Security.
  const atsArbitrary = /<key>\s*NSAllowsArbitraryLoads\s*<\/key>\s*<true\s*\/>/i.test(ctx.plist);
  const atsInsecureException = /NSExceptionAllowsInsecureHTTPLoads\s*<\/key>\s*<true\s*\/>/i.test(ctx.plist);
  const hasPlist = ctx.plist.length > 0;
  checks.push({
    category: C,
    checkKey: "ios_ats_arbitrary_loads",
    label: "App Transport Security enforced",
    status: !hasPlist ? "SKIPPED" : atsArbitrary ? "FAIL" : atsInsecureException ? "WARN" : "PASS",
    detail: !hasPlist
      ? "No Info.plist could be read."
      : atsArbitrary
        ? "NSAllowsArbitraryLoads is true — App Transport Security is disabled app-wide, so the app will accept plaintext HTTP and invalid certificates. Remove it and scope any genuine exception to a single domain."
        : atsInsecureException
          ? "An ATS exception domain permits insecure HTTP loads. Narrow it to the specific host and remove it once that host serves HTTPS."
          : "App Transport Security is enforced — no app-wide arbitrary loads and no insecure HTTP exceptions.",
  });

  // An ATS exception domain that weakens nothing. Tidiness, but the kind that
  // misleads a reader into thinking an exception is load-bearing when it is inert.
  const hasExceptionDomains = /<key>\s*NSExceptionDomains\s*<\/key>/i.test(ctx.plist);
  const weakensAnything =
    /(NSExceptionAllowsInsecureHTTPLoads|NSExceptionMinimumTLSVersion|NSExceptionRequiresForwardSecrecy|NSThirdPartyExceptionAllowsInsecureHTTPLoads|NSThirdPartyExceptionMinimumTLSVersion|NSRequiresCertificateTransparency)/i.test(
      ctx.plist,
    );
  checks.push({
    category: C,
    checkKey: "ios_ats_exception_noop",
    label: "No redundant ATS exception domains",
    status: !hasExceptionDomains ? "SKIPPED" : weakensAnything ? "PASS" : "WARN",
    detail: !hasExceptionDomains
      ? "No NSExceptionDomains declared."
      : weakensAnything
        ? "ATS exception domains declare an explicit policy, so their intent is legible."
        : "An NSExceptionDomains entry is declared but sets no policy key (only NSIncludesSubdomains), so it changes nothing — the default ATS rules already apply to that host. Nice-to-have: remove it, or state the intended policy explicitly, so a future reader doesn't assume the exception is doing work.",
  });

  // Certificate pinning — advisory: absence is common and defensible.
  const pins = /(urlSession\s*\(\s*_?\s*\w*\s*,\s*didReceive\s+challenge|SecTrustEvaluate|serverTrustPolicy|pinnedCertificates|publicKeyHashes)/i.test(ctx.swift);
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "ios_cert_pinning",
      label: "Certificate pinning on API traffic",
      status: pins ? "PASS" : "WARN",
      detail: pins
        ? "Server-trust evaluation / certificate pinning detected."
        : "No certificate pinning detected. ATS already prevents plaintext traffic, so this is a hardening step rather than a defect — worth adding for an app carrying subscription entitlements or payment state, since it defeats proxy interception on a compromised device.",
    }),
  );

  // A runtime-flipped environment switcher compiled into the shipped binary.
  const envSwitcher = /(static\s+var\s+\w*(isQAMode|qaMode|debugMode|environmentOverride)\w*\s*(:\s*Bool)?\s*=|enum\s+AppEnvironment|case\s+staging)/i.test(ctx.swift);
  const envPersisted = /UserDefaults[\s\S]{0,200}(SelectedEnvironment|selectedEnvironment|environment)/i.test(ctx.swift);
  // Reads the RAW source: this signal lives inside a comment by definition.
  const releaseTodo = /\/\/\s*TODO[^\n]{0,80}(before release|set environment|prod)/i.test(ctx.swiftRaw);
  const switcherShips = envSwitcher && debugGuards === 0;
  checks.push({
    category: C,
    checkKey: "ios_env_switcher_in_release",
    label: "Staging/QA environment switch excluded from Release",
    status: switcherShips ? "WARN" : "PASS",
    detail: switcherShips
      ? `A staging/QA environment switch is present with no #if DEBUG guard, so it is compiled into the App Store binary along with the staging hostnames.${envPersisted ? " The selection persists in UserDefaults, so a device switched to staging stays there across launches." : ""}${releaseTodo ? " A \"set environment before release\" TODO is also present — a release-critical manual step that will eventually be missed." : ""} Gate the switch and the staging URLs on #if DEBUG.`
      : "No ungated staging/QA environment switch detected in the shipped code path.",
    evidence: releaseTodo ? "Release-critical TODO on the environment default" : undefined,
  });

  return checks;
}

// ── Secrets & credential storage ────────────────────────────────────────────

function secretsChecks(ctx: IosContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const C = CATEGORIES.SECRETS_KEYS;

  const usesKeychain = /(kSecClassGenericPassword|SecItemAdd|SecItemCopyMatching|KeychainAccess|KeychainSwift)/i.test(ctx.swift);
  // Token-named keys written through UserDefaults / @AppStorage.
  const tokenInDefaults =
    /(UserDefaults[\s\S]{0,300}?(accessToken|refreshToken|authToken|idToken|bearer))/i.test(ctx.swift) ||
    /@AppStorage\s*\(\s*"[^"]*(?:token|Token)[^"]*"/.test(ctx.swift) ||
    /case\s+\w*(?:accesstoken|accessToken|refreshToken)\w*\s*=\s*"[^"]*"/i.test(ctx.swift);

  checks.push({
    category: C,
    checkKey: "ios_token_storage",
    label: "Auth tokens stored in the Keychain",
    status: tokenInDefaults ? "FAIL" : usesKeychain ? "PASS" : "WARN",
    detail: tokenInDefaults
      ? `Access/refresh token keys are persisted through UserDefaults or @AppStorage. UserDefaults is an unencrypted plist inside the app container: it is included in unencrypted Finder/iTunes backups and readable on a jailbroken device.${usesKeychain ? " A Keychain wrapper already exists in this codebase — move the tokens into it." : " Move them to the Keychain with kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly."}`
      : usesKeychain
        ? "Keychain APIs are used for credential storage and no token-named keys were found in UserDefaults."
        : "No Keychain usage detected and no token storage located in the sampled source — confirm where the session token is persisted.",
    evidence: tokenInDefaults ? "Token key written via UserDefaults/@AppStorage" : undefined,
  });

  // Retaining the password itself is never necessary, Keychain or not.
  const passwordPersisted =
    /(KeychainStore|Keychain\w*)\.(save|set|store)\s*\([^)]{0,80}password/i.test(ctx.swift) ||
    /(passwordAccount|rememberMe\.password|savedPassword|storedPassword)/i.test(ctx.swift) ||
    /UserDefaults[\s\S]{0,120}?\bpassword\b/i.test(ctx.swift);
  checks.push({
    category: C,
    checkKey: "ios_password_retention",
    label: "User password is not persisted on device",
    status: passwordPersisted ? "FAIL" : "PASS",
    detail: passwordPersisted
      ? "The user's password appears to be written to on-device storage (typically for a \"Remember me\" feature). A password never needs to be retained: keep a refresh token instead and re-authenticate with that. Retaining it widens the blast radius of any device compromise to the user's actual credential, which is very often reused elsewhere."
      : "No on-device password persistence detected.",
    evidence: passwordPersisted ? "Password written to Keychain/UserDefaults" : undefined,
  });

  // Firebase config in git. Google's own position is that these ship in every binary
  // and are not secrets, so this is WARN, never FAIL — the actionable part is whether
  // the key is restricted, which cannot be seen from the repo.
  const firebaseKey = /<key>\s*API_KEY\s*<\/key>\s*<string>\s*AIza[\w-]{10,}/i.exec(ctx.googleServicePlist);
  const firebaseProject = /<key>\s*PROJECT_ID\s*<\/key>\s*<string>\s*([^<\s]+)/i.exec(ctx.googleServicePlist);
  checks.push({
    category: C,
    checkKey: "ios_firebase_config_committed",
    label: "Firebase config key is restricted",
    status: ctx.googleServicePlist === "" ? "SKIPPED" : firebaseKey ? "WARN" : "PASS",
    detail:
      ctx.googleServicePlist === ""
        ? "No GoogleService-Info.plist committed."
        : firebaseKey
          ? `GoogleService-Info.plist is committed with an API_KEY${firebaseProject ? ` for project \`${firebaseProject[1]}\`` : ""}. This is NOT a leak on its own — Google ships these in every app binary and treats them as public identifiers, so rotating it achieves nothing. The action is to confirm in the Google Cloud console that the key is restricted to this app's bundle ID and to the specific APIs it needs; an unrestricted key is callable from anywhere by anyone who unzips the app.`
          : "GoogleService-Info.plist is committed but carries no API key.",
  });

  // Keychain accessibility class — the weak ones survive device lock or migrate off-device.
  const weakAccessible = /kSecAttrAccessible(?:Always|AlwaysThisDeviceOnly)\b/.test(ctx.swift);
  const strongAccessible = /kSecAttrAccessible(?:WhenUnlocked|AfterFirstUnlock)(?:ThisDeviceOnly)?\b/.test(ctx.swift);
  checks.push({
    category: C,
    checkKey: "ios_keychain_accessibility",
    label: "Keychain items use a restrictive accessibility class",
    status: !usesKeychain ? "SKIPPED" : weakAccessible ? "FAIL" : strongAccessible ? "PASS" : "WARN",
    detail: !usesKeychain
      ? "No Keychain usage detected."
      : weakAccessible
        ? "Keychain items use kSecAttrAccessibleAlways, which is deprecated and leaves the item readable while the device is locked. Use kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly (background-friendly) or WhenUnlockedThisDeviceOnly (strictest)."
        : strongAccessible
          ? "Keychain items specify a restrictive accessibility class."
          : "Keychain items do not specify kSecAttrAccessible, so they default to WhenUnlocked and will migrate to a new device via backup. Set it explicitly, with a ThisDeviceOnly variant for session material.",
  });

  return checks;
}

// ── App Store readiness ─────────────────────────────────────────────────────

/** iOS APIs that require a matching Info.plist usage-description string. */
const USAGE_DESCRIPTION_RULES: { api: RegExp; key: string; what: string }[] = [
  { api: /AVCaptureDevice|UIImagePickerController|\.camera\b/, key: "NSCameraUsageDescription", what: "camera" },
  { api: /PHPhotoLibrary|PHPickerViewController|\.photoLibrary\b/, key: "NSPhotoLibraryUsageDescription", what: "photo library" },
  // Recording only. A bare AVAudioSession reference is playback configuration and
  // needs NO microphone permission — treating it as recording made the check fail
  // on any app that merely plays audio.
  {
    api: /AVAudioRecorder|requestRecordPermission|setCategory\(\s*\.(?:record|playAndRecord)/,
    key: "NSMicrophoneUsageDescription",
    what: "microphone",
  },
  { api: /CLLocationManager/, key: "NSLocationWhenInUseUsageDescription", what: "location" },
  { api: /CNContactStore/, key: "NSContactsUsageDescription", what: "contacts" },
  { api: /EKEventStore/, key: "NSCalendarsUsageDescription", what: "calendar" },
  { api: /CMMotionManager|CMPedometer/, key: "NSMotionUsageDescription", what: "motion" },
  { api: /LAContext/, key: "NSFaceIDUsageDescription", what: "Face ID" },
  { api: /CBCentralManager|CBPeripheralManager/, key: "NSBluetoothAlwaysUsageDescription", what: "Bluetooth" },
];

/** Required-reason APIs that oblige a PrivacyInfo.xcprivacy declaration. */
const REQUIRED_REASON_APIS: { api: RegExp; category: string }[] = [
  { api: /UserDefaults|@AppStorage/, category: "NSPrivacyAccessedAPICategoryUserDefaults" },
  { api: /\.creationDate|\.modificationDate|FileAttributeKey/, category: "NSPrivacyAccessedAPICategoryFileTimestamp" },
  { api: /systemUptime|mach_absolute_time/, category: "NSPrivacyAccessedAPICategorySystemBootTime" },
  { api: /os_proc_available_memory|activeProcessorCount/, category: "NSPrivacyAccessedAPICategoryDiskSpace" },
];

function storeReadinessChecks(ctx: IosContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const C = CATEGORIES.APP_STORE;
  const hasPlist = ctx.plist.length > 0;

  // Privacy manifest — required, and a rejection risk as Apple tightens enforcement.
  const hasPrivacyManifest = ctx.snapshot.paths.some(
    (p) => /PrivacyInfo\.xcprivacy$/i.test(p) && !isVendoredPath(p),
  );
  const usedReasonApis = REQUIRED_REASON_APIS.filter((r) => r.api.test(ctx.swift)).map((r) => r.category);
  checks.push({
    category: C,
    checkKey: "ios_privacy_manifest",
    label: "Privacy manifest (PrivacyInfo.xcprivacy)",
    status: hasPrivacyManifest ? "PASS" : usedReasonApis.length > 0 ? "FAIL" : "WARN",
    detail: hasPrivacyManifest
      ? "PrivacyInfo.xcprivacy present — required-reason API usage and data collection are declared."
      : usedReasonApis.length > 0
        ? `No PrivacyInfo.xcprivacy, but the app uses ${usedReasonApis.length} required-reason API categor${usedReasonApis.length !== 1 ? "ies" : "y"}. Apple requires a privacy manifest declaring these; App Store Connect flags it on upload and enforcement is tightening. Add the manifest with an approved reason code for each.`
        : "No PrivacyInfo.xcprivacy found. Apple requires a privacy manifest for apps using required-reason APIs and for third-party SDK dependencies.",
    evidence: usedReasonApis.length > 0 ? usedReasonApis.slice(0, 3).join(", ") : undefined,
  });

  // Permission strings — a missing one is an automatic rejection AND a crash.
  const missing = hasPlist
    ? USAGE_DESCRIPTION_RULES.filter((r) => r.api.test(ctx.swift) && !ctx.plist.includes(r.key))
    : [];
  checks.push({
    category: C,
    checkKey: "ios_usage_descriptions",
    label: "Permission usage descriptions present",
    status: !hasPlist ? "SKIPPED" : missing.length > 0 ? "FAIL" : "PASS",
    detail: !hasPlist
      ? "No Info.plist could be read."
      : missing.length > 0
        ? `${missing.length} permission${missing.length !== 1 ? "s are" : " is"} requested in code with no Info.plist usage description: ${missing.map((m) => m.what).join(", ")}. iOS terminates the app the moment the permission is requested, and App Store review rejects the build.`
        : "Every permission the sampled code requests has a matching Info.plist usage description.",
    evidence: missing.length > 0 ? missing.map((m) => m.key).join(", ") : undefined,
  });

  // Push environment — usually rewritten by Xcode on export, so WARN and say so.
  const apsDev = /<key>\s*aps-environment\s*<\/key>\s*<string>\s*development\s*<\/string>/i.test(ctx.entitlements);
  const hasEntitlements = ctx.entitlements.length > 0;
  checks.push({
    category: C,
    checkKey: "ios_aps_environment",
    label: "Push notification environment",
    status: !hasEntitlements ? "SKIPPED" : apsDev ? "WARN" : "PASS",
    detail: !hasEntitlements
      ? "No .entitlements file could be read."
      : apsDev
        ? "aps-environment is set to `development` in the committed entitlements. Xcode's automatic signing normally substitutes `production` when exporting for the App Store, so this is often benign — but it is the first thing to check if production push silently stops working, and it is worth making explicit rather than relying on the export step."
        : "Push entitlement is not pinned to the development environment.",
  });

  // Declared background modes must be earned — unused ones get rejected.
  const declaredModes = Array.from(
    ctx.plist.matchAll(/<key>\s*UIBackgroundModes\s*<\/key>\s*<array>([\s\S]*?)<\/array>/gi),
  ).flatMap((m) => Array.from(m[1].matchAll(/<string>\s*([\w-]+)\s*<\/string>/g)).map((s) => s[1]));
  const modeEvidence: Record<string, RegExp> = {
    audio: /AVAudioSession|\.playback\b|MPNowPlayingInfoCenter/i,
    fetch: /BGAppRefreshTask|setMinimumBackgroundFetchInterval|performFetchWithCompletionHandler/i,
    "remote-notification": /didReceiveRemoteNotification|UNUserNotificationCenter|Messaging\.messaging/i,
    location: /allowsBackgroundLocationUpdates|startMonitoringSignificantLocationChanges/i,
    processing: /BGProcessingTask/i,
    "voip": /CXProvider|PKPushRegistry/i,
  };
  const unjustified = declaredModes.filter((m) => {
    const re = modeEvidence[m];
    return re ? !re.test(ctx.swift) : false;
  });
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "ios_background_modes_declared",
      label: "Declared background modes are actually used",
      status: declaredModes.length === 0 ? "SKIPPED" : unjustified.length > 0 ? "WARN" : "PASS",
      detail:
        declaredModes.length === 0
          ? "No UIBackgroundModes declared."
          : unjustified.length > 0
            ? `Declared background mode${unjustified.length !== 1 ? "s" : ""} with no matching implementation found: ${unjustified.join(", ")}. App Store review rejects background modes an app does not demonstrably use — either implement the handler or remove the entry.`
            : `All ${declaredModes.length} declared background mode${declaredModes.length !== 1 ? "s have" : " has"} matching implementation signals (${declaredModes.join(", ")}).`,
    }),
  );

  // Export-compliance declaration — its absence means a manual question every upload.
  const hasEncryptionKey = /ITSAppUsesNonExemptEncryption/i.test(ctx.plist);
  checks.push({
    category: C,
    checkKey: "ios_encryption_declaration",
    label: "Export-compliance declaration (ITSAppUsesNonExemptEncryption)",
    status: !hasPlist ? "SKIPPED" : hasEncryptionKey ? "PASS" : "WARN",
    detail: !hasPlist
      ? "No Info.plist could be read."
      : hasEncryptionKey
        ? "ITSAppUsesNonExemptEncryption is declared — uploads skip the export-compliance prompt."
        : "ITSAppUsesNonExemptEncryption is not declared, so every upload stops on the export-compliance question and cannot be fully automated. Declare it (false is correct for apps using only HTTPS/system crypto).",
  });

  // Entitlements that Apple gates behind an approval request or a very recent OS.
  // A build fails outright if the provisioning profile lacks one, and the
  // approval-gated ones can sit unanswered for weeks — worth knowing before a release
  // is planned around them, not on the day the archive fails.
  const RESTRICTED_ENTITLEMENTS: { key: string; why: string }[] = [
    { key: "com.apple.developer.networking.multicast", why: "requires an approved request to Apple" },
    { key: "com.apple.developer.family-controls", why: "requires an approved request to Apple" },
    { key: "com.apple.developer.usernotifications.critical-alerts", why: "requires an approved request to Apple" },
    { key: "com.apple.developer.usernotifications.filtering", why: "requires an approved request to Apple" },
    { key: "com.apple.developer.carplay-audio", why: "requires CarPlay entitlement approval" },
    { key: "com.apple.developer.background-tasks.continued-processing", why: "very recent OS-version entitlement" },
    { key: "com.apple.developer.healthkit.recalibrate-estimates", why: "requires an approved request to Apple" },
  ];
  const restricted = RESTRICTED_ENTITLEMENTS.filter((e) => ctx.entitlements.includes(e.key));
  checks.push({
    category: C,
    checkKey: "ios_restricted_entitlements",
    label: "Restricted entitlements are provisioned",
    status: !hasEntitlements ? "SKIPPED" : restricted.length > 0 ? "WARN" : "PASS",
    detail: !hasEntitlements
      ? "No .entitlements file could be read."
      : restricted.length > 0
        ? `${restricted.length} restricted entitlement${restricted.length !== 1 ? "s" : ""} declared: ${restricted.map((r) => `${r.key.replace("com.apple.developer.", "")} (${r.why})`).join("; ")}. Confirm each is present in the distribution provisioning profile and, where Apple approval is needed, that it has been granted — an archive fails outright if the profile is missing one, and approvals are not quick.`
        : "No approval-gated or OS-restricted entitlements declared.",
    evidence: restricted.length > 0 ? restricted.map((r) => r.key).join(", ") : undefined,
  });

  // Info.plist keys that simply do not exist in iOS. Harmless — iOS ignores them —
  // but they mislead: someone added them believing a permission was being explained.
  const INVALID_PLIST_KEYS = [
    "NSUserNotificationsUsageDescription",
    "NSPushNotificationsUsageDescription",
    "NSRemoteNotificationsUsageDescription",
    "NSInternetUsageDescription",
    "NSNetworkUsageDescription",
    "NSStorageUsageDescription",
    "NSFileAccessUsageDescription",
    "NSPhotoLibraryUsageDescriptions",
  ];
  const invalidKeys = hasPlist ? INVALID_PLIST_KEYS.filter((k) => ctx.plist.includes(k)) : [];
  checks.push({
    category: C,
    checkKey: "ios_invalid_plist_keys",
    label: "No non-existent Info.plist keys",
    status: !hasPlist ? "SKIPPED" : invalidKeys.length > 0 ? "WARN" : "PASS",
    detail: !hasPlist
      ? "No Info.plist could be read."
      : invalidKeys.length > 0
        ? `${invalidKeys.length} Info.plist key${invalidKeys.length !== 1 ? "s that iOS does" : " that iOS does"} not recognise: ${invalidKeys.join(", ")}. iOS ignores them, so nothing breaks — but notification permission has no usage-description string, and a key like this usually means someone believed they were explaining a permission to the user when no prompt copy was ever shown. Nice-to-have: delete them.`
        : "No unrecognised usage-description keys in Info.plist.",
  });

  // Deployment target — how much of the install base is supported, and how much modern API is available.
  const targetMatch = ctx.pbxproj.match(/IPHONEOS_DEPLOYMENT_TARGET\s*=\s*([\d.]+)/);
  const target = targetMatch ? parseFloat(targetMatch[1]) : null;
  checks.push({
    category: C,
    checkKey: "ios_deployment_target",
    label: "iOS deployment target is current",
    status: target === null ? "SKIPPED" : target >= 16 ? "PASS" : target >= 14 ? "WARN" : "FAIL",
    detail:
      target === null
        ? "Could not read IPHONEOS_DEPLOYMENT_TARGET from the project file."
        : target >= 16
          ? `Deployment target is iOS ${targetMatch![1]} — recent enough for current SwiftUI and privacy APIs.`
          : `Deployment target is iOS ${targetMatch![1]}. Supporting versions this old blocks current SwiftUI, Swift Concurrency and privacy APIs while covering a very small additional share of active devices.`,
  });

  return checks;
}

// ── Accessibility ───────────────────────────────────────────────────────────

function accessibilityChecks(ctx: IosContext): PulseScanCheckInput[] {
  const C = CATEGORIES.ACCESSIBILITY;

  const scaled = countMatches(ctx.swift, /(ScaledMetric|dynamicTypeSize|relativeTo:\s*\.|\.font\(\.(?:body|title|caption|headline|subheadline|callout|footnote)\b)/);
  const fixedFonts = countMatches(ctx.swift, /\.font\(\s*\.custom\([^)]*size:/);
  const labels = countMatches(ctx.swift, /accessibilityLabel/);
  const interactive = countMatches(ctx.swift, /(?:^|[^\w])(?:Button|NavigationLink|onTapGesture|Toggle)\s*[({]/);

  // Ratio, not presence. Presence alone passed an app with 358 hardcoded sizes and a
  // single `.font(.title)`: technically "uses Dynamic Type", in practice none of the
  // text scales. What matters is how much of the type is fixed.
  const typed = scaled + fixedFonts;
  const scaledShare = typed === 0 ? 0 : scaled / typed;

  return [
    absence(ctx, {
      category: C,
      checkKey: "ios_dynamic_type",
      label: "Dynamic Type supported",
      status: typed === 0 ? "WARN" : scaledShare >= 0.5 ? "PASS" : scaledShare >= 0.2 ? "WARN" : "FAIL",
      detail:
        typed === 0
          ? "No font declarations found in the sampled source, so Dynamic Type support could not be assessed."
          : scaledShare >= 0.5
            ? `${scaled} of ${typed} font usages scale with the user's font-size setting (${Math.round(scaledShare * 100)}%).`
            : `Only ${scaled} of ${typed} font usages scale with the user's font-size setting (${Math.round(scaledShare * 100)}%) — ${fixedFonts} use a hardcoded .font(.custom(size:)). Text at a fixed point size ignores the system font-size setting entirely, so a user who raised it for legibility sees almost no change. Pass relativeTo: when declaring a custom font, or size it with @ScaledMetric.`,
    }),
    absence(ctx, {
      category: C,
      checkKey: "ios_accessibility_labels",
      label: "VoiceOver labels on interactive elements",
      status:
        interactive === 0 ? "SKIPPED" : labels === 0 ? "FAIL" : labels / interactive >= 0.3 ? "PASS" : "WARN",
      detail:
        interactive === 0
          ? "No interactive SwiftUI elements found in the sampled source."
          : labels === 0
            ? `${interactive} interactive element${interactive !== 1 ? "s" : ""} found with no accessibilityLabel anywhere. VoiceOver will announce icon-only controls as unlabelled buttons, which makes the app effectively unusable with a screen reader.`
            : labels / interactive >= 0.3
              ? `${labels} accessibility labels across ${interactive} interactive elements.`
              : `Only ${labels} accessibilityLabel${labels !== 1 ? "s" : ""} across ${interactive} interactive elements. Icon-only controls need explicit labels or VoiceOver announces them as "Button".`,
    }),
  ];
}

// ── Performance, caching & constrained networks ──────────────────────────────
//
// This group exists because "the app is slow on low data" is a report we actually
// received from a client. On a constrained network the usual causes are: no
// bitrate adaptation on video, no on-disk response/image cache, no downsampling of
// full-size images, and no adaptation to Low Data Mode. Each is checkable here.

function performanceChecks(ctx: IosContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const C = CATEGORIES.PERFORMANCE;

  // Low Data Mode / constrained + expensive network adaptation.
  // NWPathMonitor is deliberately NOT a signal here: plain reachability tells you
  // whether you are online, not whether the connection is metered or constrained.
  // Counting it passed an app that had ordinary reachability and no adaptation at all.
  const constrained = /(allowsConstrainedNetworkAccess|allowsExpensiveNetworkAccess|\.isConstrained|\.isExpensive|lowDataMode)/i.test(ctx.swift);
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "ios_low_data_mode",
      label: "Adapts to Low Data Mode / constrained networks",
      status: constrained ? "PASS" : "WARN",
      detail: constrained
        ? "Constrained/expensive-network signals are handled (Low Data Mode, cellular, or NWPathMonitor), so the app can reduce its demands on a poor connection."
        : "No handling of Low Data Mode or constrained networks detected. iOS exposes NWPath.isConstrained and allowsConstrainedNetworkAccess precisely so an app can drop to smaller assets and lower-bitrate media; without it the app makes identical full-size requests on a metered or weak connection and simply feels slow. This is the most direct cause of \"slow on low data\" reports.",
    }),
  );

  // Adaptive bitrate streaming — the big one for a video app on a weak connection.
  const playsVideo = /(AVPlayer|AVPlayerItem|AVKit|VideoPlayer|GSPlayer)/i.test(ctx.swift);
  const usesHls = /\.m3u8/i.test(ctx.swift);
  const usesProgressive = /\.mp4/i.test(ctx.swift);
  const capsBitrate = /preferredPeakBitRate|preferredMaximumResolution/i.test(ctx.swift);
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "ios_adaptive_streaming",
      label: "Video uses adaptive-bitrate streaming (HLS)",
      status: !playsVideo ? "SKIPPED" : usesHls ? "PASS" : usesProgressive ? "FAIL" : "WARN",
      detail: !playsVideo
        ? "No video playback detected."
        : usesHls
          ? `HLS (.m3u8) playback detected — the player can adapt bitrate to the available bandwidth.${capsBitrate ? " preferredPeakBitRate is also set, so cellular playback can be capped." : ""}`
          : usesProgressive
            ? "Video is played from progressive .mp4 URLs with no HLS manifest. A progressive file has ONE fixed bitrate, so on a weak or metered connection the player cannot step down — it just buffers. For a video-led app this is usually the single largest cause of \"slow on low data\". Serve an HLS (.m3u8) ladder and set preferredPeakBitRate on cellular."
            : "Video playback detected but no media URLs found in the sampled source — confirm whether delivery is HLS.",
      evidence: playsVideo && usesProgressive && !usesHls ? "Progressive .mp4 playback, no .m3u8 manifest" : undefined,
    }),
  );

  // HTTP response cache. Requires a cache to be CONSTRUCTED or SIZED — merely
  // referencing URLSessionConfiguration passed an app whose only use of it was a
  // background download session, which caches no responses at all.
  const configuresCache = /(URLCache\s*\(|\.urlCache\s*=|\.diskCapacity|\.memoryCapacity|\.requestCachePolicy\s*=)/i.test(ctx.swift);
  const sharedOnly = /URLSession\.shared/.test(ctx.swift) && !/URLSession\s*\(\s*configuration:/.test(ctx.swift);
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "ios_url_cache",
      label: "HTTP response caching configured",
      status: configuresCache ? "PASS" : "WARN",
      detail: configuresCache
        ? "A URLCache or URLSessionConfiguration cache policy is configured."
        : `No URLCache or URLSessionConfiguration cache sizing found${sharedOnly ? " — all traffic goes through URLSession.shared" : ""}. The shared session's default cache is small and memory-biased, so list and detail responses are refetched constantly on a slow connection. Create a URLSessionConfiguration with an explicit on-disk URLCache and a cache policy per endpoint.`,
    }),
  );

  // Image caching.
  const imageCache = /(Kingfisher|SDWebImage|Nuke|NSCache|CachedAsyncImage|ImageCache)/i.test(ctx.swift) ||
    ctx.snapshot.paths.some((p) => /Kingfisher|SDWebImage|Nuke/i.test(p));
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "ios_image_cache",
      label: "Image caching in place",
      status: imageCache ? "PASS" : "WARN",
      detail: imageCache
        ? "An image cache is in use (caching library or NSCache), so images are not refetched on every appearance."
        : "No image caching detected. SwiftUI's AsyncImage does not cache to disk, so every scroll back through a feed refetches full-size images — expensive on a metered or weak connection. Use a caching image loader or back AsyncImage with a URLCache.",
    }),
  );

  // Downsampling — decoding a 4000px JPEG into a 120px thumbnail is a common stall.
  const downsamples = /(downsampl|DownsamplingImageProcessor|ResizingImageProcessor|preparingThumbnail|thumbnail\(size|CGImageSourceCreateThumbnail|\.resize\()/i.test(ctx.swift);
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "ios_image_downsampling",
      label: "Images downsampled before display",
      status: !imageCache ? "SKIPPED" : downsamples ? "PASS" : "WARN",
      detail: !imageCache
        ? "No image loading pipeline detected to inspect."
        : downsamples
          ? "Images are downsampled/thumbnailed before display, so memory and decode cost track the display size."
          : "No image downsampling detected. Decoding full-resolution images into small views wastes bandwidth and memory and causes visible scroll stutter — add a downsampling processor sized to the view, or request a smaller asset variant from the CDN.",
    }),
  );

  // Explicit timeouts — the default 60s reads as a hang on a bad connection.
  const setsTimeout = /(timeoutIntervalForRequest|timeoutIntervalForResource|\.timeoutInterval\s*=)/i.test(ctx.swift);
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "ios_request_timeout",
      label: "Explicit network timeouts set",
      status: setsTimeout ? "PASS" : "WARN",
      detail: setsTimeout
        ? "Explicit request/resource timeouts are configured."
        : "No explicit network timeout found, so requests use the 60-second default. On a weak connection that reads to the user as a frozen screen rather than a failure — set timeoutIntervalForRequest to something the UI can honestly wait for, and surface a retry.",
    }),
  );

  // Offline / cache fallback when the network is unavailable.
  const cacheFallback = /(returnCacheDataElseLoad|returnCacheDataDontLoad|useProtocolCachePolicy|waitsForConnectivity)/i.test(ctx.swift);
  checks.push(
    absence(ctx, {
      category: C,
      checkKey: "ios_offline_cache_fallback",
      label: "Serves cached data when offline",
      status: cacheFallback ? "PASS" : "WARN",
      detail: cacheFallback
        ? "A cache-fallback policy is applied when the network is unavailable, so previously-loaded content still renders offline."
        : "No offline cache-fallback policy detected. Without returnCacheDataElseLoad (or waitsForConnectivity) a brief connection drop empties the UI instead of showing the last-known content.",
    }),
  );

  return checks;
}

// ── Code quality & delivery ─────────────────────────────────────────────────

function codeQualityChecks(ctx: IosContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const C = CATEGORIES.CODE_QUALITY;
  const paths = ctx.snapshot.paths;
  const hasPbxproj = ctx.pbxproj.length > 0;

  // Test targets — read from the project file, not a top-level folder.
  const unitTargets = countMatches(ctx.pbxproj, /PRODUCT_BUNDLE_IDENTIFIER[^\n;]*Tests\b/);
  const testBundles = countMatches(ctx.pbxproj, /com\.apple\.product-type\.bundle\.unit-test/);
  const uiTestBundles = countMatches(ctx.pbxproj, /com\.apple\.product-type\.bundle\.ui-testing/);
  const testFiles = paths.filter((p) => /Tests?\/.*\.swift$|.*Tests?\.swift$/i.test(p) && !isVendoredPath(p)).length;

  checks.push({
    category: C,
    checkKey: "ios_test_target",
    label: "Unit test target present",
    status: !hasPbxproj ? "SKIPPED" : testBundles > 0 || unitTargets > 0 || testFiles > 0 ? "PASS" : "FAIL",
    detail: !hasPbxproj
      ? "Could not read project.pbxproj."
      : testBundles > 0 || unitTargets > 0 || testFiles > 0
        ? `Unit test target detected (${testFiles} test file${testFiles !== 1 ? "s" : ""}).`
        : `No unit test target and no test files anywhere in the repository (${ctx.swiftTotal} Swift files). Nothing verifies a change before it reaches the App Store, and with no CI either, every release rests on manual checking.`,
  });

  checks.push({
    category: C,
    checkKey: "ios_ui_test_target",
    label: "UI test target present",
    status: !hasPbxproj ? "SKIPPED" : uiTestBundles > 0 ? "PASS" : "WARN",
    detail: !hasPbxproj
      ? "Could not read project.pbxproj."
      : uiTestBundles > 0
        ? "XCUITest UI test target detected."
        : "No XCUITest target. A handful of UI tests over the critical paths (launch, sign-in, purchase) catch the regressions that unit tests structurally cannot.",
  });

  // Dependency pinning — the lockfile question, in native terms.
  const hasPodfile = paths.some((p) => /(^|\/)Podfile$/i.test(p));
  const hasPodLock = paths.some((p) => /(^|\/)Podfile\.lock$/i.test(p));
  const hasSpm = paths.some((p) => /(^|\/)Package\.swift$/i.test(p)) || /XCRemoteSwiftPackageReference/.test(ctx.pbxproj);
  const hasSpmLock = paths.some((p) => /Package\.resolved$/i.test(p));
  const unpinned = (hasPodfile && !hasPodLock) || (hasSpm && !hasSpmLock);
  const anyDeps = hasPodfile || hasSpm;
  checks.push({
    category: C,
    checkKey: "ios_dependency_pinning",
    label: "Dependencies pinned (Podfile.lock / Package.resolved)",
    status: !anyDeps ? "SKIPPED" : unpinned ? "FAIL" : "PASS",
    detail: !anyDeps
      ? "No CocoaPods or Swift Package Manager dependencies detected."
      : unpinned
        ? `Dependencies are declared but not pinned — ${hasPodfile && !hasPodLock ? "Podfile.lock is missing" : "Package.resolved is missing"}. Two builds from the same commit can resolve different versions, so a release is not reproducible and a bad upstream release lands silently.`
        : `Dependencies are fully pinned (${[hasPodLock && "Podfile.lock", hasSpmLock && "Package.resolved"].filter(Boolean).join(" + ")}), so builds are reproducible.`,
  });

  // Vendored dependency trees committed to git.
  const vendoredFiles = paths.filter((p) => /^(Pods|Carthage)\//i.test(p)).length;
  checks.push({
    category: C,
    checkKey: "ios_vendored_deps_committed",
    label: "Dependency sources not committed",
    status: vendoredFiles === 0 ? "PASS" : vendoredFiles > 200 ? "WARN" : "PASS",
    detail:
      vendoredFiles === 0
        ? "No vendored dependency tree committed — dependencies are resolved from the lockfile."
        : `${vendoredFiles} files under Pods/ or Carthage/ are committed (${Math.round((vendoredFiles / Math.max(paths.length, 1)) * 100)}% of the repository). Committing the dependency tree is a defensible choice for build determinism, but it bloats clones and turns every dependency bump into a large, unreviewable diff. With the lockfile committed it is redundant.`,
  });

  // Swift linting.
  const hasSwiftLint = paths.some((p) => /(^|\/)\.swiftlint\.ya?ml$/i.test(p)) || /SwiftLint/i.test(ctx.pbxproj);
  const hasSwiftFormat = paths.some((p) => /(^|\/)\.swiftformat$/i.test(p));
  checks.push({
    category: C,
    checkKey: "ios_swiftlint",
    label: "Swift linter configured (SwiftLint / swift-format)",
    status: hasSwiftLint || hasSwiftFormat ? "PASS" : "WARN",
    detail:
      hasSwiftLint || hasSwiftFormat
        ? `Swift linting configured (${hasSwiftLint ? "SwiftLint" : "swift-format"}).`
        : "No SwiftLint or swift-format configuration. A linter is how the force-unwrap, force-cast and file-length rules below get enforced continuously instead of found in review.",
  });

  // Crash-risk density. Credit a clean result — a readout that can only subtract is not trusted.
  const forceTry = countMatches(ctx.swift, /\btry!/);
  const forceCast = countMatches(ctx.swift, /\sas!\s/);
  const fatal = countMatches(ctx.swift, /fatalError\s*\(/);
  const forceUrl = countMatches(ctx.swift, /URL\(string:[^)]*\)!/);
  const crashRisk = forceTry + forceCast + fatal + forceUrl;
  // Per 1,000 LINES, not per file — a per-file rate is meaningless because file size
  // varies by orders of magnitude. Below MIN_DENSITY_LINES there is too little source
  // to derive a rate at all, so the check skips rather than reporting noise.
  const MIN_DENSITY_LINES = 200;
  const lines = ctx.swift === "" ? 0 : ctx.swift.split("\n").length;
  const per1kLines = lines > 0 ? (crashRisk / lines) * 1000 : 0;
  const tooSmall = lines < MIN_DENSITY_LINES;
  checks.push({
    category: C,
    checkKey: "ios_force_unwrap_density",
    label: "Force-unwrap / force-cast density",
    status: tooSmall ? "SKIPPED" : per1kLines <= 3 ? "PASS" : per1kLines <= 10 ? "WARN" : "FAIL",
    detail: tooSmall
      ? `Only ${lines} line${lines !== 1 ? "s" : ""} of Swift source available — too little to measure a meaningful density.`
      : `${crashRisk} crash-prone construct${crashRisk !== 1 ? "s" : ""} across ${lines.toLocaleString()} sampled lines — ${per1kLines.toFixed(1)} per 1,000 lines (try! ${forceTry}, as! ${forceCast}, fatalError ${fatal}, forced URL ${forceUrl}).${per1kLines <= 3 ? " That is a low density: these are the constructs that turn an unexpected server response into a crash, and this codebase largely avoids them." : " Each of these turns an unexpected value into a crash; prefer guard let / try? with a real failure path."}`,
  });

  // A networking layer that throws away the status code can't handle 401.
  const discardsStatus = /statusCode:\s*nil/.test(ctx.swift);
  const readsStatus = /(httpResponse|response)\.statusCode/.test(ctx.swift);
  const hasRefreshEndpoint = /(refreshToken|auth\/refresh|\/refresh)/i.test(ctx.swift);
  checks.push({
    category: C,
    checkKey: "ios_http_status_discarded",
    label: "HTTP status codes propagated to error handling",
    status: discardsStatus && readsStatus ? "FAIL" : discardsStatus ? "WARN" : "PASS",
    detail:
      discardsStatus && readsStatus
        ? `The networking layer reads httpResponse.statusCode but then constructs its errors with statusCode: nil, so the status never reaches the caller. Nothing downstream can distinguish a 401 from a 500${hasRefreshEndpoint ? ", even though a token-refresh endpoint exists" : ""} — so an expired session surfaces as a generic error instead of triggering a refresh-and-retry, and any "token expired" branch can only work by string-matching a server message.`
        : discardsStatus
          ? "Errors are constructed with statusCode: nil in places. Propagate the HTTP status so callers can handle 401 and 429 distinctly from a generic failure."
          : "HTTP status codes are propagated into the error model.",
    evidence: discardsStatus && readsStatus ? "statusCode: nil at error construction" : undefined,
  });

  // Editor/OS cruft that a .gitignore would have caught.
  const dsStore = paths.filter((p) => /(^|\/)\.DS_Store$/.test(p)).length;
  const xcuserdata = paths.filter((p) => /xcuserdata\//.test(p)).length;
  const junk = dsStore + xcuserdata;
  checks.push({
    category: C,
    checkKey: "ios_committed_junk",
    label: "No editor / OS cruft committed",
    status: junk === 0 ? "PASS" : junk > 10 ? "WARN" : "PASS",
    detail:
      junk === 0
        ? "No .DS_Store or xcuserdata files committed."
        : `${junk} cruft file${junk !== 1 ? "s" : ""} committed (${dsStore} .DS_Store, ${xcuserdata} xcuserdata). xcuserdata carries per-developer schemes and breakpoints, so it causes avoidable merge conflicts. Add the standard Swift .gitignore.`,
  });

  return checks;
}
