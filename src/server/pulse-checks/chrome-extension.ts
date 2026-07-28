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

  return checks;
}
