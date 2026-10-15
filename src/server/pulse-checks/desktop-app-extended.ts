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
import { isVendoredPath, sampleCoverage, type RepoSnapshot } from "./native-mobile";

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
  tauriConf: string;
  packageJson: string;
  builderConfig: string;
  /** Renderer HTML entry files (where an Electron CSP <meta> usually lives). */
  html: string;
  /** Sampled fraction of the repo's JS/TS/Rust source files (0–1). */
  coverage: number;
}

function buildCtx(snapshot: RepoSnapshot, shape: DesktopShape): Ctx {
  const src: string[] = [];
  const tauri: string[] = [];
  const builder: string[] = [];
  const html: string[] = [];
  let packageJson = "";
  for (const [path, text] of snapshot.files) {
    if (/\.html?$/i.test(path)) html.push(text);
    if (/\.(ts|tsx|js|jsx|mjs|cjs|rs)$/i.test(path)) {
      // Tests, mocks and vendored code are not the shipped app: a jest mock of `electron`
      // (`setPermissionRequestHandler: jest.fn()`) must not stand in for the app's own handler.
      if (isShippedSourcePath(path)) src.push(text);
    } else if (/tauri\.conf\.json$|capabilities\/.*\.(json|toml)$/i.test(path)) tauri.push(text);
    else if (/electron-builder\.|forge\.config\./i.test(path)) builder.push(text);
    if (/(^|\/)package\.json$/i.test(path) && !packageJson) packageJson = text;
  }
  return {
    shape,
    source: src.join("\n"),
    tauriConf: tauri.join("\n"),
    packageJson,
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
      confidence: thin ? "LOW" : "HIGH",
      detail: thin
        ? `${detail} (Based on ${Math.round(ctx.coverage * 100)}% of this project's source files — below the ` +
          `threshold for a confident "not present anywhere", so this is inconclusive rather than a failure.)`
        : detail,
    });
  };

  const navGuard = isElectron
    ? /will-navigate|setWindowOpenHandler|will-attach-webview/.test(ctx.source)
    : /"?dangerousRemoteDomainIpcAccess"?|navigation|"?capabilities"?/.test(ctx.tauriConf);
  add(
    "desk_x_navigation_guard",
    "The app blocks navigation to untrusted origins",
    navGuard ? "PASS" : "WARN",
    navGuard
      ? "Navigation is intercepted, so the app window cannot be steered to an arbitrary origin."
      : "No navigation guard was found. Without a will-navigate handler (Electron) or a navigation allowlist " +
        "(Tauri), a link or redirect inside the app can move the main window to any URL — and that window keeps " +
        "whatever privileges the app granted it, so a phishing page renders inside your signed application chrome.",
    // Electron handlers live in sampled source; Tauri's allowlist is in tauri.conf.json, which is always read.
    isElectron,
  );

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

  const protocolHandler = /registerFileProtocol|registerSchemesAsPrivileged|setAsDefaultProtocolClient|tauri:\/\//.test(
    all,
  );
  const protocolValidated = /path\.normalize|decodeURIComponent|startsWith\(|canonicalize/.test(ctx.source);
  add(
    "desk_x_protocol_handler",
    "Custom protocol handlers validate their input",
    !protocolHandler ? "SKIPPED" : protocolValidated ? "PASS" : "WARN",
    !protocolHandler
      ? "The app registers no custom protocol handler."
      : protocolValidated
        ? "Custom protocol handlers normalise and check the paths they are given."
        : "A custom protocol handler is registered with no visible path validation. A custom scheme can be invoked " +
          "by any web page in the user's browser, so its argument is untrusted input — an unnormalised path is a " +
          "directory traversal that reads files from anywhere on the machine.",
  );

  const keychain = /keytar|safeStorage|keyring|credential-?manager|secret-service/i.test(all);
  const storesCreds = /token|password|refreshToken|apiKey/i.test(ctx.source);
  add(
    "desk_x_credentials_plaintext",
    "Credentials are stored in the OS keychain",
    !storesCreds ? "SKIPPED" : keychain ? "PASS" : "WARN",
    !storesCreds
      ? "The sampled source shows no credential storage."
      : keychain
        ? "Credentials go through the OS keychain (safeStorage, keytar or the platform keyring), so they are " +
          "encrypted at rest with the user's login."
        : "The app stores tokens or passwords with no OS keychain integration. Anything written to a plain file or " +
          "to localStorage in the app's data directory is readable by every other program running as that user — " +
          "including anything the user installs later.",
  );

  const updateSig = /publisherName|verifyUpdateCodeSignature|"?pubkey"?|updater.*signature|SIGNING_KEY/i.test(all);
  const hasUpdater = /autoUpdater|electron-updater|tauri.*updater|"?updater"?:/i.test(all);
  add(
    "desk_x_update_signature",
    "Auto-updates verify a signature",
    !hasUpdater ? "SKIPPED" : updateSig ? "PASS" : "FAIL",
    !hasUpdater
      ? "No auto-update mechanism was found."
      : updateSig
        ? "The updater verifies a signature before applying an update."
        : "An auto-updater is configured with no signature verification. The updater downloads and executes code " +
          "with the user's privileges, so whoever can serve or intercept that download owns every installation. " +
          "This is the single highest-severity finding available in a desktop app.",
  );

  // The Electron API is a METHOD (webContents.openDevTools / win.openDevTools). A bare `openDevTools(`
  // is the app's own function — e.g. a Tauri app's user-clicked "open devtools" command wrapper.
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

  // `"csp": null` (or ""/false) in tauri.conf.json is Tauri's way of saying NO policy — not a declared one.
  // The left boundary stops `"devCsp"` (dev builds only) from counting as the shipped policy.
  const csp = /Content-Security-Policy|(?<![\w$-])["']?csp["']?\s*:\s*(?!null\b|false\b|undefined\b|""|'')[\w"'{`\[]/i.test(
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

  const shellOpen = /shell\.openExternal\(/.test(ctx.source);
  const shellValidated = /startsWith\(["']https?:|new URL\(|protocol\s*===|\/\^https\??:/.test(ctx.source);
  add(
    "desk_x_shell_open_external",
    "External links are opened without arbitrary shell execution",
    !shellOpen ? "PASS" : shellValidated ? "PASS" : "WARN",
    !shellOpen
      ? "The app does not call shell.openExternal."
      : shellValidated
        ? "shell.openExternal is called with a validated URL scheme."
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

  const crashReporter = /crashReporter|sentry|bugsnag|crashpad|minidump/i.test(all);
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
