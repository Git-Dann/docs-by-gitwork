// ─────────────────────────────────────────────────────────────────────────────
// CHROME EXTENSION CHECK FAMILY.
//
// WHY THIS EXISTS. "Chrome extension" is selectable in the scan dropdown and had NO
// checks of its own — the same hole Android was in. An extension is also the highest-
// privilege thing most teams ship: it runs on pages the user did not write, with
// access to their cookies and page content, and it auto-updates on millions of
// machines. Getting it wrong is worse than getting a website wrong.
//
// DELIBERATELY NOT PART OF NativePlatform. That union means "native mobile project"
// and drives source-extension selection, tech-stack labelling and the mobile
// applicability tables. An extension is none of those things, so it gets its own
// detector and evaluator and is dispatched alongside the mobile family rather than
// through it.
//
// EVERY CHECK HERE IS A REAL CHROME WEB STORE REVIEW OUTCOME, not a style opinion.
// Remotely-hosted code is banned outright under Manifest V3; over-broad host
// permissions are the single most common rejection; and MV2 extensions no longer run.
// Sources are recorded in docs/builder-platform-checks.md.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";
import { isExampleOrFixturePath, isVendoredPath, stripCStyleComments } from "./native-mobile";

/** A parsed manifest, or null when the repo has none / it is unparseable. */
export interface ExtensionManifest {
  path: string;
  raw: string;
  json: Record<string, unknown> | null;
  /** How many other extension manifests the repo carries (other browsers, retired builds). */
  otherCandidates?: number;
}

/**
 * Find the extension manifest.
 *
 * `manifest.json` is a crowded filename — a PWA web app manifest and a few build
 * tools use it too — so a file only counts when it actually carries the
 * `manifest_version` key that Chrome requires. That single test is what stops every
 * PWA in the world being scanned as an extension.
 *
 * ⚠️ A multi-browser repo carries several manifests, and the first one in Map order is
 * not the one Chrome loads. gorhill/uBlock has seven: platform/chromium (MV2, retired),
 * platform/mv3/chromium (MV3, the one on the Web Store), plus Firefox, Safari, Opera and
 * Thunderbird builds. Picking by order judged the retired MV2 build and reported
 * "this extension does not run" — and a Firefox manifest (`background.scripts`) reads
 * as a broken Chrome service worker. So candidates are RANKED: not browser-specific
 * first, then the highest manifest_version, then the shallowest path. Shared by both
 * extension families so they always judge the same file.
 */
export function findExtensionManifest(snapshot: RepoSnapshot): ExtensionManifest | null {
  const candidates: { path: string; text: string; version: number; otherBrowser: boolean; fixture: boolean }[] = [];
  for (const [path, text] of snapshot.files) {
    if (!/(^|\/)manifest\.json$/i.test(path)) continue;
    if (!/"manifest_version"\s*:/.test(text)) continue;
    candidates.push({
      path,
      text,
      version: Number(/"manifest_version"\s*:\s*(\d+)/.exec(text)?.[1] ?? 0),
      otherBrowser: isNonChromeManifestPath(path),
      fixture: isExampleOrFixturePath(path) || isVendoredPath(path),
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) =>
    Number(a.fixture) - Number(b.fixture) ||
    Number(a.otherBrowser) - Number(b.otherBrowser) ||
    b.version - a.version ||
    a.path.split("/").length - b.path.split("/").length);
  const { path, text } = candidates[0];
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = null; // Keep the raw text — a broken manifest is itself a finding.
  }
  return { path, raw: text, json, otherCandidates: candidates.length - 1 };
}

/** A manifest that lives under a Firefox / Safari / Thunderbird build directory, or is named for one. */
function isNonChromeManifestPath(path: string): boolean {
  return /firefox|gecko|mozilla|safari|thunderbird/i.test(path);
}

/** True when the judged manifest targets Firefox rather than Chrome. */
function targetsFirefox(m: Record<string, unknown>, path: string): boolean {
  const bss = m.browser_specific_settings as Record<string, unknown> | undefined;
  const background = m.background as Record<string, unknown> | undefined;
  return isNonChromeManifestPath(path) ||
    (Boolean(bss?.gecko) && Array.isArray(background?.scripts) && typeof background?.service_worker !== "string");
}

/**
 * Manifest variants beside the judged manifest that a build merges over it
 * (darkreader: src/manifest-chrome-mv3.json over src/manifest.json). Firefox, Safari
 * and Thunderbird variants say nothing about the Chrome package, so they are excluded.
 * `text` is null when only the path is known.
 */
function chromeManifestVariants(snapshot: RepoSnapshot, manifestPath: string): { path: string; text: string | null }[] {
  const dir = manifestPath.replace(/[^/]*$/, "");
  return snapshot.paths
    .filter((p) =>
      p !== manifestPath && p.startsWith(dir) && /^manifest[^/]*\.json$/i.test(p.slice(dir.length)) &&
      !isNonChromeManifestPath(p.slice(dir.length)))
    .map((p) => ({ path: p, text: snapshot.files.get(p) ?? null }));
}

/**
 * The minimum_chrome_version the Chrome build declares — from the judged manifest, or
 * from a Chrome variant merged over it. Shared by ext_minimum_chrome_version and
 * ext_x_minimum_chrome_version so the two cannot disagree.
 */
export function declaredMinimumChromeVersion(
  snapshot: RepoSnapshot,
  manifest: ExtensionManifest,
): { value: string; from: string } | null {
  const own = manifest.json?.minimum_chrome_version;
  if (own !== undefined && own !== null && own !== "") return { value: String(own), from: manifest.path };
  for (const v of chromeManifestVariants(snapshot, manifest.path)) {
    const hit = v.text ? /"minimum_chrome_version"\s*:\s*"([^"]+)"/.exec(v.text) : null;
    if (hit) return { value: hit[1], from: v.path };
  }
  return null;
}

/** Chrome's version rule: one to four dot-separated integers 0–65535, no leading zeros. Shared by both families. */
export function isValidExtensionVersion(version: string): boolean {
  return /^\d{1,5}(\.\d{1,5}){0,3}$/.test(version) &&
    version.split(".").every((part) => (part === "0" || !part.startsWith("0")) && Number(part) <= 65535);
}

/** The required icon sizes (16/48/128) the manifest does not declare. Shared by both families. */
export function missingIconSizes(m: Record<string, unknown>): string[] {
  const icons = (m.icons ?? {}) as Record<string, unknown>;
  // Numbers stringified, not a string-literal array — see the note at ext_icons_complete.
  return [16, 48, 128].map(String).filter((s) => !icons[s]);
}

/**
 * Host match patterns the extension asks for at install: MV3 `host_permissions`, plus
 * MV2-style patterns inside `permissions`. ⚠️ `<all_urls>` has no `://`, and filtering on
 * that alone dropped it — so an MV2 `["<all_urls>", "storage"]` reported no host access.
 */
export function installHostPatterns(m: Record<string, unknown>): string[] {
  return [
    ...(Array.isArray(m.host_permissions) ? (m.host_permissions as unknown[]) : []),
    ...(Array.isArray(m.permissions) ? (m.permissions as unknown[]) : []),
  ].filter((p): p is string => typeof p === "string" && (/:\/\//.test(p) || p === "<all_urls>"));
}

// ── Shipped extension source, shared by both families ───────────────────────

export interface ExtensionSourceFile {
  path: string;
  /** Comments stripped, string literals kept. */
  text: string;
  /** Comments AND string-literal contents stripped — for "is this a call" questions. */
  code: string;
}

/**
 * True for a script that ships in the extension package. Excluded: tests, vendored code,
 * build tooling (darkreader's tasks/bundle-js.js holds `'eval(': 'void('` as a string-
 * replacement table — not extension code) and bundler config files.
 */
export function isShippedExtensionSource(p: string): boolean {
  return /\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(p) && !isVendoredPath(p) &&
    !/\.d\.ts$/i.test(p) &&
    !/(^|\/)(tests?|__tests__|spec|e2e)\//i.test(p) && !/\.(tests?|spec)\.[cm]?[jt]sx?$/i.test(p) &&
    !/^(tasks|scripts|build|tools|gulp)\//i.test(p) &&
    // Committed build output and minified copies: the bundler's runtime and vendored
    // libraries (regenerator's `Function("r", …)`) are in there, not the project's code.
    !/(^|\/)(dist|out)\//i.test(p) && !/\.min\.[cm]?js$/i.test(p) &&
    !/(^|\/)[^/]*\.config\.[cm]?[jt]s$/i.test(p) && !/(^|\/)gulpfile\.[cm]?[jt]s$/i.test(p);
}

/** Strip comments and the contents of string/template literals, keeping code tokens. */
export function stripJsCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? n : end;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      out += " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      // Single/double quoted strings end at the line, so a quote inside a regex literal
      // cannot swallow the rest of the file.
      i++;
      while (i < n && source[i] !== c && (c === "`" || source[i] !== "\n")) i += source[i] === "\\" ? 2 : 1;
      i++;
      out += c + c;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Every shipped extension script we read, plus how many exist — the coverage the absence findings rest on. */
export function extensionSourceFiles(snapshot: RepoSnapshot): { files: ExtensionSourceFile[]; total: number; coverage: number } {
  const total = snapshot.paths.filter(isShippedExtensionSource).length;
  const files: ExtensionSourceFile[] = [];
  for (const [path, text] of snapshot.files) {
    if (!isShippedExtensionSource(path)) continue;
    files.push({ path, text: stripCStyleComments(text), code: stripJsCommentsAndStrings(text) });
  }
  return { files, total, coverage: total === 0 ? 0 : Math.min(1, files.length / total) };
}

/** Below this share of shipped scripts read, "not found anywhere" is not a confident answer. */
export const EXTENSION_SOUND_COVERAGE = 0.3;

/**
 * A real `eval(...)` / `new Function(...)` call. Matched on code with strings stripped,
 * so a replacement table entry `'eval('` is not a call, and `.eval(` (e.g.
 * chrome.devtools.inspectedWindow.eval, which evaluates in the INSPECTED page and is the
 * sanctioned DevTools API) is not the global eval. Returns the first file that calls it.
 */
export function findDynamicEval(files: ExtensionSourceFile[]): string | null {
  const re = /(?<![.\w$])eval\s*\(|(?<![\w$])(?:window|globalThis|self)\.eval\s*\(|(?<![.\w$])new\s+Function\s*\(/;
  return files.find((f) => re.test(f.code))?.path ?? null;
}

/**
 * The source files that become content scripts: the `content_scripts[].js` entries in
 * the manifest (and `scripting.executeScript({ files })` targets), matched to the source
 * that builds them by path or by name (`content.js` ← `src/content.ts` or
 * `src/content/index.ts`), plus files in a `content-script(s)` folder. `declared` is
 * how many content-script entries the extension has.
 */
export function contentScriptSources(
  manifest: Record<string, unknown> | null,
  manifestPath: string,
  files: ExtensionSourceFile[],
): { declared: number; files: ExtensionSourceFile[] } {
  const entries: string[] = [];
  const cs = manifest && Array.isArray(manifest.content_scripts) ? (manifest.content_scripts as { js?: unknown }[]) : [];
  for (const block of cs) if (Array.isArray(block?.js)) entries.push(...block.js.filter((j): j is string => typeof j === "string"));
  for (const f of files) {
    for (const m of f.code.matchAll(/executeScript\s*\(/g)) {
      const window = f.text.slice(m.index ?? 0, (m.index ?? 0) + 300);
      for (const e of window.matchAll(/["'`]([\w./-]+\.[cm]?js)["'`]/g)) entries.push(e[1]);
    }
  }
  const dir = manifestPath.includes("/") ? manifestPath.slice(0, manifestPath.lastIndexOf("/") + 1) : "";
  const stem = (p: string) => p.replace(/^\.?\//, "").replace(/\.[cm]?[jt]sx?$/i, "");
  const wanted = entries.map((e) => stem(e));
  const matched = files.filter((f) => {
    const own = stem(f.path);
    const rel = dir && own.startsWith(dir) ? own.slice(dir.length) : own;
    if (/(^|\/)content[-_]?scripts?(\/|$)|(^|\/)contentscript/i.test(own)) return true;
    return wanted.some((w) => {
      const base = w.split("/").pop()!;
      return rel === w || own.endsWith("/" + w) || own.endsWith("/" + base) || own === base ||
        own.endsWith(`/${base}/index`) || own === `${base}/index`;
    });
  });
  return { declared: entries.length, files: matched };
}

/** Shared by ext_dom_injection and ext_x_innerhtml_injection. */
export const HTML_INJECTION_RE = /\.innerHTML\s*=(?!=)|\.outerHTML\s*=(?!=)|insertAdjacentHTML\s*\(/;
export const HTML_SANITISER_RE = /DOMPurify|sanitize|textContent\s*=/;
/** Shared by ext_message_sender_validation and ext_x_message_sender_check. */
export const MESSAGE_LISTENER_RE = /onMessage(?:External)?\.addListener|onConnect(?:External)?\.addListener/;
export const SENDER_CHECK_RE = /sender\.(id|origin|url|tab)\b/;

/** True when this repo is a browser extension. */
export function isChromeExtension(snapshot: RepoSnapshot): boolean {
  return findExtensionManifest(snapshot) !== null;
}

const HIGH_RISK_PERMISSIONS: Record<string, string> = {
  tabs: "read the title and URL of every open tab",
  webRequest: "observe every network request the browser makes",
  webRequestBlocking: "block or rewrite every network request",
  cookies: "read and write cookies for the sites it can access",
  history: "read the full browsing history",
  debugger: "attach the DevTools debugger to any page",
  management: "enable, disable and uninstall other extensions",
  proxy: "route all traffic through a proxy it controls",
  nativeMessaging: "talk to a native binary outside the browser sandbox",
  clipboardRead: "read the clipboard",
  downloads: "start downloads and read the download history",
  // MV3's injection APIs: with host access, `scripting` runs code in any matched page and
  // `userScripts` runs arbitrary user-supplied code there.
  scripting: "inject scripts and styles into the pages it has host access to",
  userScripts: "run arbitrary user-supplied scripts in web pages",
};

/**
 * `scripting` only reaches the pages the extension already has host access to, so it is
 * high-risk when that access is every site — refined-github's `scripting` on four GitHub
 * origins is not. `userScripts` runs arbitrary code wherever it is pointed, so it always is.
 */
function isHighRiskPermission(p: string, m: Record<string, unknown>): boolean {
  if (!(p in HIGH_RISK_PERMISSIONS)) return false;
  if (p === "scripting") return isAllUrlsPattern(installHostPatterns(m));
  return true;
}

export function evaluateChromeExtensionChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const manifest = findExtensionManifest(snapshot);
  if (!manifest) return [];

  const checks: PulseScanCheckInput[] = [];
  const m = manifest.json;

  // ── Manifest parses at all ──────────────────────────────────────────────────
  if (!m) {
    return [{
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "ext_manifest_valid",
      label: "Extension manifest is valid JSON",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        `${manifest.path} declares a manifest_version but is not valid JSON, so Chrome cannot load this extension at ` +
        `all — and every other check here is unassessable. A trailing comma or a comment is the usual cause; the ` +
        `manifest is strict JSON with neither allowed.`,
      evidence: manifest.path,
    }];
  }

  checks.push({
    category: CATEGORIES.CODE_QUALITY,
    checkKey: "ext_manifest_valid",
    label: "Extension manifest is valid JSON",
    status: "PASS",
    confidence: "HIGH",
    detail: `${manifest.path} parses cleanly.`,
  });

  const manifestChecks = evaluateExtensionManifest(m, "repo");
  const replace = (key: string, patch: Partial<PulseScanCheckInput>) => {
    const i = manifestChecks.findIndex((c) => c.checkKey === key);
    if (i >= 0) manifestChecks[i] = { ...manifestChecks[i], ...patch };
  };
  // Name the judged file whenever there was a choice to make, so a reader can see WHICH
  // of a multi-browser repo's manifests the verdict is about.
  if ((manifest.otherCandidates ?? 0) > 0) {
    const i = manifestChecks.findIndex((c) => c.checkKey === "ext_manifest_v3");
    if (i >= 0) {
      manifestChecks[i] = {
        ...manifestChecks[i],
        detail: `${manifestChecks[i].detail} (Judged from ${manifest.path}, the Chrome manifest chosen from ` +
          `${(manifest.otherCandidates ?? 0) + 1} in the repository.)`,
      };
    }
  }
  // ⚠️ A repo can keep an MV2 base manifest beside a Chrome MV3 variant that the build merges
  // over it — darkreader/darkreader: src/manifest.json is V2, src/manifest-chrome-mv3.json is V3
  // (tasks/bundle-manifest.js). "This extension does not run" is false for such a repo. Variants are
  // read into the snapshot (CONFIG_PATTERNS), so one is usually VERIFIED; a variant known only by
  // name earns a WARN, not a PASS.
  const variants = chromeManifestVariants(snapshot, manifest.path);
  if (Number(m.manifest_version) < 3) {
    const verified = variants.find((v) => v.text && /"manifest_version"\s*:\s*3\b/.test(v.text))?.path;
    const byName = verified ? undefined : variants.find((v) => /mv3/i.test(v.path.replace(/^.*\//, "")))?.path;
    const mv3Variant = verified ?? byName;
    if (mv3Variant) {
      replace("ext_manifest_v3", {
        status: verified ? "PASS" : "WARN",
        confidence: "MEDIUM",
        detail: verified
          ? `${manifest.path} is Manifest V2, but ${mv3Variant} beside it declares manifest_version 3 — presumably ` +
            `the source of the Chrome build. Confirm the manifest you upload to the Web Store declares manifest_version 3.`
          : `${manifest.path} is Manifest V2, but ${mv3Variant} beside it is named as a Manifest V3 variant (its ` +
            `contents were not read). If the Chrome build merges it over the base, the package is V3; if it is an ` +
            `unfinished migration, the shipped extension is still V2 and no longer runs. Confirm which.`,
        evidence: verified ? `manifest_version 3 in ${mv3Variant}` : `MV3-named sibling ${mv3Variant}`,
      });
    }
  }
  // Same overlay for minimum_chrome_version: darkreader declares 106 in the Chrome variant only.
  const minVersion = declaredMinimumChromeVersion(snapshot, manifest);
  if (minVersion && minVersion.from !== manifest.path) {
    replace("ext_minimum_chrome_version", {
      status: "PASS",
      confidence: "MEDIUM",
      detail: `${manifest.path} declares no minimum_chrome_version, but the Chrome variant ${minVersion.from} merged ` +
        `over it declares ${minVersion.value}.`,
      evidence: `minimum_chrome_version ${minVersion.value} in ${minVersion.from}`,
    });
  }
  checks.push(...manifestChecks);
  const surface = surfaceChecks(m, snapshot);
  // A Firefox manifest's `background.scripts` is correct for Firefox; reporting it as a Chrome
  // service worker Chrome "will refuse to load" is wrong. Only reached when no Chrome manifest exists.
  if (targetsFirefox(m, manifest.path)) {
    const i = surface.findIndex((c) => c.checkKey === "ext_service_worker");
    if (i >= 0) {
      surface[i] = {
        ...surface[i],
        status: "WARN",
        confidence: "MEDIUM",
        detail: `${manifest.path} targets Firefox (\`browser_specific_settings.gecko\` / a Firefox build directory) ` +
          `and uses \`background.scripts\`, which Firefox supports. No Chrome manifest was found in the repository, ` +
          `so whether a Chrome build exists — and whether it declares a service worker — could not be established.`,
      };
    }
  }
  checks.push(...surface);
  checks.push(...extensionCodeChecks(snapshot));
  checks.push(...listingChecks(m));

  return checks;
}

/**
 * The script sources an extension's CSP actually allows.
 *
 * ⚠️ Parsed by DIRECTIVE. The previous checks ran three regexes over the whole policy
 * serialised to one string, which produced FAILs on store-approved extensions:
 * `/unsafe-eval/` matched `'wasm-unsafe-eval'` (which MV3 permits — Bitwarden, 7M users,
 * "automatic rejection"); `/script-src[^"]*https?:\/\//` ran across directives, so an
 * https frame-src after `script-src 'self'` read as remote script (Grammarly, 40M users);
 * and `/unsafe-inline/` matched style-src. Only script-src — or default-src when there is
 * none — governs what code runs.
 */
export function extensionScriptSources(csp: unknown): string[] {
  const policies: string[] = typeof csp === "string"
    ? [csp]
    : csp && typeof csp === "object"
      ? Object.values(csp as Record<string, unknown>).filter((v): v is string => typeof v === "string")
      : [];
  const sources: string[] = [];
  for (const policy of policies) {
    const directives = policy.split(";").map((d) => d.trim().split(/\s+/).filter(Boolean)).filter((d) => d.length > 0);
    const script = directives.find((d) => d[0].toLowerCase() === "script-src") ?? directives.find((d) => d[0].toLowerCase() === "default-src");
    if (script) sources.push(...script.slice(1));
  }
  return sources;
}

/**
 * The checks that read only the manifest — shared by a repository scan and a Chrome Web
 * Store listing scan (whose listing carries the published manifest). `surface` drops the
 * two that only mean something for source: the store sets update_url itself, and the
 * listing has its own completeness checks.
 */
export function evaluateExtensionManifest(m: Record<string, unknown>, surface: "repo" | "store"): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // ── Manifest V3 ─────────────────────────────────────────────────────────────
  const version = Number(m.manifest_version);
  checks.push({
    category: CATEGORIES.APP_STORE,
    checkKey: "ext_manifest_v3",
    label: "Uses Manifest V3",
    status: version >= 3 ? "PASS" : "FAIL",
    confidence: "HIGH",
    detail: version >= 3
      ? `Manifest V3 — the only version the Chrome Web Store accepts.`
      : `Manifest V${version || "2"}. Chrome has ended Manifest V2 support: the Web Store no longer accepts V2 ` +
        `submissions and V2 extensions are disabled in the browser. This is not a warning, it is "this extension does ` +
        `not run". Migration is real work — background pages become service workers (no DOM, and they are terminated ` +
        `when idle), and blocking webRequest becomes declarativeNetRequest.`,
    evidence: `manifest_version ${version || "?"}`,
  });

  // ── Host permissions breadth ────────────────────────────────────────────────
  // The single most common Web Store rejection, and the one users see in the scary
  // install prompt: "Read and change all your data on all websites".
  const hostPerms = installHostPatterns(m);
  const contentScriptMatches = Array.isArray(m.content_scripts)
    ? (m.content_scripts as Array<{ matches?: string[] }>).flatMap((cs) => cs.matches ?? [])
    : [];
  const allHosts = [...hostPerms, ...contentScriptMatches];
  const wildcards = [...new Set(allHosts.filter((h) => isAllUrlsPattern([h])))];

  if (allHosts.length > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "ext_host_permissions_scoped",
      label: "Host permissions scoped to the sites the extension needs",
      // WARN on both surfaces. Many extensions legitimately need every site — dark mode, ad
      // blocking, password managers — so all-sites access is a cost to justify, not a defect.
      // A FAIL on the repo surface said the opposite of the store surface about the same manifest.
      status: wildcards.length > 0 ? "WARN" : "PASS",
      confidence: "HIGH",
      detail: wildcards.length > 0
        ? `The extension requests ${wildcards.join(", ")} — access to EVERY site the user visits. Chrome shows this as ` +
          `"Read and change all your data on all websites", which suppresses installs` +
          (surface === "store"
            ? `. `
            : `, and it is the most common reason a Web Store review is held for justification. `) +
          `Some extensions genuinely need it (dark mode, ad blocking, a password manager filling forms on any site). ` +
          `It also means one compromised dependency in this extension can read every page the user opens. ` +
          (surface === "store" ? `If this extension does not need every site, list` : `List`) +
          ` the specific origins instead, or request them at runtime with the optional_host_permissions + chrome.permissions.request flow.`
        : `Host access is scoped to ${allHosts.length} specific origin(s) rather than all sites.`,
      evidence: wildcards.length > 0 ? wildcards.join(", ") : `${allHosts.length} scoped origin(s)`,
    });
  }

  // ── High-risk API permissions ───────────────────────────────────────────────
  const perms = Array.isArray(m.permissions) ? (m.permissions as string[]) : [];
  const risky = perms.filter((p) => isHighRiskPermission(p, m));
  if (risky.length > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "ext_high_risk_permissions",
      label: "High-risk permissions are justified",
      status: risky.length >= 3 ? "WARN" : "WARN",
      confidence: "HIGH",
      detail:
        `The extension requests ${risky.length} high-risk permission(s): ` +
        `${risky.map((p) => `\`${p}\` (${HIGH_RISK_PERMISSIONS[p]})`).join("; ")}. Each needs a stated purpose at ` +
        `review, and \`debugger\`, \`management\`, \`proxy\` and \`nativeMessaging\` in particular attract manual ` +
        `inspection and are refused without a strong case. Drop any the extension does not actually use — an unused ` +
        `high-risk permission is pure rejection risk.`,
      evidence: risky.join(", "),
    });
  }

  // ── Remotely-hosted code — banned outright under MV3 ────────────────────────
  const csp = JSON.stringify(m.content_security_policy ?? "");
  const scriptSources = extensionScriptSources(m.content_security_policy).map((source) => source.toLowerCase());
  const unsafeEval = scriptSources.includes("'unsafe-eval'");
  const unsafeInline = scriptSources.includes("'unsafe-inline'");
  const remoteScriptInCsp = scriptSources.some((source) => /^https?:/.test(source) || source === "*");

  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "ext_no_remote_code",
    label: "No remotely-hosted code",
    status: remoteScriptInCsp || unsafeEval ? "FAIL" : "PASS",
    confidence: "HIGH",
    detail: remoteScriptInCsp || unsafeEval
      ? `The content security policy ${remoteScriptInCsp ? "allows scripts from a remote origin" : ""}` +
        `${remoteScriptInCsp && unsafeEval ? " and " : ""}${unsafeEval ? "permits `unsafe-eval`" : ""}. Manifest V3 ` +
        `BANS remotely-hosted code: every line the extension executes must ship in the package and be reviewable. ` +
        `This is an automatic rejection, not a discussion — and the reason for the rule is that remote code lets a ` +
        `reviewed extension become something else after review. Bundle the code, and replace eval-based logic ` +
        `(templating, dynamic config) with a build step.`
      : `No remote script origins and no \`unsafe-eval\` in the content security policy.`,
    evidence: remoteScriptInCsp || unsafeEval ? csp.slice(0, 160) : undefined,
  });

  if (unsafeInline) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "ext_csp_unsafe_inline",
      label: "No unsafe-inline in the extension CSP",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `The content security policy permits \`unsafe-inline\`. Chrome ignores it for extension pages under MV3, so ` +
        `it buys nothing, and its presence usually means inline handlers are still in the HTML and will silently ` +
        `stop working. Move handlers into the bundled script.`,
    });
  }

  // ── externally_connectable wildcards ────────────────────────────────────────
  const extConn = m.externally_connectable as { matches?: string[] } | undefined;
  const extMatches = extConn?.matches ?? [];
  const extWild = extMatches.filter((h) => /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*)$/i.test(h));
  if (extWild.length > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "ext_externally_connectable_scoped",
      label: "externally_connectable is scoped",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        `\`externally_connectable\` accepts messages from ${extWild.join(", ")} — meaning ANY web page can send this ` +
        `extension a message and invoke whatever its message handler does, with the extension's privileges. Restrict ` +
        `it to the specific origins that legitimately talk to the extension, and treat every incoming message as ` +
        `untrusted input regardless.`,
      evidence: extWild.join(", "),
    });
  }

  // ── Secrets committed in the manifest ───────────────────────────────────────
  const oauth = m.oauth2 as { client_secret?: string } | undefined;
  if (oauth?.client_secret) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "ext_oauth_secret_committed",
      label: "No OAuth client secret in the manifest",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        `An OAuth \`client_secret\` is committed in the manifest. Everything in an extension package is readable — ` +
        `users can unpack it from their own profile directory — so this secret is public. Rotate it, and use a flow ` +
        `that does not require a client secret in a public client (PKCE), or move the exchange to your server.`,
    });
  }

  // ── Update integrity ────────────────────────────────────────────────────────
  const updateUrl = typeof m.update_url === "string" ? m.update_url : "";
  if (surface === "repo" && updateUrl && !/^https:/i.test(updateUrl)) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "ext_update_url_https",
      label: "Update URL uses HTTPS",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        `\`update_url\` is not HTTPS (${updateUrl}). Extension updates execute with the extension's full privileges, ` +
        `so an attacker on the network can serve a malicious update. Use HTTPS, or distribute through the Web Store ` +
        `and remove the field.`,
      evidence: updateUrl,
    });
  }

  // ── Store listing basics ────────────────────────────────────────────────────
  // Written out one field at a time rather than as an array of three name strings.
  // The reconcile guard treats any 3-element string array as a skipAllChecks
  // [category, check_key, label] tuple, so a bare list of three field names is read
  // as an unregistered check key. Tightening that regex would blind it to the four
  // real single-word keys (compression, changelog, favicon, documentation), so the
  // array goes rather than the guard — and note the guard scans comments too, so the
  // offending shape must not appear in prose either.
  const missingListing: string[] = [];
  if (!m.name) missingListing.push("name");
  if (!m.version) missingListing.push("version");
  if (!m.description) missingListing.push("description");
  const icons = m.icons as Record<string, string> | undefined;
  if (surface === "repo" && (missingListing.length > 0 || !icons)) {
    checks.push({
      category: CATEGORIES.STORE_LISTING,
      checkKey: "ext_listing_complete",
      label: "Manifest carries the fields the store listing needs",
      status: missingListing.length > 0 ? "FAIL" : "WARN",
      confidence: "HIGH",
      detail:
        `${missingListing.length > 0 ? `Missing required manifest field(s): ${missingListing.join(", ")}. ` : ""}` +
        `${!icons ? "No \`icons\` declared, so Chrome renders a generic puzzle piece in the toolbar and the store listing. " : ""}` +
        `Chrome requires name, version and description to publish, and an icon set at 16/48/128 to look like a real product.`,
      evidence: missingListing.join(", ") || "no icons",
    });
  }

  // ── Minimum Chrome version ──────────────────────────────────────────────────
  checks.push({
    category: CATEGORIES.APP_STORE,
    checkKey: "ext_minimum_chrome_version",
    label: "minimum_chrome_version declared",
    status: m.minimum_chrome_version ? "PASS" : "WARN",
    confidence: "HIGH",
    detail: m.minimum_chrome_version
      ? `Declares minimum_chrome_version ${String(m.minimum_chrome_version)}.`
      : `No \`minimum_chrome_version\`. Users on older Chrome builds can install the extension and then hit whatever ` +
        `API it needs but their browser lacks — which surfaces as "the extension is broken" reviews rather than an ` +
        `install-time message. Declare the oldest version you actually test.`,
  });

  return checks;
}

/** True when a match-pattern list reaches every site the user visits. */
export function isAllUrlsPattern(patterns: unknown): boolean {
  if (!Array.isArray(patterns)) return false;
  return patterns.some((p) => typeof p === "string" && /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*)$/i.test(p));
}

const BUNDLER_CONFIG_RE = /(^|\/)(tsdown|tsup|vite|webpack|rollup|esbuild|rspack|wxt|parcel|plasmo|crx)\.config\.[cm]?[jt]s$|(^|\/)\.parcelrc$/i;

/**
 * Where the declared service worker comes from. The worker path is relative to the
 * EXTENSION ROOT (the manifest's directory); a leading "/" means that root, not the repo
 * root — gorhill/uBlock declares `/js/background.js` in platform/mv3/chromium/manifest.json.
 *
 * ⚠️ A compiled extension never commits the .js its manifest names: refined-github's
 * manifest says `assets/background.js`, built from source/background.ts by tsdown. A HIGH
 * "no such file" there was a confident claim the evidence could not back.
 */
export function resolveServiceWorker(
  snapshot: RepoSnapshot,
  manifestPath: string,
  declaredWorker: string,
): { kind: "exists" | "built" | "elsewhere" | "compiled" | "bundler" | "missing"; path?: string } {
  const manifestDir = manifestPath.replace(/[^/]*$/, "").toLowerCase();
  const workerRel = declaredWorker.replace(/^\.?\//, "").toLowerCase();
  const direct = snapshot.paths.find((p) => p.toLowerCase() === manifestDir + workerRel);
  if (direct) return { kind: "exists", path: direct };
  if (/^(dist|build|out)\//i.test(workerRel)) return { kind: "built" };
  // A same-named file elsewhere only counts when it is the project's own source — never a vendored copy or a
  // test fixture, which would let a genuinely missing worker pass on a coincidental filename.
  const ownSource = (p: string) => !isVendoredPath(p) && !isExampleOrFixturePath(p);
  const elsewhere = snapshot.paths.find((p) =>
    ownSource(p) && (p.toLowerCase() === workerRel || p.toLowerCase().endsWith(`/${workerRel}`)));
  if (elsewhere) return { kind: "elsewhere", path: elsewhere };
  const stem = workerRel.replace(/^.*\//, "").replace(/\.[cm]?jsx?$/, "");
  const compiled = snapshot.paths
    .filter((p) => ownSource(p) && isShippedExtensionSource(p) &&
      p.replace(/^.*\//, "").toLowerCase().replace(/\.[cm]?[jt]sx?$/, "") === stem)
    .sort((x, y) => x.split("/").length - y.split("/").length)[0];
  if (compiled) return { kind: "compiled", path: compiled };
  const bundler = snapshot.paths.find((p) => !isVendoredPath(p) && BUNDLER_CONFIG_RE.test(p));
  if (bundler) return { kind: "bundler", path: bundler };
  return { kind: "missing" };
}

// ── The extension's surface on the user's browsing ──────────────────────────
function surfaceChecks(m: Record<string, unknown>, snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const version = Number(m.manifest_version);
  const background = m.background as Record<string, unknown> | undefined;

  // MV3 background must be a service worker. A persistent background page is the
  // single clearest sign of an unfinished migration.
  if (version >= 3 && background) {
    const isServiceWorker = typeof background.service_worker === "string";
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "ext_service_worker",
      label: "Background logic runs as a service worker",
      status: isServiceWorker ? "PASS" : "FAIL",
      confidence: "HIGH",
      detail: isServiceWorker
        ? `The background context is a service worker, as Manifest V3 requires. Remember it is TERMINATED when idle: ` +
          `anything held in a module-level variable is lost, so state belongs in chrome.storage.`
        : `The manifest declares a V3 extension but its \`background\` entry is a page or scripts array rather than a ` +
          `\`service_worker\`. Chrome will refuse to load it. This is the half-finished migration case — and the ` +
          `behavioural difference matters beyond the manifest key: a service worker has no DOM and is shut down when ` +
          `idle, so any code that assumed a long-lived page with in-memory state needs rewriting, not just moving.`,
    });
  }

  // Content-script breadth. `<all_urls>` means the extension's code runs on the
  // user's bank, their email and their employer's internal tools.
  const contentScripts = Array.isArray(m.content_scripts) ? (m.content_scripts as Record<string, unknown>[]) : [];
  if (contentScripts.length > 0) {
    const broad = contentScripts.filter((cs) => isAllUrlsPattern(cs.matches));
    const atStart = broad.some((cs) => cs.run_at === "document_start");
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "ext_content_script_scope",
      label: "Content scripts are scoped to specific sites",
      status: broad.length > 0 ? "WARN" : "PASS",
      confidence: "HIGH",
      detail: broad.length > 0
        ? `${broad.length} content script block(s) match every site (\`<all_urls>\` or \`*://*/*\`)${atStart
            ? ", one of them at `document_start`, so it runs before the page's own scripts on every page load"
            : ""}. Your code is then injected into the user's bank, their webmail and their employer's internal ` +
          `tools — which is both the largest bug blast radius available to a browser extension and the single most ` +
          `common cause of a Web Store review rejection. Narrow \`matches\` to the sites the feature needs, or use ` +
          `\`activeTab\` so injection happens only when the user clicks your icon.`
        : `${contentScripts.length} content script block(s), each scoped to specific match patterns.`,
      evidence: broad.length > 0 ? `${broad.length} of ${contentScripts.length} blocks match all URLs` : undefined,
    });
  }

  // web_accessible_resources exposed to every origin is a fingerprinting vector
  // and can expose internal extension pages to hostile sites.
  const war = m.web_accessible_resources;
  if (Array.isArray(war) && war.length > 0) {
    const openToAll = war.some((entry) =>
      // MV2 lists bare file paths, and every one of them is reachable from any origin.
      typeof entry === "string" ||
      (typeof entry === "object" && entry !== null && isAllUrlsPattern((entry as Record<string, unknown>).matches) &&
        // `use_dynamic_url` serves the file under a per-session ID instead of the fixed extension ID, so a page
        // cannot probe for it to fingerprint the user or reach it (gorhill/uBlock MV3 sets it on every all-origin entry).
        (entry as Record<string, unknown>).use_dynamic_url !== true),
    );
    const mv2Strings = war.some((entry) => typeof entry === "string");
    const dynamicOnly = !openToAll && war.some((entry) =>
      typeof entry === "object" && entry !== null && isAllUrlsPattern((entry as Record<string, unknown>).matches),
    );
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "ext_web_accessible_resources",
      label: "Web-accessible resources are restricted",
      status: openToAll ? "WARN" : "PASS",
      confidence: "HIGH",
      detail: openToAll
        ? `\`web_accessible_resources\` is exposed to every origin. Two consequences: any website can fetch those ` +
          `files, which makes the extension trivially FINGERPRINTABLE (a page probes for your resource and now knows ` +
          `the user has it installed — a well-documented deanonymisation technique); and any internal page you expose ` +
          `becomes reachable from a hostile origin. ` +
          (mv2Strings
            ? `Manifest V2 lists resources as bare paths, which are open to every origin; Manifest V3's object form ` +
              `lets you restrict \`matches\` to the sites that genuinely need each resource.`
            : `Restrict the \`matches\` list to the sites that genuinely need the resource.`)
        : dynamicOnly
          ? `Web-accessible resources open to every origin all set \`use_dynamic_url\`, so they are served under a ` +
            `per-session ID rather than the fixed extension ID — a page cannot probe a known URL to detect the ` +
            `extension. A page still learns that session URL if the extension inserts the resource into it.`
          : `Web-accessible resources declare specific origin matches.`,
    });
  }

  // Blocking webRequest does not exist in MV3.
  const permissions = [
    ...(Array.isArray(m.permissions) ? (m.permissions as string[]) : []),
    ...(Array.isArray(m.optional_permissions) ? (m.optional_permissions as string[]) : []),
  ];
  if (version >= 3 && permissions.includes("webRequestBlocking")) {
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "ext_blocking_webrequest",
      label: "Does not rely on blocking webRequest",
      status: "FAIL",
      confidence: "HIGH",
      detail:
        `\`webRequestBlocking\` is requested in a Manifest V3 extension. That permission does not exist for ordinary ` +
        `extensions in V3 — it is restricted to force-installed enterprise policy — so any blocking or rewriting the ` +
        `extension does today silently stops working. Rewrite it with \`declarativeNetRequest\`, which expresses ` +
        `rules declaratively so Chrome applies them without running your code on every request.`,
    });
  }

  // activeTab is the narrow alternative to broad host permissions.
  // Same host list as ext_host_permissions_scoped — MV2 extensions put `<all_urls>` in `permissions`,
  // and reading only `host_permissions` meant this never fired for them.
  if (isAllUrlsPattern(installHostPatterns(m)) && !permissions.includes("activeTab")) {
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "ext_activetab_alternative",
      label: "activeTab considered instead of broad host access",
      status: "WARN",
      confidence: "HIGH",
      detail:
        `The extension requests host access to every site and does not request \`activeTab\`. \`activeTab\` grants ` +
        `the same access to the CURRENT tab, but only after the user clicks your icon, and it shows no scary ` +
        `install-time warning. If the feature is user-initiated, switching removes both the "Read and change all your ` +
        `data on all websites" prompt — the largest single drop-off point at install — and the Web Store review ` +
        `burden of justifying blanket access.`,
    });
  }

  // Optional permissions let the user grant the scary ones on demand.
  const risky = permissions.filter((p) => isHighRiskPermission(p, m));
  if (risky.length >= 2) {
    const usesOptional = Array.isArray(m.optional_permissions) && (m.optional_permissions as string[]).length > 0;
    checks.push({
      category: CATEGORIES.APP_STORE,
      checkKey: "ext_optional_permissions",
      label: "High-risk permissions are requested on demand",
      status: usesOptional ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: usesOptional
        ? `Some permissions are declared as optional and requested at runtime.`
        : `${risky.length} high-risk permissions are all requested up front, with none in \`optional_permissions\`. ` +
          `Chrome shows every one of them in a single install-time prompt, so a permission needed by a feature most ` +
          `users never open still costs you installs — and Web Store review asks you to justify each. Move the ones ` +
          `tied to specific features into \`optional_permissions\` and call \`chrome.permissions.request\` when the ` +
          `user first uses that feature.`,
      evidence: risky.join(", "),
    });
  }

  // Icons — the Web Store requires the full set, and a missing size renders blank.
  const icons = (m.icons ?? {}) as Record<string, unknown>;
  // Numbers stringified, not a string-literal array: categories.reconcile.test.ts
  // reads this file as TEXT and treats a bare three-string literal as a
  // [category, key, label] tuple, so writing the three sizes as quoted strings had
  // the middle one reported as an unregistered checkKey. (Worth noting the comment
  // explaining it trips the same wire if it quotes them — so it does not.)
  const missingIcons = missingIconSizes(m);
  checks.push({
    category: CATEGORIES.STORE_LISTING,
    checkKey: "ext_icons_complete",
    label: "All required icon sizes are declared",
    status: missingIcons.length === 0 ? "PASS" : "WARN",
    confidence: "HIGH",
    detail: missingIcons.length === 0
      ? `Icons declared at 16, 48 and 128px.`
      : `Missing icon size(s): ${missingIcons.join(", ")}px. Chrome uses 16 in the toolbar and page favicon, 48 in ` +
        `the extensions management page, and 128 on the Web Store listing and at install time — ` +
        (Object.keys(icons).length > 0
          ? `a missing size is scaled from another declared icon (${Object.keys(icons).join(", ")}px), which can look soft`
          : `with no icons declared Chrome shows a generic placeholder`) +
        `, and 128 is required for submission.`,
    evidence: missingIcons.length > 0 ? `missing ${missingIcons.join(", ")}` : undefined,
  });

  // A repo with no build output referenced by the manifest is a packaging risk,
  // but only worth saying when we can actually see the tree.
  const declaredWorker = typeof background?.service_worker === "string" ? background.service_worker : null;
  if (declaredWorker) {
    const manifestPath = findExtensionManifest(snapshot)?.path ?? "";
    const worker = resolveServiceWorker(snapshot, manifestPath, declaredWorker);
    const k = worker.kind;
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "ext_entrypoints_resolve",
      label: "Manifest entry points resolve to real files",
      status: k === "missing" ? "WARN" : k === "bundler" ? "INCONCLUSIVE" : "PASS",
      confidence: k === "exists" || k === "missing" ? "HIGH" : "MEDIUM",
      detail: k === "exists"
        ? `The declared service worker (\`${declaredWorker}\`) exists in the repository.`
        : k === "elsewhere"
          ? `The declared service worker (\`${declaredWorker}\`) is not beside the manifest, but \`${worker.path}\` ` +
            `matches it — consistent with a build step that assembles the package from several directories, ` +
            `which cannot be fully verified from source alone.`
          : k === "built"
          ? `The service worker points at build output (\`${declaredWorker}\`), which is not committed — expected for ` +
            `a bundled extension, so this cannot be verified from source alone.`
          : k === "compiled"
          ? `The declared service worker (\`${declaredWorker}\`) is not committed, but \`${worker.path}\` is its ` +
            `source — the usual shape of a compiled extension, where the build emits the .js the manifest names. ` +
            `That the build actually emits it at that path cannot be verified from source alone.`
          : k === "bundler"
          ? `The declared service worker (\`${declaredWorker}\`) is not committed and no same-named source was found, ` +
            `but the repository has a bundler config (\`${worker.path}\`) that may emit it under another source ` +
            `name. Whether the packaged extension contains it could not be established from source.`
          : `The manifest declares \`${declaredWorker}\` as its service worker and no such file exists in the ` +
            `repository, no source file shares its name, and there is no bundler config that could produce it. ` +
            `Chrome refuses to load an extension whose entry point is missing.`,
      evidence: worker.path,
    });
  }

  return checks;
}

// ── What the extension's own code does ──────────────────────────────────────
function extensionCodeChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const { files, coverage } = extensionSourceFiles(snapshot);
  if (files.length === 0) return checks;
  const source = files.map((f) => f.text).join("\n");
  // Identifier-level questions (an innerHTML assignment, a listener, a sender check) are asked
  // of CODE, so filter-list data and scriptlet argument strings that merely contain the word
  // — uBOL's generated rulesets ship "/skin|insertAdjacentHTML|netflix/" as data — are not calls.
  const code = files.map((f) => f.code).join("\n");

  const thin = coverage < EXTENSION_SOUND_COVERAGE;
  const note = thin
    ? ` (Based on ${Math.round(coverage * 100)}% of this extension's script files — below the threshold for a ` +
      `confident "not present anywhere", so this is inconclusive rather than a failure.)`
    : "";

  // eval / new Function in an extension context. Remotely-hosted code is banned
  // under MV3, and this is the usual way it slips back in. Presence is sound on a
  // sample; absence is only as good as the coverage behind it.
  const evalIn = findDynamicEval(files);
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "ext_no_eval",
    label: "No dynamic code execution",
    status: evalIn ? "FAIL" : "PASS",
    confidence: evalIn ? "HIGH" : thin ? "LOW" : "HIGH",
    detail: evalIn
      ? `\`eval\` or \`new Function\` is called in extension source (${evalIn}). Manifest V3's Content Security Policy ` +
        `forbids it — Chrome will throw at runtime — and reviewers treat it as the signature of remotely-hosted code, ` +
        `which is banned outright and is a common grounds for removal. If it is parsing JSON, use \`JSON.parse\`; if ` +
        `it is running user-authored logic, that logic has to ship in the package.`
      : `No \`eval\` or \`new Function\` call in the sampled extension source.${note}`,
    evidence: evalIn ?? undefined,
  });

  // innerHTML in a content script writes into a page the extension does not own.
  const usesInnerHtml = HTML_INJECTION_RE.test(code);
  const sanitises = HTML_SANITISER_RE.test(code);
  if (usesInnerHtml) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "ext_dom_injection",
      label: "DOM is built without unsanitised HTML injection",
      status: sanitises ? "WARN" : "FAIL",
      confidence: "MEDIUM",
      detail: sanitises
        ? `\`innerHTML\` is assigned and sanitisation appears nearby — confirm EVERY assignment that carries page or ` +
          `remote data goes through it, not just one.`
        : `\`innerHTML\` (or \`insertAdjacentHTML\`) is assigned with no sanitisation anywhere in the sampled source. ` +
          `In a content script this writes into a page the extension does not control, using data that often came ` +
          `FROM that page — so a hostile site can feed markup back and have it execute in a context the user trusts. ` +
          `Build nodes with \`createElement\` and set \`textContent\`, or sanitise explicitly.`,
    });
  }

  // Message handlers are reachable from any content script — and, if
  // externally_connectable is set, from web pages.
  if (MESSAGE_LISTENER_RE.test(code)) {
    const validates = SENDER_CHECK_RE.test(code);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "ext_message_sender_validation",
      label: "Message handlers validate the sender",
      status: validates ? "PASS" : "WARN",
      confidence: thin ? "LOW" : "MEDIUM",
      detail: validates
        ? `Message listeners inspect the \`sender\` — confirm every privileged handler does, not only one.`
        : `Message listeners do not reference \`sender\` anywhere in the sampled source. The ` +
          `background worker holds the extension's permissions, so an unvalidated handler is a privilege-escalation ` +
          `path: a content script on any matched page — or, with \`externally_connectable\`, a web page — can ask it ` +
          `to perform a privileged action. Check \`sender.id\` and \`sender.origin\` before acting.${note}`,
    });
  }

  // Tokens in chrome.storage.local persist unencrypted on disk. ⚠️ Decided per file, on an
  // actual storage WRITE whose object carries a token key: gorhill/uBlock was flagged for a
  // URL parameter named "auth-token" in one file and an unrelated chrome.storage.local in another.
  const tokenWrite = files.find((f) => TOKEN_STORAGE_WRITE_RE.test(f.text));
  if (tokenWrite) {
    const usesSession = /storage\.session/.test(source);
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "ext_token_storage",
      label: "Auth tokens are stored with appropriate lifetime",
      status: usesSession ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: usesSession
        ? `\`chrome.storage.session\` is in use — it is memory-backed and cleared when the browser closes, which is ` +
          `the right home for a short-lived token.`
        : `${tokenWrite.path} writes an auth token to \`chrome.storage.local\`/\`sync\`, which persist to disk ` +
          `unencrypted in the browser profile and — for \`sync\` — are replicated to every device signed into that ` +
          `Chrome profile. Anything with access to the profile directory can read them. Use ` +
          `\`chrome.storage.session\` for tokens, and prefer \`chrome.identity.getAuthToken\` so Chrome holds the ` +
          `credential rather than your extension.`,
      evidence: tokenWrite.path,
    });
  }

  return checks;
}

/** A storage.local/sync WRITE whose object literal carries a token key. */
export const TOKEN_STORAGE_WRITE_RE =
  /storage\.(local|sync)\.set\(\s*\{[^}]{0,200}(access|refresh|auth|bearer)[_-]?token/i;

// ── Web Store listing readiness ─────────────────────────────────────────────
function listingChecks(m: Record<string, unknown>): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Version string format. Chrome is strict, and a rejected version wastes a
  // review cycle rather than failing locally.
  const version = typeof m.version === "string" ? m.version : "";
  const validVersion = isValidExtensionVersion(version);
  checks.push({
    category: CATEGORIES.APP_STORE,
    checkKey: "ext_version_format",
    label: "Version string is in Chrome's required format",
    status: version ? (validVersion ? "PASS" : "FAIL") : "FAIL",
    confidence: "HIGH",
    detail: !version
      ? `No \`version\` in the manifest. It is required, and the Web Store rejects an upload without it.`
      : validVersion
        ? `Version \`${version}\` is a valid Chrome extension version.`
        : `Version \`${version}\` is not a valid Chrome extension version. Chrome allows one to four dot-separated ` +
          `integers between 0 and 65535, with no leading zeroes and no suffixes — so semver pre-release tags like ` +
          `\`1.0.0-beta.1\` are rejected at UPLOAD time, after you have already built and packaged. Keep a plain ` +
          `numeric version here and put the channel in \`version_name\`.`,
    evidence: version || undefined,
  });

  // A short_name is what actually renders in the constrained toolbar/menu space.
  // ⚠️ `__MSG_extName__` is a locale placeholder, not the name: its length says nothing
  // about what users see, and it is how most published extensions declare their name
  // (uBlock Origin Lite, Bitwarden, AdBlock all warned "15 characters" for it).
  const name = typeof m.name === "string" ? m.name : "";
  if (name.length > 12 && !name.startsWith("__MSG_")) {
    checks.push({
      category: CATEGORIES.STORE_LISTING,
      checkKey: "ext_short_name",
      label: "A short_name is declared for constrained UI",
      status: m.short_name ? "PASS" : "WARN",
      confidence: "HIGH",
      detail: m.short_name
        ? `\`short_name\` is declared for spaces the full name will not fit.`
        : `The extension name is ${name.length} characters and no \`short_name\` is declared. Chrome truncates the ` +
          `name in the extensions menu and the "Manage extensions" list, so users see a clipped fragment. Declare a ` +
          `\`short_name\` of 12 characters or fewer.`,
    });
  }

  return checks;
}
