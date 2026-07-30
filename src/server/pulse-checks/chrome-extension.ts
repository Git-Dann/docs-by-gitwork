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
import { isVendoredPath, stripCStyleComments } from "./native-mobile";

/** A parsed manifest, or null when the repo has none / it is unparseable. */
export interface ExtensionManifest {
  path: string;
  raw: string;
  json: Record<string, unknown> | null;
}

/**
 * Find the extension manifest.
 *
 * `manifest.json` is a crowded filename — a PWA web app manifest and a few build
 * tools use it too — so a file only counts when it actually carries the
 * `manifest_version` key that Chrome requires. That single test is what stops every
 * PWA in the world being scanned as an extension.
 */
export function findExtensionManifest(snapshot: RepoSnapshot): ExtensionManifest | null {
  for (const [path, text] of snapshot.files) {
    if (!/(^|\/)manifest\.json$/i.test(path)) continue;
    if (!/"manifest_version"\s*:/.test(text)) continue;
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = null; // Keep the raw text — a broken manifest is itself a finding.
    }
    return { path, raw: text, json };
  }
  return null;
}

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
};

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
  const hostPerms = [
    ...(Array.isArray(m.host_permissions) ? (m.host_permissions as string[]) : []),
    ...(Array.isArray(m.permissions) ? (m.permissions as string[]).filter((p) => /:\/\//.test(p)) : []),
  ];
  const contentScriptMatches = Array.isArray(m.content_scripts)
    ? (m.content_scripts as Array<{ matches?: string[] }>).flatMap((cs) => cs.matches ?? [])
    : [];
  const allHosts = [...hostPerms, ...contentScriptMatches];
  const wildcards = allHosts.filter((h) => /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*)$/i.test(h));

  if (allHosts.length > 0) {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "ext_host_permissions_scoped",
      label: "Host permissions scoped to the sites the extension needs",
      status: wildcards.length > 0 ? "FAIL" : "PASS",
      confidence: "HIGH",
      detail: wildcards.length > 0
        ? `The extension requests ${wildcards.join(", ")} — access to EVERY site the user visits. Chrome shows this as ` +
          `"Read and change all your data on all websites", which suppresses installs, and it is the most common ` +
          `reason a Web Store review is rejected or held for justification. It also means one compromised dependency ` +
          `in this extension can read every page the user opens, including their bank. List the specific origins ` +
          `instead, or request them at runtime with the optional_host_permissions + chrome.permissions.request flow.`
        : `Host access is scoped to ${allHosts.length} specific origin(s) rather than all sites.`,
      evidence: wildcards.length > 0 ? wildcards.join(", ") : `${allHosts.length} scoped origin(s)`,
    });
  }

  // ── High-risk API permissions ───────────────────────────────────────────────
  const perms = Array.isArray(m.permissions) ? (m.permissions as string[]) : [];
  const risky = perms.filter((p) => p in HIGH_RISK_PERMISSIONS);
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
  const unsafeEval = /unsafe-eval/i.test(csp);
  const unsafeInline = /unsafe-inline/i.test(csp);
  const remoteScriptInCsp = /script-src[^"]*https?:\/\//i.test(csp);

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
  if (updateUrl && !/^https:/i.test(updateUrl)) {
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
  if (missingListing.length > 0 || !icons) {
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

  checks.push(...surfaceChecks(m, snapshot));
  checks.push(...extensionCodeChecks(snapshot));
  checks.push(...listingChecks(m));

  return checks;
}

/** Every content-script source we managed to read, comments stripped. */
function extensionSource(snapshot: RepoSnapshot): { source: string; readCount: number; total: number } {
  const jsPaths = snapshot.paths.filter((p) => /\.(js|ts|mjs)$/i.test(p) && !isVendoredPath(p));
  const read: string[] = [];
  for (const [path, text] of snapshot.files) {
    if (/\.(js|ts|mjs)$/i.test(path) && !isVendoredPath(path)) read.push(text);
  }
  return { source: stripCStyleComments(read.join("\n")), readCount: read.length, total: jsPaths.length };
}

/** True when a match-pattern list reaches every site the user visits. */
export function isAllUrlsPattern(patterns: unknown): boolean {
  if (!Array.isArray(patterns)) return false;
  return patterns.some((p) => typeof p === "string" && /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*)$/.test(p));
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
          `becomes reachable from a hostile origin. Restrict the \`matches\` list to the sites that genuinely need ` +
          `the resource.`
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
  const hostPermissions = Array.isArray(m.host_permissions) ? (m.host_permissions as string[]) : [];
  if (isAllUrlsPattern(hostPermissions) && !permissions.includes("activeTab")) {
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
  const risky = permissions.filter((p) => p in HIGH_RISK_PERMISSIONS);
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
  const requiredSizes = [16, 48, 128].map(String);
  const missingIcons = requiredSizes.filter((s) => !icons[s]);
  checks.push({
    category: CATEGORIES.STORE_LISTING,
    checkKey: "ext_icons_complete",
    label: "All required icon sizes are declared",
    status: missingIcons.length === 0 ? "PASS" : "WARN",
    confidence: "HIGH",
    detail: missingIcons.length === 0
      ? `Icons declared at 16, 48 and 128px.`
      : `Missing icon size(s): ${missingIcons.join(", ")}px. Chrome uses 16 in the toolbar and page favicon, 48 in ` +
        `the extensions management page, and 128 on the Web Store listing and at install time — a missing size is ` +
        `either scaled badly or rendered as a blank placeholder, and 128 is required for submission.`,
    evidence: missingIcons.length > 0 ? `missing ${missingIcons.join(", ")}` : undefined,
  });

  // A repo with no build output referenced by the manifest is a packaging risk,
  // but only worth saying when we can actually see the tree.
  const declaredWorker = typeof background?.service_worker === "string" ? background.service_worker : null;
  if (declaredWorker) {
    const exists = snapshot.paths.some((p) => p.toLowerCase() === declaredWorker.toLowerCase());
    const built = /^(dist|build|out)\//i.test(declaredWorker);
    checks.push({
      category: CATEGORIES.CODE_QUALITY,
      checkKey: "ext_entrypoints_resolve",
      label: "Manifest entry points resolve to real files",
      status: exists || built ? "PASS" : "WARN",
      confidence: built ? "MEDIUM" : "HIGH",
      detail: exists
        ? `The declared service worker (\`${declaredWorker}\`) exists in the repository.`
        : built
          ? `The service worker points at build output (\`${declaredWorker}\`), which is not committed — expected for ` +
            `a bundled extension, so this cannot be verified from source alone.`
          : `The manifest declares \`${declaredWorker}\` as its service worker and no such file exists in the ` +
            `repository. Chrome refuses to load an extension whose entry point is missing, so if this is not produced ` +
            `by a build step the packaged extension is broken.`,
    });
  }

  return checks;
}

// ── What the extension's own code does ──────────────────────────────────────
function extensionCodeChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];
  const { source, readCount, total } = extensionSource(snapshot);
  if (readCount === 0) return checks;

  const coverage = total === 0 ? 0 : Math.min(1, readCount / total);
  const thin = coverage < 0.3;
  const note = thin
    ? ` (Based on ${Math.round(coverage * 100)}% of this extension's script files — below the threshold for a ` +
      `confident "not present anywhere", so this is inconclusive rather than a failure.)`
    : "";

  // eval / new Function in an extension context. Remotely-hosted code is banned
  // under MV3, and this is the usual way it slips back in.
  const usesEval = /\beval\s*\(|new\s+Function\s*\(/.test(source);
  checks.push({
    category: CATEGORIES.SECURITY,
    checkKey: "ext_no_eval",
    label: "No dynamic code execution",
    status: usesEval ? "FAIL" : "PASS",
    confidence: "HIGH",
    detail: usesEval
      ? `\`eval\` or \`new Function\` appears in extension source. Manifest V3's Content Security Policy forbids it — ` +
        `Chrome will throw at runtime — and reviewers treat it as the signature of remotely-hosted code, which is ` +
        `banned outright and is a common grounds for removal. If it is parsing JSON, use \`JSON.parse\`; if it is ` +
        `running user-authored logic, that logic has to ship in the package.`
      : `No \`eval\` or \`new Function\` in the sampled extension source.`,
  });

  // innerHTML in a content script writes into a page the extension does not own.
  const usesInnerHtml = /\.innerHTML\s*=|insertAdjacentHTML\s*\(|outerHTML\s*=/.test(source);
  const sanitises = /DOMPurify|sanitize|textContent\s*=/.test(source);
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
  if (/onMessage\.addListener/.test(source)) {
    const validates = /sender\.(id|origin|url|tab)/.test(source);
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey: "ext_message_sender_validation",
      label: "Message handlers validate the sender",
      status: validates ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: validates
        ? `Message listeners inspect the \`sender\` — confirm every privileged handler does, not only one.`
        : `\`onMessage.addListener\` handlers do not reference \`sender\` anywhere in the sampled source. The ` +
          `background worker holds the extension's permissions, so an unvalidated handler is a privilege-escalation ` +
          `path: a content script on any matched page — or, with \`externally_connectable\`, a web page — can ask it ` +
          `to perform a privileged action. Check \`sender.id\` and \`sender.origin\` before acting.${note}`,
      ...(thin ? { confidence: "LOW" as const } : {}),
    });
  }

  // Tokens in chrome.storage.local persist unencrypted on disk.
  const TOKEN_KEY = /['"][^'"]*(?:access|refresh|auth|bearer)[_-]?token[^'"]*['"]/i;
  if (/chrome\.storage\.(local|sync)/.test(source) && TOKEN_KEY.test(source)) {
    checks.push({
      category: CATEGORIES.SECRETS_KEYS,
      checkKey: "ext_token_storage",
      label: "Auth tokens are stored with appropriate lifetime",
      status: /chrome\.storage\.session/.test(source) ? "PASS" : "WARN",
      confidence: "MEDIUM",
      detail: /chrome\.storage\.session/.test(source)
        ? `\`chrome.storage.session\` is in use — it is memory-backed and cleared when the browser closes, which is ` +
          `the right home for a short-lived token.`
        : `Auth token keys appear alongside \`chrome.storage.local\`/\`sync\`, which persist to disk unencrypted in ` +
          `the browser profile and — for \`sync\` — are replicated to every device signed into that Chrome profile. ` +
          `Anything with access to the profile directory can read them. Use \`chrome.storage.session\` for tokens, ` +
          `and prefer \`chrome.identity.getAuthToken\` so Chrome holds the credential rather than your extension.`,
    });
  }

  return checks;
}

// ── Web Store listing readiness ─────────────────────────────────────────────
function listingChecks(m: Record<string, unknown>): PulseScanCheckInput[] {
  const checks: PulseScanCheckInput[] = [];

  // Version string format. Chrome is strict, and a rejected version wastes a
  // review cycle rather than failing locally.
  const version = typeof m.version === "string" ? m.version : "";
  const validVersion = /^\d{1,5}(\.\d{1,5}){0,3}$/.test(version) &&
    version.split(".").every((part) => part === "0" || !part.startsWith("0"));
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
  const name = typeof m.name === "string" ? m.name : "";
  if (name.length > 12) {
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
