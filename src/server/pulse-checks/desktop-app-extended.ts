// ─────────────────────────────────────────────────────────────────────────────
// DESKTOP — SECOND FAMILY (Electron + Tauri).
//
// desktop-app.ts covers the process-model settings that decide whether a page the
// app loads becomes code on the user's machine: nodeIntegration, contextIsolation,
// sandbox, signing, update transport. This file covers what ships around them —
// navigation control, protocol handlers, permission prompts, local storage of
// credentials, and the auto-update channel's own integrity.
//
// Desktop is the highest-severity family in Pulse because the blast radius is the
// user's computer rather than a browser tab, so absence findings here are stated
// carefully: each one says what was looked for and where.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import { isVendoredPath, sampleCoverage, stripCStyleComments, type RepoSnapshot } from "./native-mobile";
import {
  crashReportingPresent,
  desktopManifests,
  electronCspDeclared,
  electronNavGuardPresent,
  electronUpdaterPresent,
  enabledSettings,
  openExternalCallSites,
} from "./desktop-app";
import type { PackageManifest } from "./project-shape";

/** Below this sampled fraction, "not found" is inconclusive rather than a finding — same rule as desktop-app.ts. */
const SOUND_ABSENCE_COVERAGE = 0.3;

/** Source that ships: not vendored, not a test, spec, mock or fixture. */
function isShippedSourcePath(path: string): boolean {
  return !isVendoredPath(path) &&
    !/(^|\/)(specs?|tests?|__tests__|__mocks__|mocks?|e2e|fixtures?|__fixtures__)\/|\.(test|spec|tests)\.[cm]?[jt]sx?$/i.test(path);
}

export type DesktopShape = "electron" | "tauri";

interface Ctx {
  shape: DesktopShape;
  source: string;
  /** Shipped JS/TS only, comments intact — for call-site analysis. */
  jsRaw: string;
  /** Shipped Rust, comments stripped (per file). */
  rust: string;
  /** Shipped JS/TS (raw) and Rust (stripped) files individually, for per-file analysis. */
  jsFiles: string[];
  rustFiles: string[];
  /** Cargo.toml text(s) — where Tauri's cargo features (e.g. "devtools") are switched on. */
  cargo: string;
  tauriConf: string;
  /** The desktop app's own package.json manifest(s) — not the first in map order (see desktopManifests). */
  packageJson: string;
  pkg: PackageManifest | null;
  builderConfig: string;
  /** Renderer HTML entry files (where an Electron CSP <meta> usually lives). */
  html: string;
  /** Sampled fraction of the repo's JS/TS/Rust source files (0–1). */
  coverage: number;
}

function buildCtx(snapshot: RepoSnapshot, shape: DesktopShape): Ctx {
  const src: string[] = [];
  const js: string[] = [];
  const rust: string[] = [];
  const cargo: string[] = [];
  const tauri: string[] = [];
  const builder: string[] = [];
  const html: string[] = [];
  for (const [path, text] of snapshot.files) {
    if (/\.html?$/i.test(path) && isShippedSourcePath(path)) html.push(text);
    if (/\.(ts|tsx|js|jsx|mjs|cjs|rs)$/i.test(path)) {
      // Tests, mocks and vendored code are not the shipped app: a jest mock of `electron`
      // (`setPermissionRequestHandler: jest.fn()`) must not stand in for the app's own handler.
      if (isShippedSourcePath(path)) {
        src.push(text);
        (/\.rs$/i.test(path) ? rust : js).push(text);
      }
    } else if (/tauri\.conf\.json$|capabilities\/.*\.(json|toml)$/i.test(path)) tauri.push(text);
    else if (/(^|\/)Cargo\.toml$/i.test(path) && !isVendoredPath(path)) cargo.push(text);
    else if (/electron-builder\.|forge\.config\./i.test(path)) builder.push(text);
  }
  const manifests = desktopManifests(snapshot.files, shape);
  const rustFiles = rust.map((t) => stripCStyleComments(t));
  return {
    shape,
    source: src.join("\n"),
    jsRaw: js.join("\n"),
    rust: rustFiles.join("\n"),
    jsFiles: js,
    rustFiles,
    cargo: cargo.join("\n"),
    tauriConf: tauri.join("\n"),
    packageJson: manifests.text,
    pkg: manifests.pkg,
    builderConfig: builder.join("\n"),
    html: html.join("\n"),
    coverage: sampleCoverage(
      src.length,
      snapshot.paths.filter((p) => /\.(ts|tsx|js|jsx|mjs|cjs|rs)$/i.test(p) && isShippedSourcePath(p)).length,
      snapshot.truncated,
    ),
  };
}

const CATALOGUE: [string, string][] = [
  ["desk_x_navigation_guard", "The app blocks navigation to untrusted origins"],
  ["desk_x_new_window_guard", "Window and popup requests are intercepted"],
  ["desk_x_permission_handler", "Device permission requests are answered explicitly"],
  ["desk_x_webview_tag", "The deprecated webview tag is not enabled"],
  ["desk_x_remote_module", "The removed remote module is not used"],
  ["desk_x_protocol_handler", "Custom protocol handlers validate their input"],
  ["desk_x_credentials_plaintext", "Credentials are stored in the OS keychain"],
  ["desk_x_update_signature", "Auto-updates verify a signature"],
  ["desk_x_devtools_release", "DevTools are not opened in release builds"],
  ["desk_x_csp_defined", "The renderer declares a content security policy"],
  ["desk_x_shell_open_external", "External links are opened without arbitrary shell execution"],
  ["desk_x_single_instance", "The app enforces a single running instance"],
  ["desk_x_crash_reporter", "The app reports crashes"],
];

export const DESKTOP_EXTENDED_KEYS: string[] = CATALOGUE.map(([k]) => k);

export function evaluateDesktopExtendedChecks(
  snapshot: RepoSnapshot,
  shape: DesktopShape,
): PulseScanCheckInput[] {
  const ctx = buildCtx(snapshot, shape);
  const checks: PulseScanCheckInput[] = [];
  const isElectron = shape === "electron";
  const all = ctx.source + ctx.tauriConf + ctx.packageJson + ctx.builderConfig;

  const add = (
    checkKey: string,
    label: string,
    status: PulseScanCheckInput["status"],
    detail: string,
    absence = false,
  ) => {
    // An ABSENCE finding ("we looked and did not find X") is sound only when the
    // sample is broad enough — same rule as desktop-app.ts's absence().
    const thin = absence && status === "WARN" && ctx.coverage < SOUND_ABSENCE_COVERAGE;
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey,
      label,
      status,
      confidence: thin || status === "INCONCLUSIVE" ? "LOW" : "HIGH",
      detail: thin
        ? `${detail} (Based on ${Math.round(ctx.coverage * 100)}% of this project's source files — below the ` +
          `threshold for a confident "not present anywhere", so this is inconclusive rather than a failure.)`
        : detail,
    });
  };

  // Electron: the same detection as electron_navigation_guard, so the two cannot disagree
  // (setWindowOpenHandler controls NEW windows, not navigation of this one).
  // Tauri: only a Rust `on_navigation` handler is a guard. The old test passed on the word
  // "capabilities" in tauri.conf.json, which every v2 app has. And a Tauri window that
  // navigates away does NOT take the IPC bridge with it unless remote IPC is configured —
  // so a missing guard only matters when it is.
  if (isElectron) {
    const navGuard = electronNavGuardPresent(ctx.source.replace(/^\s*\/\/.*$/gm, ""));
    add(
      "desk_x_navigation_guard",
      "The app blocks navigation to untrusted origins",
      navGuard ? "PASS" : "WARN",
      navGuard
        ? "Navigation is intercepted, so the app window cannot be steered to an arbitrary origin."
        : "No navigation guard was found. Without a will-navigate handler, a link or redirect inside the app can move " +
          "the main window to any URL — and that window keeps whatever privileges the app granted it, so a phishing " +
          "page renders inside your signed application chrome.",
      true,
    );
  } else {
    const onNavigation = /\bon_navigation\s*\(/.test(ctx.rust);
    const remoteIpc = /"dangerousRemoteDomainIpcAccess"|"remote"\s*:\s*\{[^}]*"urls"/i.test(ctx.tauriConf);
    add(
      "desk_x_navigation_guard",
      "The app blocks navigation to untrusted origins",
      onNavigation ? "PASS" : remoteIpc ? "WARN" : "SKIPPED",
      onNavigation
        ? "An on_navigation handler decides which URLs the webview may navigate to."
        : remoteIpc
          ? "Remote origins are granted IPC access and no on_navigation handler was found. A link or redirect can then " +
            "move the window to a page that can call your Tauri commands. Add an on_navigation handler that allows " +
            "only your own origins."
          : "No on_navigation handler was found, but Tauri grants no IPC to remote origins unless remote access is " +
            "configured, so navigating away does not carry the app's privileges. Not assessed.",
      true,
    );
  }

  const windowGuard = isElectron
    ? /setWindowOpenHandler|new-window/.test(ctx.source)
    : true;
  add(
    "desk_x_new_window_guard",
    "Window and popup requests are intercepted",
    !isElectron ? "SKIPPED" : windowGuard ? "PASS" : "WARN",
    !isElectron
      ? "Tauri has no equivalent of Electron's window-open handler; window creation is controlled by the app's own " +
        "configuration."
      : windowGuard
        ? "window.open is intercepted with setWindowOpenHandler."
        : "No setWindowOpenHandler was found. Any `window.open` from loaded content then creates a real BrowserWindow " +
          "the app did not configure — which by default does not inherit the parent's hardening.",
    true,
  );

  const permHandler = /setPermissionRequestHandler|setPermissionCheckHandler/.test(ctx.source);
  add(
    "desk_x_permission_handler",
    "Device permission requests are answered explicitly",
    !isElectron ? "SKIPPED" : permHandler ? "PASS" : "WARN",
    !isElectron
      ? "Tauri gates device access through its capability system rather than a runtime permission handler."
      : permHandler
        ? "A permission request handler is installed, so camera, microphone and location requests are decided by the " +
          "app rather than granted by default."
        : "No permission request handler is installed. Electron grants permission requests from loaded content by " +
          "default in some versions — meaning a page in the app can reach the camera or microphone without the " +
          "user being asked in the way a browser would ask.",
    true,
  );

  const webviewTag = /webviewTag:\s*true|<webview/.test(ctx.source);
  add(
    "desk_x_webview_tag",
    "The deprecated webview tag is not enabled",
    !isElectron ? "SKIPPED" : webviewTag ? "WARN" : "PASS",
    !isElectron
      ? "The webview tag is Electron-specific."
      : webviewTag
        ? "The <webview> tag is enabled. Electron's own guidance is to avoid it — it is not actively maintained, its " +
          "security properties differ from a BrowserWindow, and it does not inherit the parent's hardening. Use a " +
          "BrowserView or a child window instead."
        : "The deprecated webview tag is not enabled.",
  );

  const remoteModule = /enableRemoteModule|@electron\/remote/.test(all);
  add(
    "desk_x_remote_module",
    "The removed remote module is not used",
    !isElectron ? "SKIPPED" : remoteModule ? "FAIL" : "PASS",
    !isElectron
      ? "The remote module is Electron-specific."
      : remoteModule
        ? "The remote module is in use. It gives renderer code direct access to main-process objects, which means " +
          "any script that runs in the renderer — including one injected into a page the app loaded — can reach the " +
          "filesystem and spawn processes. It was removed from Electron core precisely because it defeats context " +
          "isolation."
        : "The remote module is not used.",
  );

  // Inline handlers (protocol.handle, register_uri_scheme_protocol) receive the request
  // directly, so validation is looked for within ±500 characters. URL-delivery events
  // (open-url, deep-link on_open_url) routinely hand the URL to a parser elsewhere in the
  // module (fiddle's protocol.ts), so for those the whole file counts. A `tauri://localhost`
  // string is not a registration — it is Tauri's own asset origin, and clash-verge-rev PASSed
  // on it from a CORS allow-list.
  const INLINE_HANDLER = isElectron
    ? /\bprotocol\.(handle|registerFileProtocol|registerBufferProtocol|registerStringProtocol|registerHttpProtocol|registerStreamProtocol|interceptFileProtocol)\s*\(/g
    : /\bregister_(asynchronous_)?uri_scheme_protocol\s*\(/g;
  const URL_EVENT = isElectron ? /\.on\(\s*["']open-url["']/ : /\bon_open_url\s*\(/;
  const declared = isElectron
    ? /\bsetAsDefaultProtocolClient\s*\(|\bregisterSchemesAsPrivileged\s*\(/.test(ctx.jsRaw)
    : /"deep-link"\s*:|tauri_plugin_deep_link|tauri-plugin-deep-link/.test(ctx.tauriConf + ctx.cargo + ctx.rust);
  const PROTOCOL_VALIDATION =
    /path\.(posix\.)?normalize|path\.resolve|decodeURIComponent|startsWith\(|starts_with\(|canonicalize|realpath|new URL\(|\.host(name)?\s*[!=]==|Url::parse|\.scheme\(\)/;
  let handlers = 0, unvalidated = 0, unvalidatedEvents = 0;
  for (const file of isElectron ? ctx.jsFiles : ctx.rustFiles) {
    for (const m of file.matchAll(INLINE_HANDLER)) {
      handlers++;
      const at = m.index ?? 0;
      if (!PROTOCOL_VALIDATION.test(file.slice(Math.max(0, at - 500), at + 500))) unvalidated++;
    }
    if (URL_EVENT.test(file)) {
      handlers++;
      if (!PROTOCOL_VALIDATION.test(file)) {
        unvalidated++;
        unvalidatedEvents++;
      }
    }
  }
  const hasProtocol = handlers > 0 || declared;
  const protocolOk = handlers > 0 && unvalidated === 0;
  add(
    "desk_x_protocol_handler",
    "Custom protocol handlers validate their input",
    !hasProtocol ? "SKIPPED" : protocolOk ? "PASS" : "WARN",
    !hasProtocol
      ? "The app registers no custom protocol handler."
      : protocolOk
        ? "Custom protocol handlers parse or normalise the URLs and paths they are given."
        : handlers === 0
          ? "A custom URL scheme is registered, but the code that handles incoming URLs was not in the sampled source, " +
            "so whether it validates them is unconfirmed. A custom scheme can be invoked by any web page in the user's " +
            "browser, so its argument is untrusted input."
          : "A custom protocol handler has no visible path or URL validation next to it (it may delegate to a helper " +
            "elsewhere). A custom scheme can be invoked by any web page in the user's browser, so its argument is " +
            "untrusted input — an unnormalised path is a directory traversal that reads files from anywhere on the machine.",
    true,
  );
  // A URL-event handler that passes the URL to another module (clash-verge-rev: on_open_url →
  // resolve_scheme, which does Url::parse plus a scheme match) cannot be judged from its own
  // file, and an unseen handler cannot be judged at all.
  if (hasProtocol && !protocolOk && (handlers === 0 || unvalidated === unvalidatedEvents)) {
    checks[checks.length - 1].confidence = "LOW";
  }

  // Only a plaintext WRITE of a credential-named value is a finding. The old test fired on any
  // word "token" in the source — marktext's markdown lexer tokens — and WARNed at HIGH on an
  // app that stores its secrets with keytar.
  const keychain = /keytar|safeStorage|\bkeyring\b|credential-?manager|secret-service|tauri-plugin-stronghold/i.test(
    ctx.source + ctx.packageJson + ctx.cargo,
  );
  const CRED = String.raw`\b(access_?token|refresh_?token|auth_?token|id_?token|api_?key|password|passwd|client_?secret|secret)\b`;
  const plaintextWrite = new RegExp(
    String.raw`(localStorage\.setItem|sessionStorage\.setItem|\bstore\.set|\.writeFile(Sync)?|\bfs\.(promises\.)?write\w*|writeJson\w*|\bfs::write)\s*\(\s*[^;\n]{0,160}?` + CRED,
    "i",
  ).exec(ctx.source);
  add(
    "desk_x_credentials_plaintext",
    "Credentials are stored in the OS keychain",
    keychain ? "PASS" : plaintextWrite ? "WARN" : "SKIPPED",
    keychain
      ? "Credentials go through the OS keychain (safeStorage, keytar or the platform keyring), so they are " +
        "encrypted at rest with the user's login."
      : plaintextWrite
        ? `A credential-named value is written to plain storage (\`${plaintextWrite[0].slice(0, 80)}\`) and the app ` +
          "has no OS keychain integration. Anything written to a plain file or to localStorage in the app's data " +
          "directory is readable by every other program running as that user — including anything installed later."
        : "No plaintext write of a credential (to localStorage, a settings store or a file) was seen in the sampled source.",
  );

  // Electron: electron-updater verifies Windows updates against the app's own publisher by
  // default, and Squirrel.Mac (which update-electron-app drives) refuses an update whose code
  // signature does not match — so "no explicit signature config" is not "unverified". Only an
  // explicit opt-out is a finding; otherwise it rests on release signing we cannot see.
  // Tauri: the updater verifies against the pubkey in tauri.conf.json (always read).
  const hasUpdater = isElectron
    ? electronUpdaterPresent(ctx.pkg, ctx.source, ctx.builderConfig)
    : /tauri-plugin-updater|"updater"\s*:/i.test(ctx.tauriConf + ctx.cargo + ctx.packageJson) &&
      // Tauri v1 `"updater": { "active": false }` is a switched-off updater.
      !/"updater"\s*:\s*\{[^}]*"active"\s*:\s*false/i.test(ctx.tauriConf);
  const sigOptOut = /verifyUpdateCodeSignature\s*[:=]\s*false/i.test(ctx.builderConfig + ctx.source);
  const updateSig = isElectron
    ? /publisherName|verifyUpdateCodeSignature|osxSign|osxNotarize|notarize|SIGNING_KEY/i.test(
      enabledSettings(ctx.builderConfig + ctx.packageJson) + ctx.source,
    )
    : /"pubkey"\s*:\s*"[^"]{20,}"/.test(ctx.tauriConf);
  add(
    "desk_x_update_signature",
    "Auto-updates verify a signature",
    !hasUpdater ? "SKIPPED" : sigOptOut ? "FAIL" : updateSig ? "PASS" : isElectron ? "INCONCLUSIVE" : "FAIL",
    !hasUpdater
      ? "No auto-update mechanism was found."
      : sigOptOut
        ? "verifyUpdateCodeSignature is turned off, so the updater installs a downloaded build without checking who " +
          "signed it. Whoever can serve or intercept that download owns every installation."
        : updateSig
          ? isElectron
            ? "Release builds are configured to be code-signed, and electron-updater and Squirrel.Mac check every " +
              "update against that signature before applying it. The signing identity itself lives outside the " +
              "repository."
            : "The updater has a public key in tauri.conf.json, and Tauri refuses any update not signed with the " +
              "matching private key."
          : isElectron
            ? "An auto-updater is in use with no explicit signature configuration in the repository. electron-updater " +
              "and Squirrel.Mac verify updates against the app's own code signature by default, so this is safe exactly " +
              "when release builds are signed — which is configured outside the repository and not confirmed here."
            : "An auto-updater is configured with no updater public key. The updater downloads and executes code with " +
              "the user's privileges, so whoever can serve or intercept that download owns every installation.",
  );

  // The Electron API is a METHOD (webContents.openDevTools / win.openDevTools). A bare `openDevTools(`
  // is the app's own function — e.g. a Tauri app's user-clicked "open devtools" command wrapper.
  // Tauri: `open_devtools()` only exists in a release build when the tauri crate's "devtools"
  // cargo feature is on (it is cfg-gated to debug_assertions otherwise), so the feature is the finding.
  if (isElectron) {
    const devtools = /\.openDevTools\(/.test(ctx.source);
    const devtoolsGuarded = /isDev|NODE_ENV\s*[=!]==?\s*["']development|app\.isPackaged/.test(ctx.source);
    add(
      "desk_x_devtools_release",
      "DevTools are not opened in release builds",
      !devtools ? "PASS" : devtoolsGuarded ? "PASS" : "WARN",
      !devtools
        ? "DevTools are not opened programmatically."
        : devtoolsGuarded
          ? "DevTools are opened behind a development-only guard."
          : "openDevTools is called with no development guard visible in the sampled source, so the developer console " +
            "may be reachable in the shipped application. If it is, it hands any user a full inspector over the app's " +
            "renderer — including its local storage and any in-memory tokens.",
    );
  } else {
    const featureOn = tauriDevtoolsFeatureEnabled(ctx.cargo);
    const opens = /\.open_devtools\s*\(/.test(ctx.rust);
    add(
      "desk_x_devtools_release",
      "DevTools are not opened in release builds",
      featureOn ? "WARN" : "PASS",
      featureOn
        ? "The tauri dependency enables the \"devtools\" cargo feature, which keeps the web inspector in release " +
          `builds${opens ? " — and the app calls open_devtools(), so it can be opened in the shipped app" : ""}. That ` +
          "hands any user a full inspector over the frontend, including its storage and any in-memory tokens. Enable " +
          "the feature only in a debug profile, or behind a cargo feature release builds do not turn on."
        : "The tauri crate's \"devtools\" feature is not enabled, so the inspector is compiled out of release builds.",
    );
  }

  // `"csp": null` (or ""/false) in tauri.conf.json is Tauri's way of saying NO policy — not a declared one.
  // The left boundary stops `"devCsp"` (dev builds only) from counting as the shipped policy.
  // Electron shares electron_csp's detection, so the two cannot disagree; Tauri reads tauri.conf.json's `csp`.
  const csp = isElectron
    ? electronCspDeclared(ctx.jsRaw, ctx.html)
    : /Content-Security-Policy|(?<![\w$-])["']?csp["']?\s*:\s*(?!null\b|false\b|undefined\b|""|'')[\w"'{`\[]/i.test(
      all + "\n" + ctx.html,
    );
  add(
    "desk_x_csp_defined",
    "The renderer declares a content security policy",
    csp ? "PASS" : "WARN",
    csp
      ? "A content security policy is declared for the renderer."
      : "No content security policy was found. In a desktop app the renderer has more privilege than a browser tab, " +
        "so a CSP is the main remaining limit on what injected script can load and connect to once it is running.",
    // Electron's CSP lives in sampled source/HTML; Tauri's is in tauri.conf.json, which is always read,
    // so a Tauri `"csp": null` is an observed fact, not an absence on a sample.
    isElectron,
  );

  // Same per-call-site rule as electron_open_external_validated, so the two cannot disagree.
  // Tauri has no shell.openExternal; its URL opening is judged by tauri_shell_open_validator.
  const openExternal = isElectron ? openExternalCallSites(ctx.jsRaw) : null;
  add(
    "desk_x_shell_open_external",
    "External links are opened without arbitrary shell execution",
    !openExternal ? "SKIPPED" : openExternal.unvalidated === 0 ? "PASS" : "WARN",
    !openExternal
      ? "shell.openExternal is Electron-specific; Tauri's URL opening is covered by the opener/shell scope check."
      : openExternal.total === 0
        ? "The app does not call shell.openExternal."
        : openExternal.unvalidated === 0
          ? "Every shell.openExternal call either uses a fixed URL or validates the URL scheme."
          : "shell.openExternal is called without validating the URL's scheme. It hands the string to the operating " +
            "system, so a `file://` or a platform-specific scheme can launch a local executable rather than opening a " +
            "web page — turning a link in loaded content into code execution.",
  );

  const singleInstance = /requestSingleInstanceLock|single_instance|SingleInstance|second-instance|check_singleton/i.test(all);
  add(
    "desk_x_single_instance",
    "The app enforces a single running instance",
    singleInstance ? "PASS" : "WARN",
    singleInstance
      ? "Single-instance handling was found (a single-instance lock, a second-instance handler or a singleton " +
        "check), so a second launch is handed to the existing instance."
      : "No single-instance lock (requestSingleInstanceLock, a second-instance handler or a Tauri single-instance " +
        "plugin) was found. Without one, a second launch can start a second copy sharing the same data directory, " +
        "which can corrupt local databases and settings files that were not written to expect concurrent writers.",
    true,
  );

  // Shared with desktop_crash_reporting so the two cannot disagree.
  const crashReporter = crashReportingPresent(ctx.pkg, ctx.source, snapshot.paths);
  add(
    "desk_x_crash_reporter",
    "The app reports crashes",
    crashReporter ? "PASS" : "WARN",
    crashReporter
      ? "A crash reporter is configured."
      : "No crash reporter (crashReporter, Sentry, Bugsnag or Crashpad) was found. Without one, crashes on users' " +
        "machines are not sent back to you — at most they land in a local log on the user's computer — so you " +
        "usually learn about them only when a user reports it.",
    true,
  );

  return checks;
}

/**
 * True when a Cargo.toml's runtime `tauri` dependency turns on the "devtools" feature.
 * A dev-dependency does not ship; a [workspace.dependencies] entry does (members inherit it).
 */
export function tauriDevtoolsFeatureEnabled(cargo: string): boolean {
  let section = "";
  const lines = cargo.split("\n");
  const depth = (l: string) => (l.match(/[[{]/g) ?? []).length - (l.match(/[\]}]/g) ?? []).length;
  for (let i = 0; i < lines.length; i++) {
    const header = /^\s*\[([^\]]+)\]/.exec(lines[i]);
    if (header) {
      section = header[1].trim();
      continue;
    }
    if (!/^\s*tauri\s*=/.test(lines[i]) || /dev-dependencies/.test(section)) continue;
    // Collect the (possibly multi-line) inline table.
    let entry = lines[i];
    for (let j = i + 1, d = depth(entry); d > 0 && j < lines.length; j++) {
      entry += "\n" + lines[j];
      d += depth(lines[j]);
    }
    if (/features\s*=\s*\[[^\]]*"devtools"/.test(entry.replace(/#.*$/gm, ""))) return true;
  }
  return false;
}
