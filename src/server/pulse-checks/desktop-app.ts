// ─────────────────────────────────────────────────────────────────────────────
// DESKTOP APP CHECK FAMILY — Electron and Tauri.
//
// WHY THIS EXISTS. "Desktop app" has been selectable in the scan dropdown since
// the beginning and had ZERO checks behind it. The dropdown only ever removed
// three irrelevant categories (SEO, App Store, Global Distribution), so an
// Electron app was graded purely on generic repo hygiene — the same hole iOS was
// in before §34 and Android before §34.7.
//
// It is also the highest-severity family in Pulse, because Electron's insecure
// settings are not "suboptimal": `nodeIntegration: true` with
// `contextIsolation: false` means any script the renderer loads — a compromised
// CDN, an ad in an embedded page, a reflected XSS in your own UI — gets Node's
// `require` and therefore `child_process`. That is remote code execution on the
// user's machine with the user's privileges. It is one boolean.
//
// SOURCES. Every check below maps to a named item in Electron's own security
// checklist (electronjs.org/docs/latest/tutorial/security) or Tauri's security
// documentation — see docs/platform-check-sources.md for the per-check citation.
//
// EVIDENCE MODEL (identical to ios-app.ts / android-app.ts, and it matters):
//   • PRESENCE findings ("we found `nodeIntegration: true`") are sound on a
//     sample — we saw it.
//   • ABSENCE findings ("no navigation guard anywhere") are NOT sound on a
//     sample, so they declare confidence: "LOW" when coverage is thin, which
//     score-breakdown.ts excludes from scoring and the UI shows as Inconclusive.
//
// Comments are stripped before matching (stripCStyleComments): a commented-out
// `sandbox: true` is not a live setting. That bug shipped twice already (§34.3,
// §34.6) and it would be especially wrong here, where the whole family is about
// which value is actually in effect.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";
import { isExampleOrFixturePath, isVendoredPath, stripCStyleComments, sampleCoverage } from "./native-mobile";
import { allDependencies, anyDependency, hasDependency, parsePackageManifest, type PackageManifest, type ProjectShape } from "./project-shape";

/**
 * Config text with keys explicitly switched off removed. marktext's electron-builder.yml
 * says `notarize: false` (its builds are ad-hoc signed), and the signing check PASSed on
 * the word "notarize".
 */
export function enabledSettings(config: string): string {
  return config.replace(/["']?\b[\w.-]+["']?\s*[:=]\s*(false|null|undefined)\b/g, "");
}

/** Below this sampled-file coverage, absence findings self-downgrade to LOW. */
const SOUND_ABSENCE_COVERAGE = 0.3;

/**
 * The oldest Electron major still receiving security backports. Electron supports
 * the latest THREE majors and ships a new one every 8 weeks, so this moves roughly
 * every two months — Electron 40 went end-of-life on 30 June 2026.
 *
 * Bump this line when the support window moves. An app on an EOL major inherits
 * every unpatched Chromium CVE disclosed since, which is the single highest-volume
 * source of desktop vulnerabilities.
 */
const ELECTRON_OLDEST_SUPPORTED_MAJOR = 41;

interface DesktopContext {
  shape: Extract<ProjectShape, "electron" | "tauri">;
  /** Sampled JS/TS source with comments stripped — for "is this setting live?". */
  source: string;
  /** Same source, comments intact — for signals that legitimately live in comments. */
  sourceRaw: string;
  /** Main-process / preload sources only, where the security settings live. */
  mainSource: string;
  /** Sampled source minus test/spec/mock files — where a handler's PRESENCE is searched, so a jest mock
   *  of `electron` (`setPermissionRequestHandler: jest.fn()`) or a spec cannot stand in for the app's own guard. */
  appSource: string;
  /** appSource with comments intact — for call-site analysis that must keep offsets and regex literals. */
  appSourceRaw: string;
  /** Renderer HTML entry files — where an Electron CSP <meta> usually lives. */
  html: string;
  /** Rust source (Tauri) with comments stripped. */
  rust: string;
  /** All tauri.conf.json content joined. */
  tauriConf: string;
  /** Tauri v2 capability files joined. */
  capabilities: string;
  /** Every permission entry from capability files and tauri.conf.json, parsed. */
  permissions: unknown[];
  /** Packager config (electron-builder.yml/json, forge.config.*) joined. */
  packagerConfig: string;
  /** GitHub Actions workflow contents joined — where signing secrets are referenced by name. */
  workflows: string;
  pkg: PackageManifest | null;
  /** Sampled fraction of the repo's JS/TS files (0–1). */
  coverage: number;
  paths: string[];
}

/** Files that hold the Electron main-process security settings. */
const MAIN_PROCESS = /(^|\/)(main|index|background|electron|app)\.(js|ts|mjs|cjs)$|(^|\/)(main|electron|background)\//i;
const PRELOAD = /preload/i;
/** Test suites, specs and mocks — never part of the shipped app. */
const NOT_SHIPPED =
  /(^|\/)(specs?|tests?|__tests__|__mocks__|mocks?|e2e|fixtures?|__fixtures__)\/|\.(test|spec|tests)\.[cm]?[jt]sx?$/i;

/** True for source that ships in the app: not vendored, not a test, spec, mock or fixture. */
export function isShippedDesktopSource(path: string): boolean {
  return !isVendoredPath(path) && !NOT_SHIPPED.test(path);
}

/**
 * The package.json manifests that describe the desktop app itself, merged.
 *
 * Reading only the ROOT manifest misses every monorepo: marktext's root package.json
 * is a workspace shell, and electron-updater, keytar and the app's version live in
 * packages/desktop/package.json — so the updater, keychain and crash checks all
 * reported "not found". Taking only the manifests that declare the framework (electron,
 * or a @tauri-apps package) keeps a sibling website's @sentry from counting as the
 * desktop app's crash reporting. Root first, so the version read stays the root's.
 */
export function desktopManifests(
  files: Map<string, string>,
  shape: "electron" | "tauri",
): { pkg: PackageManifest | null; text: string } {
  const all: { path: string; text: string; pkg: PackageManifest }[] = [];
  for (const [path, text] of files) {
    if (!/(^|\/)package\.json$/i.test(path) || isVendoredPath(path) || isExampleOrFixturePath(path)) continue;
    const pkg = parsePackageManifest(text);
    if (pkg) all.push({ path, text, pkg });
  }
  all.sort((a, b) => a.path.split("/").length - b.path.split("/").length);
  const declares = (m: PackageManifest) =>
    shape === "electron" ? hasDependency(m, "electron") : anyDependency(m, /^@tauri-apps\//);
  let chosen = all.filter((m) => declares(m.pkg));
  if (chosen.length === 0) chosen = all.filter((m) => !m.path.includes("/"));
  if (chosen.length === 0) return { pkg: null, text: "" };
  const merged: PackageManifest = {
    ...chosen[0].pkg,
    version: chosen.find((m) => m.pkg.version)?.pkg.version,
    dependencies: Object.assign({}, ...chosen.map((m) => allDependencies(m.pkg))),
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {},
  };
  return { pkg: merged, text: chosen.map((m) => m.text).join("\n") };
}

/** A CSP declared in shipped source (session header / meta built in JS) or in the renderer HTML. */
export function electronCspDeclared(appSourceRaw: string, html: string): boolean {
  return /Content-Security-Policy/i.test(appSourceRaw) || /Content-Security-Policy/i.test(html);
}

/** Electron's own navigation events. A renderer <webview> DOM listener is not a guard (preventDefault does nothing). */
export function electronNavGuardPresent(appSource: string): boolean {
  return /\bwill-navigate\b|\bwill-redirect\b/.test(
    appSource.replace(/addEventListener\s*\(\s*["'`]will-(navigate|redirect)["'`]/g, ""),
  );
}

/** Electron updater libraries. update-electron-app wraps the built-in autoUpdater (Squirrel). */
const ELECTRON_UPDATER_DEPS = /^(electron-updater|update-electron-app)$/;

/** An Electron auto-update channel: a dependency, a call in shipped source, or a packager publish target. */
export function electronUpdaterPresent(pkg: PackageManifest | null, appSource: string, packagerConfig: string): boolean {
  return anyDependency(pkg, ELECTRON_UPDATER_DEPS) ||
    /\bautoUpdater\b|\bupdateElectronApp\s*\(/.test(appSource) ||
    /\bpublish(ers)?\s*[:=]/i.test(packagerConfig);
}

/**
 * Per-call-site analysis of shell.openExternal.
 *
 * One global "is there a scheme check anywhere near any call" let a hard-coded
 * `shell.openExternal('https://…')` in a menu vouch for marktext's
 * `ipcMain.handle(…, (_e, url) => shell.openExternal(url))`, which hands renderer
 * input straight to the OS. A literal argument cannot be attacker-controlled, so it is
 * skipped; every other call needs its own check within ±300 characters. Runs on RAW
 * source (offsets intact, regex literals like /^https?:\/\// unmangled) and skips calls
 * on a commented-out line.
 */
export function openExternalCallSites(raw: string): { total: number; dynamic: number; unvalidated: number } {
  const VALIDATION = /new URL\(|\.protocol\b|startsWith\(\s*["'`]https?|\/\^\(?https?|\/\^http\(s\)\?|\^https\??:/;
  let total = 0, dynamic = 0, unvalidated = 0;
  for (const m of raw.matchAll(/shell\.openExternal\s*\(\s*/g)) {
    const at = m.index ?? 0;
    const lineStart = raw.lastIndexOf("\n", at) + 1;
    if (/^\s*(\/\/|\*|\/\*)/.test(raw.slice(lineStart, at))) continue;
    total++;
    const arg = raw.slice(at + m[0].length, at + m[0].length + 400);
    // A plain string literal (no ${…} interpolation) is a fixed destination.
    if (/^(["'])(?:\\.|(?!\1)[^\\\n])*\1\s*[,)]/.test(arg) || /^`[^`$]*`\s*[,)]/.test(arg)) continue;
    dynamic++;
    if (!VALIDATION.test(raw.slice(Math.max(0, at - 300), at + 300))) unvalidated++;
  }
  return { total, dynamic, unvalidated };
}

/**
 * IPC sender validation: a read of the sending frame's URL or origin. The old
 * `\.sender\b[\s\S]{0,120}(url|origin)` (case-insensitive) was satisfied by any
 * `rawUrl` within 120 characters of any `.sender` — marktext PASSed with no check at all.
 */
export function ipcSenderValidated(appSource: string): boolean {
  return /\bsenderFrame\??\.(url|origin)\b|\.sender(?:Frame)?\??\.(getURL\(\)|url\b|origin\b)|\bvalidateSender\b/.test(appSource);
}

/**
 * Crash/error reporting, shared by desktop_crash_reporting and desk_x_crash_reporter so they
 * cannot disagree. Local loggers (electron-log, tauri-plugin-log) are deliberately NOT
 * reporting: nothing they write reaches the developer.
 */
export function crashReportingPresent(pkg: PackageManifest | null, source: string, paths: string[]): boolean {
  return anyDependency(pkg, /^(@sentry\/|bugsnag|@bugsnag\/|rollbar)/) ||
    /crashReporter\.start|startCrashReporter|\bsentry|bugsnag|crashpad|minidump/i.test(source) ||
    paths.some((p) =>
      /(^|\/)crash-?reporter[^/]*\.(js|ts|mjs|cjs)$/i.test(p) &&
      !/\.(test|spec)\.[cm]?[jt]s$|[-_]spec\.[cm]?[jt]s$/i.test(p) &&
      !/(^|\/)(specs?|tests?|__tests__|e2e|fixtures?|__fixtures__|examples?|samples?|demos?)\//i.test(p) &&
      !isVendoredPath(p));
}

/** Every entry of every `permissions` array in a Tauri JSON config (capability files, or inline in tauri.conf.json). */
export function tauriPermissions(json: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const out: unknown[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k === "permissions" && Array.isArray(v)) out.push(...v);
        else walk(v);
      }
    }
  };
  walk(parsed);
  return out;
}

/**
 * How the Tauri v2 opener plugin's URL opening is scoped.
 *   • `opener:default` carries the plugin's own default scope (http, https, mailto, tel).
 *   • `opener:allow-open-url` with an `allow` list is scoped by that list.
 *   • the bare string with no scope anywhere is unscoped.
 * null when no URL-opening opener permission is granted.
 */
export function openerUrlScope(permissions: unknown[]): "scoped" | "broad" | "unscoped" | null {
  const SAFE = /^(https?:\/\/|mailto:|tel:)/i;
  let granted = false, scoped = false, broad = false;
  for (const p of permissions) {
    if (p === "opener:default") {
      granted = true;
      scoped = true;
    } else if (p === "opener:allow-open-url") {
      granted = true;
    } else if (p && typeof p === "object" && (p as { identifier?: unknown }).identifier === "opener:allow-open-url") {
      granted = true;
      const allow = (p as { allow?: unknown }).allow;
      if (Array.isArray(allow) && allow.length > 0) {
        scoped = true;
        for (const a of allow) {
          const url = a && typeof a === "object" ? (a as { url?: unknown }).url : undefined;
          if (typeof url !== "string" || !SAFE.test(url)) broad = true;
        }
      }
    }
  }
  if (!granted) return null;
  return broad ? "broad" : scoped ? "scoped" : "unscoped";
}

function buildContext(snapshot: RepoSnapshot, shape: "electron" | "tauri"): DesktopContext {
  const jsPaths = snapshot.paths.filter(
    (p) => /\.(js|ts|mjs|cjs|jsx|tsx)$/i.test(p) && !isVendoredPath(p),
  );
  const read: string[] = [];
  const mainRead: string[] = [];
  const rustRead: string[] = [];
  const appRead: string[] = [];
  const htmlRead: string[] = [];
  let tauriConf = "";
  let capabilities = "";
  let packagerConfig = "";
  let workflows = "";
  const permissions: unknown[] = [];

  for (const [path, text] of snapshot.files) {
    if (/(^|\/)src-tauri\/tauri\.conf\.json$/i.test(path)) {
      tauriConf += "\n" + text;
      permissions.push(...tauriPermissions(text));
    } else if (/(^|\/)src-tauri\/capabilities\/.*\.(json|toml)$/i.test(path)) {
      capabilities += "\n" + text;
      permissions.push(...tauriPermissions(text));
    } else if (/(^|\/)(electron-builder\.(ya?ml|json|js|ts|cjs)|forge\.config\.(js|ts|cjs|mjs)|electron\.vite\.config\.(js|ts|cjs|mjs))$/i.test(path)) {
      packagerConfig += "\n" + text;
    } else if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(path)) {
      workflows += "\n" + text;
    } else if (/\.html?$/i.test(path) && isShippedDesktopSource(path)) {
      htmlRead.push(text);
    } else if (/\.rs$/i.test(path) && !isVendoredPath(path)) {
      rustRead.push(text);
    } else if (/\.(js|ts|mjs|cjs|jsx|tsx)$/i.test(path) && !isVendoredPath(path)) {
      read.push(text);
      if (!NOT_SHIPPED.test(path)) {
        appRead.push(text);
        // Shipped main-process files only: fiddle's tests/main/*.spec.ts matched the
        // `main/` convention and fed mock webPreferences into the settings read.
        if (MAIN_PROCESS.test(path) || PRELOAD.test(path)) mainRead.push(text);
      }
    }
  }

  // Strip each file on its own: the stripper does not parse regex literals, so one file's
  // `/'/` desynchronised its quote tracking and swallowed code in the FILES AFTER it —
  // marktext's `crashReporter.start` vanished from the joined, stripped sample.
  const strip = (texts: string[]) => texts.map((t) => stripCStyleComments(t)).join("\n");
  const sourceRaw = read.join("\n");
  return {
    shape,
    source: strip(read),
    sourceRaw,
    // Falls back to the whole shipped sample when no file matched the main-process naming
    // convention — plenty of apps put createWindow in src/app.ts or similar, and a
    // security setting missed because of a filename is a false PASS.
    mainSource: strip(mainRead.length > 0 ? mainRead : appRead),
    appSource: strip(appRead),
    appSourceRaw: appRead.join("\n"),
    html: htmlRead.join("\n"),
    rust: strip(rustRead),
    tauriConf,
    capabilities,
    permissions,
    packagerConfig,
    workflows,
    pkg: desktopManifests(snapshot.files, shape).pkg,
    coverage: sampleCoverage(read.length, jsPaths.length, snapshot.truncated),
    paths: snapshot.paths,
  };
}

/**
 * An ABSENCE finding: "we looked and did not find X". Sound only when the sample
 * is broad enough, so below the threshold it self-downgrades to LOW confidence and
 * drops out of scoring rather than reporting a failure we cannot support.
 */
function absence(ctx: DesktopContext, check: Omit<PulseScanCheckInput, "confidence">): PulseScanCheckInput {
  // A PASS from absence() means the thing WAS found — a presence finding, sound on any sample.
  const sound = ctx.coverage >= SOUND_ABSENCE_COVERAGE || check.status === "PASS";
  return {
    ...check,
    confidence: sound ? "HIGH" : "LOW",
    detail: sound
      ? check.detail
      : `${check.detail} (Based on ${Math.round(ctx.coverage * 100)}% of this project's JavaScript/TypeScript files — ` +
        `below the threshold for a confident "not present anywhere", so this is inconclusive rather than a failure.)`,
  };
}

/**
 * Read a boolean webPreferences-style setting out of source.
 *
 * Returns `true` / `false` when the key is assigned a literal, and `null` when the
 * key does not appear at all — a distinction that carries the whole meaning here.
 * `contextIsolation` defaults to SECURE (true) in Electron 12+, so "absent" is a
 * pass; `sandbox` defaults to true only when no preload is used, so "absent" is a
 * warn. Collapsing the two into a boolean would get one of them backwards.
 */
export function readBooleanSetting(source: string, key: string): boolean | null {
  const match = new RegExp(`\\b${key}\\s*:\\s*(true|false)\\b`).exec(source);
  if (!match) return null;
  // A project may set the key in more than one BrowserWindow. The insecure value
  // anywhere is the finding — one unsafe window is enough.
  const all = [...source.matchAll(new RegExp(`\\b${key}\\s*:\\s*(true|false)\\b`, "g"))].map((m) => m[1]);
  if (all.includes("true")) return true;
  return false;
}

/**
 * readBooleanSetting plus the case it cannot represent: a NON-literal value.
 *
 * `nodeIntegration: isDev` or `sandbox: !app.isPackaged` was read as "absent" and so
 * passed with "the secure default is in effect" — exactly what we cannot say.
 * Precedence: a literal insecure value ANYWHERE in the shipped app is a presence finding
 * (sound on a sample); then a non-literal value in the main process is "dynamic"
 * (INCONCLUSIVE); then a literal in the main process.
 *
 * Type annotations (`sandbox: boolean`) and string values (an iframe `sandbox:
 * "allow-scripts"` prop) are not a webPreferences value and are ignored.
 */
export function readSettingState(
  mainSource: string,
  appSource: string,
  key: string,
  insecure: boolean,
): boolean | "dynamic" | null {
  const literal = (src: string) =>
    [...src.matchAll(new RegExp(`\\b${key}\\s*:\\s*(true|false)\\b`, "g"))].map((m) => m[1] === "true");
  if (literal(appSource).includes(insecure)) return insecure;
  const dynamic = new RegExp(
    `\\b${key}\\s*:\\s*(?!true\\b|false\\b|boolean\\b|Boolean\\b|undefined\\b|any\\b|["'\`{\\[])[!\\w$(]`,
  ).test(mainSource);
  if (dynamic) return "dynamic";
  const main = literal(mainSource);
  return main.length === 0 ? null : main.includes(insecure) ? insecure : !insecure;
}

export function evaluateDesktopChecks(snapshot: RepoSnapshot, shape: "electron" | "tauri"): PulseScanCheckInput[] {
  if (!snapshot.accessible) return [];
  const ctx = buildContext(snapshot, shape);
  const checks: PulseScanCheckInput[] = [];

  if (shape === "electron") {
    checks.push(...electronWebPreferences(ctx));
    checks.push(...electronNavigation(ctx));
    checks.push(...electronPackaging(ctx));
  } else {
    checks.push(...tauriConfig(ctx));
    checks.push(...tauriScopes(ctx));
  }
  checks.push(...sharedDesktop(ctx));

  return checks;
}

// ── Electron: webPreferences ────────────────────────────────────────────────
//
// These five are the core of Electron's own checklist. They are read from the
// MAIN-process sample because that is where BrowserWindow is constructed.
function electronWebPreferences(ctx: DesktopContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const src = ctx.mainSource;
  const state = (key: string, insecure: boolean) => readSettingState(src, ctx.appSource, key, insecure);
  // A value computed at runtime (`nodeIntegration: isDev`) cannot be read statically, so it
  // is reported as what it is rather than as the default.
  const dynamic = (checkKey: string, label: string, key: string): PulseScanCheckInput => ({
    category: CATEGORIES.SECURITY,
    checkKey,
    label,
    status: "INCONCLUSIVE",
    confidence: "LOW",
    detail: `\`${key}\` is set from an expression rather than a literal, so the value a shipped build uses cannot be ` +
      `read from source. Confirm it resolves to the secure value in packaged builds, or set it as a literal.`,
  });

  // 1 — nodeIntegration. The single highest-severity setting in the family.
  const nodeIntegration = state("nodeIntegration", true);
  const contextIsolation = state("contextIsolation", false);
  const bothWrong = nodeIntegration === true && contextIsolation === false;
  if (nodeIntegration === "dynamic") {
    checks.push(dynamic("electron_node_integration", "Node integration disabled in the renderer", "nodeIntegration"));
  } else checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "electron_node_integration",
    label: "Node integration disabled in the renderer",
    status: nodeIntegration === true ? "FAIL" : "PASS",
    confidence: nodeIntegration === null ? "MEDIUM" : "HIGH",
    detail: nodeIntegration === true
      ? `\`nodeIntegration: true\` gives renderer JavaScript access to Node's \`require\`, and therefore to ` +
        `\`child_process\` and the filesystem. Any script that reaches the renderer — a compromised CDN dependency, ` +
        `an ad or iframe in embedded content, a reflected XSS in your own UI — can then run arbitrary commands on the ` +
        `user's machine with the user's privileges. ${bothWrong
          ? "`contextIsolation` is ALSO disabled, which removes the last barrier: this is a direct remote-code-execution path."
          : "Set it to false and move any privileged work behind a preload script using contextBridge."}`
      : nodeIntegration === false
        ? `\`nodeIntegration: false\` — renderer JavaScript cannot reach Node APIs.`
        : `No \`nodeIntegration: true\` found. Electron has defaulted it to false since v5, so the secure default is ` +
          `in effect unless a window sets it somewhere outside the sampled files.`,
    evidence: nodeIntegration === true ? "nodeIntegration: true" : undefined,
  });

  // 2 — contextIsolation. Secure by default since Electron 12, so absence passes.
  if (contextIsolation === "dynamic") {
    checks.push(dynamic("electron_context_isolation", "Context isolation enabled", "contextIsolation"));
  } else checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "electron_context_isolation",
    label: "Context isolation enabled",
    status: contextIsolation === false ? "FAIL" : "PASS",
    confidence: contextIsolation === null ? "MEDIUM" : "HIGH",
    detail: contextIsolation === false
      ? `\`contextIsolation: false\` runs your preload script and the page's JavaScript in the SAME context. Page ` +
        `script can then reach into and rewrite anything the preload exposed — including replacing a function you ` +
        `exposed with its own — so a contextBridge API that looks narrow becomes an arbitrary one. Set it to true ` +
        `(the default since Electron 12) and expose an explicit, minimal surface with contextBridge.exposeInMainWorld.`
      : contextIsolation === true
        ? `\`contextIsolation: true\` — preload and page script are isolated from one another.`
        : `No \`contextIsolation: false\` found. It has defaulted to true since Electron 12, so the secure default ` +
          `applies unless a window overrides it outside the sampled files.`,
    evidence: contextIsolation === false ? "contextIsolation: false" : undefined,
  });

  // 3 — sandbox. Defaults to true since Electron 20, but a preload script that
  // needs Node re-disables it, which is the common real-world case.
  // Absent is only "on" where Electron's default makes it so: renderers are sandboxed by
  // default from Electron 20, and NOT when the window turns on nodeIntegration (which
  // disables the sandbox for it). Below 20, or with the version unread, absent is not on.
  const sandbox = state("sandbox", false);
  const electronMajor = Number(/(\d+)/.exec(allDependencies(ctx.pkg)["electron"] ?? "")?.[1] ?? 0) || null;
  const absentVerdict: "on" | "off" | "unknown" =
    nodeIntegration === true ? "off" : electronMajor === null ? "unknown" : electronMajor >= 20 ? "on" : "off";
  if (sandbox === "dynamic") checks.push(dynamic("electron_sandbox", "Renderer sandbox enabled", "sandbox"));
  else checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "electron_sandbox",
    label: "Renderer sandbox enabled",
    status: sandbox === false ? "WARN" : sandbox === true ? "PASS" : absentVerdict === "on" ? "PASS" : absentVerdict === "off" ? "WARN" : "INCONCLUSIVE",
    confidence: sandbox !== null ? "HIGH" : absentVerdict === "unknown" ? "LOW" : "MEDIUM",
    detail: sandbox === false
      ? `\`sandbox: false\` opts this window out of Chromium's OS-level process sandbox. Sandboxing is what limits ` +
        `the damage when a renderer IS compromised — without it, a Chromium exploit reaches the machine directly ` +
        `rather than being contained. It is usually disabled to let a preload script use Node; the fix is to move ` +
        `that work to the main process behind an IPC handler and keep the sandbox on.`
      : sandbox === true
        ? `\`sandbox: true\` — renderers run inside Chromium's OS sandbox.`
        : absentVerdict === "on"
          ? `No \`sandbox\` setting found, and the app uses Electron ${electronMajor}, which sandboxes renderers by ` +
            `default from version 20.`
          : nodeIntegration === true
            ? `No \`sandbox\` setting found, and a window turns on \`nodeIntegration\`, which runs that renderer ` +
              `outside Chromium's sandbox. Turn nodeIntegration off and set \`sandbox: true\`.`
            : absentVerdict === "off"
              ? `No \`sandbox\` setting found, and the app uses Electron ${electronMajor}. Renderers are only ` +
                `sandboxed by default from Electron 20, so these run unsandboxed. Set \`sandbox: true\`, or upgrade.`
              : `No \`sandbox\` setting found, and the Electron version could not be read. Renderers are sandboxed ` +
                `by default only from Electron 20, so whether this one is sandboxed is not established.`,
  });

  // 4 — webSecurity. Disabling it turns off the same-origin policy entirely.
  const webSecurity = state("webSecurity", false);
  if (webSecurity === "dynamic") checks.push(dynamic("electron_web_security", "Same-origin policy enforced", "webSecurity"));
  else checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "electron_web_security",
    label: "Same-origin policy enforced",
    status: webSecurity === false ? "FAIL" : "PASS",
    confidence: webSecurity === null ? "MEDIUM" : "HIGH",
    detail: webSecurity === false
      ? `\`webSecurity: false\` disables the same-origin policy for this window. Any page it loads can then read ` +
        `responses from any origin — your API, the user's other sessions, local files. This is almost always added to ` +
        `work around a CORS error during development and then left in; fix the CORS headers, or load local content ` +
        `through a custom protocol handler instead.`
      : webSecurity === true
        ? `\`webSecurity: true\` — the same-origin policy is enforced.`
        : `No \`webSecurity: false\` found — the secure default applies.`,
    evidence: webSecurity === false ? "webSecurity: false" : undefined,
  });

  // 5 — allowRunningInsecureContent: mixed content over an HTTPS page.
  const insecureContent = state("allowRunningInsecureContent", true);
  if (insecureContent === "dynamic") {
    checks.push(dynamic("electron_insecure_content", "Insecure content is not permitted", "allowRunningInsecureContent"));
  } else checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "electron_insecure_content",
    label: "Insecure content is not permitted",
    status: insecureContent === true ? "FAIL" : "PASS",
    confidence: insecureContent === null ? "MEDIUM" : "HIGH",
    detail: insecureContent === true
      ? `\`allowRunningInsecureContent: true\` lets an HTTPS page load scripts over plain HTTP. Anyone on the ` +
        `network path can then replace that script and execute their code inside your app. Remove the flag and serve ` +
        `every resource over HTTPS.`
      : `Insecure (HTTP) sub-resources are not permitted on HTTPS pages.`,
  });

  // 6 — experimentalFeatures / enableBlinkFeatures: unaudited Chromium surface.
  const experimental = readBooleanSetting(src, "experimentalFeatures");
  const blinkFeatures = /\benableBlinkFeatures\s*:\s*["'][^"']+["']/.test(src);
  if (experimental === true || blinkFeatures) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "electron_experimental_features",
      label: "No experimental Chromium features enabled",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `${experimental === true ? "`experimentalFeatures: true`" : "`enableBlinkFeatures`"} enables Chromium ` +
        `functionality that is off by default precisely because it has not completed security review. Enabling it ` +
        `widens the renderer's attack surface for a feature the platform itself does not consider ready. Remove it ` +
        `unless there is a specific, documented requirement.`,
    });
  }

  // 7 — webviewTag: the <webview> element is an old, discouraged embedding path.
  const webviewTag = readBooleanSetting(src, "webviewTag");
  if (webviewTag === true || /<webview\b/i.test(ctx.source)) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "electron_webview_tag",
      label: "<webview> tag is not used for untrusted content",
      status: "WARN",
      confidence: "MEDIUM",
      detail:
        `The \`<webview>\` tag is in use. Electron documents it as having a significant attack surface and recommends ` +
        `\`WebContentsView\` (or an \`<iframe>\` for simple embedding) instead. If it must stay, ensure \`allowpopups\` ` +
        `is NOT set and that a \`will-attach-webview\` handler strips any webPreferences the page tries to supply — ` +
        `otherwise embedded content can request node integration for itself.`,
    });
  }

  // 8 — the remote module: ships main-process objects into the renderer wholesale.
  const remoteModule =
    hasDependency(ctx.pkg, "@electron/remote") || /\benableRemoteModule\s*:\s*true\b/.test(src);
  if (remoteModule) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "electron_remote_module",
      label: "The remote module is not enabled",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `The remote module (\`@electron/remote\` or \`enableRemoteModule: true\`) is in use. It hands renderer code ` +
        `live references to main-process objects, which collapses the process boundary that everything else in this ` +
        `list depends on — a renderer compromise becomes a main-process compromise. It was removed from Electron core ` +
        `for this reason. Replace each use with an explicit \`ipcRenderer.invoke\` → \`ipcMain.handle\` pair that ` +
        `accepts only the arguments it needs.`,
    });
  }

  return checks;
}

// ── Electron: navigation, window creation, permissions, IPC ─────────────────
function electronNavigation(ctx: DesktopContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  // Handler PRESENCE (will-navigate, setWindowOpenHandler, permission handlers,
  // ipcMain) is searched across ALL sampled source: these calls live in whatever
  // module builds the window (atom's main-process/atom-window.js, mattermost's
  // src/app/views/*), not only in files named main/index/background. Coverage —
  // the soundness gate for absence — is computed over all JS/TS, so the search
  // must be too, or a sampled handler is reported missing at HIGH confidence.
  // Test, spec and mock files are left out: a mock of `electron` or a spec is not the app's guard.
  const src = ctx.appSource;

  // Navigation guard — without one, a link or a redirect can move the whole app
  // window to an attacker's page, which then inherits that window's webPreferences.
  // A renderer <webview> also emits a DOM 'will-navigate' event, but preventDefault()
  // has no effect on it, so that listener is not a guard and is excluded.
  const hasNavGuard = electronNavGuardPresent(src);
  checks.push(absence(ctx, {
    category: CATEGORIES.SECURITY,
    checkKey: "electron_navigation_guard",
    label: "Navigation to untrusted origins is blocked",
    status: hasNavGuard ? "PASS" : "WARN",
    detail: hasNavGuard
      ? `A \`will-navigate\` / \`will-redirect\` handler is present — confirm it allow-lists origins rather than ` +
        `blocking a deny-list.`
      : `No \`will-navigate\` handler found. Nothing stops the app window navigating away to an arbitrary origin — ` +
        `via a link, a redirect, or injected content — and the destination then runs with THIS window's ` +
        `webPreferences. Add a \`will-navigate\` listener that calls \`event.preventDefault()\` for any origin that ` +
        `is not your own.`,
  }));

  // Window-open handler — window.open / target=_blank otherwise creates a new
  // Electron window with default privileges rather than opening the OS browser.
  const hasOpenHandler = /setWindowOpenHandler\s*\(/.test(src);
  const deniesByDefault = /setWindowOpenHandler[\s\S]{0,300}action\s*:\s*["']deny["']/.test(src);
  checks.push(absence(ctx, {
    category: CATEGORIES.SECURITY,
    checkKey: "electron_window_open_handler",
    label: "New-window requests are controlled",
    status: hasOpenHandler ? (deniesByDefault ? "PASS" : "WARN") : "WARN",
    detail: hasOpenHandler
      ? deniesByDefault
        ? `\`setWindowOpenHandler\` is present and denies by default — external links should be passed to ` +
          `\`shell.openExternal\` after validating the URL scheme.`
        : `\`setWindowOpenHandler\` is present but no \`action: "deny"\` was found in it. Deny by default and ` +
          `explicitly allow the few destinations that need a real window.`
      : `No \`setWindowOpenHandler\` found. \`window.open\` and \`target="_blank"\` then create new Electron windows ` +
        `with default privileges, under the app's own frame — so a phishing page renders as if it were part of your ` +
        `application. Return \`{ action: "deny" }\` and hand external URLs to \`shell.openExternal\`.`,
  }));

  // shell.openExternal with an unvalidated URL is command execution on Windows
  // (file:// and other schemes are handed to the OS handler). Judged per call site.
  const openExternal = openExternalCallSites(ctx.appSourceRaw);
  if (openExternal.total > 0) {
    const pass = openExternal.unvalidated === 0;
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "electron_open_external_validated",
      label: "shell.openExternal validates the URL scheme",
      status: pass ? "PASS" : "WARN",
      // "Every call is fine" is only as good as the sample when no dynamic call was seen at all.
      confidence: pass && openExternal.dynamic === 0 && ctx.coverage < SOUND_ABSENCE_COVERAGE ? "LOW" : "MEDIUM",
      detail: !pass
        ? `${openExternal.unvalidated} of ${openExternal.dynamic} \`shell.openExternal\` call(s) with a non-literal URL ` +
          `have no visible scheme check. It hands the string to the operating system's handler, so a \`file://\` or ` +
          `application-scheme URL that reaches it can launch a local program. Parse the URL and proceed only when the ` +
          `protocol is \`http:\` or \`https:\`.`
        : openExternal.dynamic > 0
          ? `Every \`shell.openExternal\` call with a non-literal URL has scheme validation nearby — confirm it ` +
            `allow-lists http/https rather than rejecting a handful of known-bad schemes.`
          : `\`shell.openExternal\` is only called with fixed URLs in the sampled source.`,
    });
  }

  // Permission handler — media, geolocation and notifications are auto-granted
  // to any page in an Electron window unless the session refuses them.
  const hasPermissionHandler = /setPermissionRequestHandler|setPermissionCheckHandler/.test(src);
  checks.push(absence(ctx, {
    category: CATEGORIES.SECURITY,
    checkKey: "electron_permission_handler",
    label: "Renderer permission requests are filtered",
    status: hasPermissionHandler ? "PASS" : "WARN",
    detail: hasPermissionHandler
      ? `A session permission handler is registered.`
      : `No \`setPermissionRequestHandler\` found. Electron grants camera, microphone, geolocation and notification ` +
        `requests from renderer content without prompting, so any page the app loads can turn on the microphone. ` +
        `Register a handler that checks the requesting origin and denies everything your own UI does not need.`,
  }));

  // IPC sender validation — an ipcMain handler is reachable from EVERY frame,
  // including a third-party iframe inside your window.
  if (/ipcMain\.(handle|on)\s*\(/.test(src)) {
    const validatesSender = ipcSenderValidated(src);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "electron_ipc_sender_validation",
      label: "IPC handlers validate the sending frame",
      status: validatesSender ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: validatesSender
        ? `IPC handlers reference the sender frame — confirm every privileged handler checks the origin, not just one.`
        : `\`ipcMain.handle\`/\`ipcMain.on\` handlers are registered with no visible check of \`event.senderFrame\`. ` +
          `Every frame in every window can call them, including a third-party iframe or any page the window has ` +
          `navigated to. Validate \`event.senderFrame.url\` against your own origin at the top of each privileged ` +
          `handler before doing any work.`,
    });
  }

  // Wholesale ipcRenderer exposure defeats the point of contextBridge.
  if (/exposeInMainWorld\s*\([^)]*,\s*(ipcRenderer|require\(|\{\s*\.\.\.)/.test(ctx.source)) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "electron_preload_surface",
      label: "Preload exposes a narrow API, not ipcRenderer itself",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `The preload script appears to expose \`ipcRenderer\` (or a require'd module) directly through ` +
        `\`contextBridge.exposeInMainWorld\`. That gives page JavaScript the ability to send ANY IPC message to ANY ` +
        `channel, which is equivalent to disabling context isolation — the bridge is there to narrow the surface, and ` +
        `passing the whole object through widens it back. Expose named functions that each wrap one specific channel ` +
        `with validated arguments.`,
    });
  }

  // CSP — Electron ships no default policy, so an app that sets none has none. Most apps
  // declare it as a <meta> in the renderer HTML (fiddle static/index.html, marktext
  // src/renderer/index.html), which this used to never read.
  const hasCsp = electronCspDeclared(ctx.appSourceRaw, ctx.html);
  checks.push(absence(ctx, {
    category: CATEGORIES.SECURITY,
    checkKey: "electron_csp",
    label: "A Content-Security-Policy is defined",
    status: hasCsp ? "PASS" : "WARN",
    detail: hasCsp
      ? `A Content-Security-Policy is set — confirm it avoids \`unsafe-eval\` and \`unsafe-inline\`.`
      : `No Content-Security-Policy found. Electron applies none by default, so the renderer will execute script from ` +
        `any origin and any inline block. A CSP is the control that stops an injected script from loading its ` +
        `second stage. Set one via \`session.defaultSession.webRequest.onHeadersReceived\`, or a meta tag in the ` +
        `renderer HTML.`,
  }));

  return checks;
}

// ── Electron: packaging, signing, updates ───────────────────────────────────
function electronPackaging(ctx: DesktopContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const deps = allDependencies(ctx.pkg);

  // Electron version support window.
  const raw = deps["electron"];
  if (raw) {
    const major = Number(/(\d+)/.exec(raw)?.[1] ?? 0);
    if (major > 0) {
      const supported = major >= ELECTRON_OLDEST_SUPPORTED_MAJOR;
      checks.push({
        category: CATEGORIES.SECURITY,
        checkKey: "electron_version_supported",
        label: "Electron version still receives security fixes",
        status: supported ? "PASS" : "FAIL",
        confidence: "HIGH",
        detail: supported
          ? `Electron ${major} is within the supported window (the latest three majors, currently ` +
            `${ELECTRON_OLDEST_SUPPORTED_MAJOR}+).`
          : `Electron ${major} is outside the support window — only the latest three majors receive fixes, currently ` +
            `${ELECTRON_OLDEST_SUPPORTED_MAJOR} and above. The app therefore ships every Chromium and V8 CVE ` +
            `disclosed since ${major} went end-of-life, and Chromium vulnerabilities are routinely exploited in the ` +
            `wild. Electron releases a major every 8 weeks, so plan a regular upgrade cadence rather than a one-off jump.`,
        evidence: `electron ${raw}`,
      });
    }
  }

  // ASAR — without it the app's source sits on disk as plain readable files.
  const asarDisabled = /\basar\s*[:=]\s*false\b/i.test(ctx.packagerConfig);
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "electron_asar_enabled",
    label: "Application source is packaged into an ASAR archive",
    status: asarDisabled ? "WARN" : "PASS",
    confidence: asarDisabled ? "HIGH" : "MEDIUM",
    detail: asarDisabled
      ? `\`asar: false\` in the packager config ships the application's JavaScript as loose files inside the install ` +
        `directory. Anyone with the machine can read them — and, more importantly, EDIT them: modified app code then ` +
        `runs with whatever privileges the app has, and on a code-signed build that tampering is not detected unless ` +
        `ASAR integrity is also enabled. Leave ASAR on, and enable \`asarIntegrity\` for signed builds.`
      : `ASAR packaging is not disabled, so application source is archived rather than shipped as loose files.`,
  });

  // Code signing. An unsigned desktop build is blocked by Gatekeeper and warned
  // about by SmartScreen, and cannot be notarised.
  const hasSigning =
    anyDependency(ctx.pkg, /^(@electron\/(notarize|osx-sign|windows-sign)|electron-notarize|electron-osx-sign)$/) ||
    /\b(certificateFile|certificateSubjectName|identity|signingIdentity|notarize|osxSign|azureSignOptions|signtoolOptions|CSC_LINK)\b/i.test(enabledSettings(ctx.packagerConfig)) ||
    // The secrets are referenced by NAME in workflow contents (this used to test the workflow file PATHS).
    /\b(CSC_LINK|APPLE_ID|APPLE_APP_SPECIFIC_PASSWORD|WINDOWS_CERTIFICATE)\b/.test(ctx.workflows + ctx.packagerConfig);
  checks.push({
    category: CATEGORIES.INFRASTRUCTURE,
    checkKey: "electron_code_signing",
    label: "Builds are code-signed",
    status: hasSigning ? "PASS" : "WARN",
    // "Not found" is LOW whatever the sample: signing identities normally live in CI secrets
    // and the release machine's keychain, neither of which a repository shows.
    confidence: hasSigning ? "MEDIUM" : "LOW",
    detail: hasSigning
      ? `Code-signing configuration is present (packager signing config or signing/notarisation tooling).`
      : `No code-signing configuration was visible in the repository — signing is often configured only in CI ` +
        `secrets, so this is unconfirmed rather than a finding. An unsigned macOS build is refused by Gatekeeper ("cannot be opened ` +
        `because the developer cannot be verified") and cannot be notarised; an unsigned Windows build triggers a ` +
        `SmartScreen warning that most users will not click through. Signing is also what makes an auto-update ` +
        `trustworthy — without it there is nothing to distinguish your update from a substituted one.`,
  });

  // Auto-update. A desktop app without one cannot ship a security fix.
  const hasUpdater = electronUpdaterPresent(ctx.pkg, ctx.appSource, ctx.packagerConfig);
  checks.push(absence(ctx, {
    category: CATEGORIES.INFRASTRUCTURE,
    checkKey: "electron_auto_update",
    label: "An auto-update channel is configured",
    status: hasUpdater ? "PASS" : "WARN",
    detail: hasUpdater
      ? `An update mechanism is configured (electron-updater / update-electron-app / autoUpdater / a publish target).`
      : `No auto-updater found. Every copy of the app is then frozen at the version the user installed, so a security ` +
        `fix — including the Electron/Chromium upgrades this report asks for — only reaches users who reinstall by ` +
        `hand. For a desktop app this is the difference between patching in a day and patching never.`,
  }));

  // An update feed over plain HTTP is a code-execution channel.
  const httpFeed = /setFeedURL\s*\([^)]*["']http:\/\//i.test(ctx.source) ||
    /\burl\s*[:=]\s*["']http:\/\//i.test(ctx.packagerConfig);
  if (httpFeed) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "electron_update_transport",
      label: "Updates are delivered over HTTPS",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        `The update feed URL uses plain \`http://\`. Anyone able to see the user's traffic can substitute the update ` +
        `payload, and the app will install and run it — this is a direct code-execution channel onto every user's ` +
        `machine. Serve the feed over HTTPS, and rely on code signature verification as well as transport security.`,
    });
  }

  // Electron Fuses flip off debugging features at package time. electron-builder configures
  // them with an `electronFuses:` block and Forge with FusesPlugin, neither of which is a
  // dependency on @electron/fuses — so a dependency test missed marktext's.
  const fuseText = ctx.packagerConfig + "\n" + ctx.appSource;
  const fusesConfigured =
    anyDependency(ctx.pkg, /^(@electron\/fuses|@electron-forge\/plugin-fuses)$/) ||
    /\belectronFuses\s*:|FusesPlugin|flipFuses/.test(fuseText);
  // RunAsNode matters most: ELECTRON_RUN_AS_NODE turns the signed app into a plain Node runtime.
  const runAsNodeOff = /\brunAsNode\]?\s*[:=]\s*false\b/i.test(fuseText);
  const fuses: Omit<PulseScanCheckInput, "confidence"> = {
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "electron_fuses",
    label: "Electron Fuses harden the packaged build",
    status: fusesConfigured && runAsNodeOff ? "PASS" : "WARN",
    detail: fusesConfigured
      ? runAsNodeOff
        ? `Electron Fuses are configured and \`RunAsNode\` is turned off.`
        : `Electron Fuses are configured, but \`RunAsNode\` is not turned off in them. That fuse is on by default, and ` +
          `while it is on anyone with the binary can set \`ELECTRON_RUN_AS_NODE\` and run arbitrary Node code inside ` +
          `your signed app, inheriting its permissions. Add \`runAsNode: false\` alongside the fuses you already set.`
      : `No Electron Fuses configuration found (an \`electronFuses\` block, Forge's FusesPlugin or \`@electron/fuses\`). ` +
        `Fuses flip off capabilities at package time that a shipped app never needs — \`RunAsNode\`, ` +
        `\`EnableNodeCliInspectArguments\`, \`EnableNodeOptionsEnvironmentVariable\` — each of which lets someone with ` +
        `the binary run arbitrary Node code inside your signed, notarised app and inherit its permissions (camera, ` +
        `microphone, keychain access). Enabling them is a build-step change, not a code change.`,
  };
  checks.push(fusesConfigured ? { ...fuses, confidence: "MEDIUM" } : absence(ctx, fuses));

  return checks;
}

// ── Tauri: configuration ────────────────────────────────────────────────────
function tauriConfig(ctx: DesktopContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const conf = ctx.tauriConf;

  // CSP. Tauri injects nonces/hashes into whatever policy you declare — but if you
  // declare none, there is nothing to harden.
  const cspNull = /"csp"\s*:\s*null/i.test(conf);
  const cspSet = /"csp"\s*:\s*["{]/.test(conf);
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "tauri_csp",
    label: "A Content-Security-Policy is configured",
    status: cspSet ? "PASS" : "WARN",
    confidence: "HIGH",
    detail: cspSet
      ? `A CSP is declared in tauri.conf.json — Tauri injects nonce and hash sources into it at compile time so your ` +
        `own scripts and styles are allow-listed automatically.`
      : cspNull
        ? `\`"csp": null\` disables the Content-Security-Policy entirely. The WebView will then execute script from ` +
          `any origin, and Tauri's compile-time nonce/hash injection has nothing to attach to. Any injected script in ` +
          `your frontend reaches the IPC layer and whatever commands your capabilities expose.`
        : `No \`csp\` key in tauri.conf.json. Tauri does not apply one for you, so the WebView runs without a policy ` +
          `and an injected script can load its next stage from anywhere. Set a policy under \`app.security.csp\`.`,
  });

  // Disabling Tauri's CSP injection removes exactly the protection above.
  if (/"dangerousDisableAssetCspModification"\s*:\s*(true|\[)/i.test(conf)) {
    const isBooleanTrue = /"dangerousDisableAssetCspModification"\s*:\s*true/i.test(conf);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "tauri_csp_modification_disabled",
      label: "Tauri's CSP hardening is not disabled",
      status: isBooleanTrue ? "FAIL" : "WARN",
      confidence: "HIGH",
      detail: isBooleanTrue
        ? `\`dangerousDisableAssetCspModification: true\` stops Tauri injecting nonce and hash sources into your CSP ` +
          `at compile time. That injection is what makes the policy strict while still allowing your own bundled ` +
          `scripts — without it you are relying entirely on whatever you wrote by hand, and the usual result is a ` +
          `policy loose enough to permit inline script. The key is named "dangerous" for this reason.`
        : `\`dangerousDisableAssetCspModification\` is set for specific directives. Confirm each listed directive is ` +
          `one you genuinely maintain by hand, and that \`script-src\` is not among them.`,
    });
  }

  // Remote IPC access is the Tauri equivalent of Electron's nodeIntegration.
  if (/"dangerousRemoteDomainIpcAccess"/i.test(conf)) {
    const wildcard = /"dangerousRemoteDomainIpcAccess"[\s\S]{0,400}"domain"\s*:\s*"\*"/i.test(conf);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "tauri_remote_ipc_access",
      label: "IPC is not exposed to remote domains",
      status: wildcard ? "FAIL" : "WARN",
      confidence: "HIGH",
      detail: wildcard
        ? `\`dangerousRemoteDomainIpcAccess\` is configured with a wildcard domain. ANY remote page loaded in the ` +
          `WebView can then invoke your Tauri commands — which is the same class of hole as Electron's ` +
          `\`nodeIntegration: true\`, since those commands run in the Rust process with full OS privileges. Scope it ` +
          `to explicit domains and windows, or remove it.`
        : `\`dangerousRemoteDomainIpcAccess\` grants remote domains access to the IPC layer. Any script on those ` +
          `pages — including one injected via a compromised third-party dependency or an ad — can invoke your Tauri ` +
          `commands with the privileges of the Rust process. Confirm every listed domain is one you control, and that ` +
          `the \`windows\` and \`plugins\` lists are as narrow as possible.`,
    });
  }

  // withGlobalTauri puts the full API on `window` for any script to reach.
  if (/"withGlobalTauri"\s*:\s*true/i.test(conf)) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "tauri_global_api",
      label: "The Tauri API is not exposed on window",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `\`withGlobalTauri: true\` attaches the Tauri API to \`window.__TAURI__\`, so every script running in the ` +
        `WebView — including any third-party dependency in your frontend bundle — can call it directly rather than ` +
        `going through your imports. It exists for scripts that cannot use ES modules; if your frontend has a build ` +
        `step, turn it off and import \`@tauri-apps/api\` instead.`,
    });
  }

  // The updater must verify signatures, and that means a pubkey.
  const updaterActive = /"updater"[\s\S]{0,200}"active"\s*:\s*true/i.test(conf) ||
    /"createUpdaterArtifacts"\s*:\s*true/i.test(conf) ||
    /tauri-plugin-updater/i.test(conf + ctx.rust);
  if (updaterActive) {
    const hasPubkey = /"pubkey"\s*:\s*"[^"]{20,}"/.test(conf);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "tauri_updater_signature",
      label: "Updates are signature-verified",
      status: hasPubkey ? "PASS" : "FAIL",
      confidence: "HIGH",
      detail: hasPubkey
        ? `An updater public key is configured, so the app will refuse an update bundle that is not signed with the ` +
          `matching private key.`
        : `The updater is enabled but no \`pubkey\` is configured. Tauri verifies update bundles against that key — ` +
          `without it there is nothing to distinguish your release from a substituted one, and the updater becomes a ` +
          `code-execution channel onto every user's machine. Generate a key pair with \`tauri signer generate\`, put ` +
          `the public half in the config and keep the private half in CI secrets only.`,
    });
  }

  return checks;
}

// ── Tauri: capability and command scopes ────────────────────────────────────
function tauriScopes(ctx: DesktopContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const scopeText = ctx.tauriConf + ctx.capabilities;

  // Filesystem scope. "**" from a broad base is read/write to the user's whole
  // home directory, reachable by anything that can reach the IPC layer.
  const fsWildcard = /"(fs:|allow-)[^"]*"[\s\S]{0,200}"\*\*"|"path"\s*:\s*"\$(HOME|DOCUMENT|DOWNLOAD|DESKTOP)\/\*\*"/i.test(scopeText);
  if (/\bfs:/i.test(scopeText) || /"fs"\s*:/i.test(scopeText)) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "tauri_fs_scope",
      label: "Filesystem access is scoped",
      status: fsWildcard ? "WARN" : "PASS",
      confidence: "MEDIUM",
      detail: fsWildcard
        ? `A filesystem permission is scoped with a \`**\` recursive wildcard from a broad base directory. That gives ` +
          `frontend JavaScript read (and possibly write) access to the user's entire home tree, so any injected ` +
          `script can exfiltrate documents or plant files. Narrow the scope to the specific application directory the ` +
          `app actually needs — \`$APPDATA\` or \`$APPLOCALDATA\` rather than \`$HOME\`.`
        : `Filesystem permissions are declared with bounded scopes.`,
    });
  }

  // Shell scope. `shell:allow-execute` with a wildcard argument is arbitrary
  // command execution reachable from the WebView.
  if (/shell:allow-(execute|spawn)|"shell"\s*:\s*\{/i.test(scopeText)) {
    const validatedArgs = /"args"\s*:\s*(false|\[)/i.test(scopeText);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "tauri_shell_scope",
      label: "Shell command execution is constrained",
      status: validatedArgs ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: validatedArgs
        ? `Shell permissions declare an explicit argument specification, so the frontend cannot pass arbitrary ` +
          `arguments to the command.`
        : `A shell execute/spawn permission is granted without a visible \`args\` specification. Tauri lets you pin ` +
          `both the command and the shape of its arguments; without that, frontend JavaScript chooses what runs, and ` +
          `an injected script inherits it. Declare each allowed command with a fixed \`args\` array (or \`false\` for ` +
          `no arguments).`,
      });
  }

  // shell:allow-open with a permissive validator, or an unscoped opener:allow-open-url, is the
  // Tauri analogue of an unvalidated shell.openExternal. v2 apps open URLs through the opener
  // plugin, so a check that only knew shell:allow-open never saw them.
  const shellOpen = /shell:allow-open/i.test(scopeText);
  const opener = openerUrlScope(ctx.permissions);
  if (shellOpen || opener !== null) {
    const shellScoped = !shellOpen || /"validator"\s*:\s*"[^"]+"/i.test(scopeText);
    const scoped = shellScoped && (opener === null || opener === "scoped");
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "tauri_shell_open_validator",
      label: "Opening links is restricted to web URLs (shell/opener scope)",
      status: scoped ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: scoped
        ? opener !== null
          ? `The opener plugin's URL permission is scoped to web/mail schemes (\`opener:default\` or an explicit ` +
            `\`allow\` list of http/https URLs).`
          : `\`shell:allow-open\` declares a validator regex — confirm it anchors on \`^https?://\`.`
        : !shellScoped
          ? `\`shell:allow-open\` is granted with no validator. It hands the string to the operating system's URL ` +
            `handler, so a \`file://\` path or an application scheme can launch a local program. Add a validator regex ` +
            `that permits only \`http\` and \`https\`.`
          : opener === "broad"
            ? `\`opener:allow-open-url\` is scoped with an entry that is not an http/https/mailto/tel URL, so the ` +
              `frontend can ask the OS to open a \`file://\` path or an application scheme. Restrict the \`allow\` list ` +
              `to \`https://*\` (and \`http://*\` if needed).`
            : `\`opener:allow-open-url\` is granted with no URL scope in the capability files. Scope it with an \`allow\` ` +
              `list of http/https URLs so the frontend cannot open \`file://\` paths or application schemes.`,
    });
  }

  // Tauri v1 reached end of life for new development; v2 is where the capability
  // system (and its security model) lives.
  const isV2 = /"\$schema"[^"]*config\/2|(^|\/)src-tauri\/capabilities\//i.test(scopeText) ||
    ctx.paths.some((p) => /src-tauri\/capabilities\//i.test(p));
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "tauri_version_current",
    label: "Built on Tauri v2",
    status: isV2 ? "PASS" : "WARN",
    confidence: "MEDIUM",
    detail: isV2
      ? `Tauri v2 capability files are present.`
      : `No \`src-tauri/capabilities/\` directory found, which suggests Tauri v1. v2 replaced v1's coarse allowlist ` +
        `with per-window capabilities and scoped permissions — the mechanism the scope checks above rely on — and v1 ` +
        `no longer receives feature work. Migrating is the prerequisite for granting the frontend anything narrower ` +
        `than "the whole API".`,
  });

  return checks;
}

// ── Shared across both desktop frameworks ───────────────────────────────────
function sharedDesktop(ctx: DesktopContext): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // A secret in renderer/frontend code ships to every user's disk in plain text.
  const SECRET_LITERAL = /(api[_-]?key|apiKey|secret|clientSecret|access[_-]?token|password)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}["']/i;
  if (SECRET_LITERAL.test(ctx.source)) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "desktop_embedded_secret",
      label: "No API secrets embedded in the shipped app",
      status: "FAIL",
      confidence: "MEDIUM",
      detail:
        `A long secret-shaped literal appears in application source. A desktop app is fully readable on the user's ` +
        `machine — unpacking an ASAR archive or a Tauri bundle takes seconds — so anything compiled in is public. ` +
        `Treat this key as compromised and rotate it, then move the call behind your own backend so the secret stays ` +
        `on a server you control. Client-side restriction (bundle id, referrer) is not a substitute; it is only a ` +
        `speed bump on a binary the attacker holds.`,
    });
  }

  // Native auto-update presence is checked per-framework above; here we check the
  // app declares a version at all, which the updater compares against.
  const version = ctx.pkg?.version ?? (/"version"\s*:\s*"([^"]+)"/.exec(ctx.tauriConf)?.[1] ?? null);
  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "desktop_version_declared",
    label: "The app declares a version",
    status: version ? "PASS" : "WARN",
    confidence: "HIGH",
    detail: version
      ? `Version ${version} is declared.`
      : `No application version found. Auto-updaters compare the installed version against the feed to decide whether ` +
        `to update, and crash reports are unattributable without one — so a missing version breaks both patching and ` +
        `diagnosis.`,
    evidence: version ?? undefined,
  });

  // Crash/error reporting. A desktop app's failures are invisible without it —
  // there are no server logs to look at.
  const hasReporting = crashReportingPresent(ctx.pkg, ctx.appSource + "\n" + ctx.rust, ctx.paths);
  checks.push(absence(ctx, {
    category: CATEGORIES.OBSERVABILITY,
    checkKey: "desktop_crash_reporting",
    label: "Crash and error reporting is wired up",
    status: hasReporting ? "PASS" : "WARN",
    detail: hasReporting
      ? `Crash or error reporting is configured.`
      : `No crash reporter or error-reporting SDK found. A desktop app runs on machines you cannot inspect, across OS ` +
        `versions and hardware you do not have, and produces no server-side logs — so without reporting, a crash that ` +
        `affects a subset of users is invisible until someone emails you. Wire up \`crashReporter\` (Electron) or a ` +
        `reporting SDK, and scrub PII before sending.`,
  }));

  return checks;
}
