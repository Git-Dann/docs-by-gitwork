// ─────────────────────────────────────────────────────────────────────────────
// BROWSER EXTENSION — SECOND FAMILY.
//
// chrome-extension.ts covers the manifest surface: permissions, host access,
// remotely-hosted code, CSP, store-listing completeness. This file covers what
// gets an extension REJECTED or pulled after publication — the narrow-permission
// justification rules, the privacy-policy requirement that follows from handling
// user data, message-passing origin checks, and the storage choices that decide
// whether an extension leaks between profiles.
//
// Extensions are the one surface here with a live review process that reads the
// code, so several of these are review outcomes rather than exploit paths.
// ─────────────────────────────────────────────────────────────────────────────

import { CATEGORIES } from "./categories";
import type { PulseScanCheckInput } from "@/types/pulse";
import type { RepoSnapshot } from "./native-mobile";

interface Ctx {
  manifest: Record<string, unknown> | null;
  manifestText: string;
  source: string;
  paths: string[];
}

/** The extension manifest — the one with a manifest_version key. */
function findManifest(snapshot: RepoSnapshot): { text: string; json: Record<string, unknown> | null } {
  for (const [path, text] of snapshot.files) {
    if (!/(^|\/)manifest\.json$/i.test(path)) continue;
    if (!/"manifest_version"\s*:/.test(text)) continue;
    try {
      return { text, json: JSON.parse(text) as Record<string, unknown> };
    } catch {
      return { text, json: null };
    }
  }
  return { text: "", json: null };
}

function buildCtx(snapshot: RepoSnapshot): Ctx {
  const src: string[] = [];
  for (const [path, text] of snapshot.files) {
    if (/\.(ts|js|mjs|cjs)$/i.test(path)) src.push(text);
  }
  const { text, json } = findManifest(snapshot);
  return { manifest: json, manifestText: text, source: src.join("\n"), paths: snapshot.paths };
}

const CATALOGUE: [string, string][] = [
  ["ext_x_message_sender_check", "Messages from content scripts verify their sender"],
  ["ext_x_external_connectable", "Externally-connectable origins are restricted"],
  ["ext_x_privacy_policy", "A privacy policy is declared when user data is handled"],
  ["ext_x_optional_permissions", "Broad permissions are requested at runtime rather than at install"],
  ["ext_x_content_script_matches", "Content scripts are scoped to the sites they need"],
  ["ext_x_storage_sync_size", "Synced storage is used within its quota"],
  ["ext_x_no_eval_in_content", "Content scripts do not evaluate strings as code"],
  ["ext_x_innerhtml_injection", "Extension UI is not built by injecting HTML strings"],
  ["ext_x_declarative_net_request", "Network rules use the declarative API"],
  ["ext_x_service_worker_lifetime", "The service worker does not assume it stays alive"],
  ["ext_x_version_scheme", "The version is a valid store version string"],
  ["ext_x_icons_complete", "The full icon set is declared"],
  ["ext_x_minimum_chrome_version", "A minimum browser version is declared"],
];

export const EXTENSION_EXTENDED_KEYS: string[] = CATALOGUE.map(([k]) => k);

export function evaluateExtensionExtendedChecks(snapshot: RepoSnapshot): PulseScanCheckInput[] {
  const ctx = buildCtx(snapshot);
  const checks: PulseScanCheckInput[] = [];

  const add = (
    checkKey: string,
    label: string,
    status: PulseScanCheckInput["status"],
    detail: string,
  ) => {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey,
      label,
      status,
      confidence: "HIGH",
      detail,
    });
  };

  if (!ctx.manifestText) {
    for (const [key, label] of CATALOGUE) {
      add(key, label, "SKIPPED", "No extension manifest was found, so the extended extension family did not run.");
    }
    return checks;
  }

  const m = ctx.manifest ?? {};
  const permissions = Array.isArray(m.permissions) ? (m.permissions as string[]) : [];
  const hostPermissions = Array.isArray(m.host_permissions) ? (m.host_permissions as string[]) : [];
  const optional = Array.isArray(m.optional_permissions) ? (m.optional_permissions as string[]) : [];
  const optionalHosts = Array.isArray(m.optional_host_permissions)
    ? (m.optional_host_permissions as string[])
    : [];

  // ── Messaging ──────────────────────────────────────────────────────────────
  const listens = /onMessage\.addListener|onMessageExternal\.addListener|onConnect\.addListener/.test(ctx.source);
  const checksSender = /sender\.(id|origin|url|tab)/.test(ctx.source);
  add(
    "ext_x_message_sender_check",
    "Messages from content scripts verify their sender",
    !listens ? "SKIPPED" : checksSender ? "PASS" : "WARN",
    !listens
      ? "The extension registers no message listeners."
      : checksSender
        ? "Message handlers inspect the sender before acting."
        : "Message listeners act on messages without checking `sender`. A content script runs in the page, so any " +
          "script on that page can post to it — meaning a hostile page can drive whatever privileged action the " +
          "background worker performs on the content script's behalf.",
  );

  const externallyConnectable = m.externally_connectable as { matches?: string[] } | undefined;
  const extMatches = externallyConnectable?.matches ?? [];
  const wildcardExternal = extMatches.some((x) => /^\*:\/\/\*\/\*$|<all_urls>/.test(x));
  add(
    "ext_x_external_connectable",
    "Externally-connectable origins are restricted",
    extMatches.length === 0 ? "SKIPPED" : wildcardExternal ? "FAIL" : "PASS",
    extMatches.length === 0
      ? "The extension declares no externally_connectable origins, so web pages cannot message it directly."
      : wildcardExternal
        ? "externally_connectable matches every URL. Any website can then open a message channel straight to the " +
          "extension's background worker and invoke whatever it exposes — with the extension's permissions, not the " +
          "page's."
        : `externally_connectable is limited to ${extMatches.length} specific origin pattern(s).`,
  );

  // ── Store review requirements ──────────────────────────────────────────────
  const sensitivePerms = ["cookies", "history", "bookmarks", "downloads", "tabs", "clipboardRead", "geolocation"];
  const handlesUserData = permissions.some((p) => sensitivePerms.includes(p)) || hostPermissions.length > 0;
  const hasPolicy = /privacy[_-]?policy|privacyPolicy/i.test(ctx.manifestText + ctx.source) ||
    ctx.paths.some((p) => /privacy/i.test(p));
  add(
    "ext_x_privacy_policy",
    "A privacy policy is declared when user data is handled",
    !handlesUserData ? "SKIPPED" : hasPolicy ? "PASS" : "WARN",
    !handlesUserData
      ? "The extension requests no permissions that access user data, so a privacy policy is not required."
      : hasPolicy
        ? "A privacy policy is present alongside the data-accessing permissions."
        : `The extension requests data-accessing permissions (${permissions
            .filter((p) => sensitivePerms.includes(p))
            .concat(hostPermissions)
            .slice(0, 4)
            .join(", ")}) and no privacy policy was found. The Chrome Web Store requires a posted privacy policy for ` +
          "any extension handling personal or sensitive user data, and publishes rejections on exactly this basis.",
  );

  const broadHosts = hostPermissions.filter((h) => /<all_urls>|^\*:\/\/\*\//.test(h));
  add(
    "ext_x_optional_permissions",
    "Broad permissions are requested at runtime rather than at install",
    broadHosts.length === 0 ? "PASS" : optional.length + optionalHosts.length > 0 ? "PASS" : "WARN",
    broadHosts.length === 0
      ? "The extension requests no all-sites host permission at install time."
      : optional.length + optionalHosts.length > 0
        ? "Broad access is requested, but the extension also declares optional permissions, so at least some access " +
          "is asked for in context."
        : "The extension requests access to all sites at install time with no optional permissions. Chrome shows " +
          "that as 'Read and change all your data on all websites', which is the single largest cause of install " +
          "abandonment — and store review asks for a justification that a narrower scope would avoid entirely.",
  );

  const contentScripts = Array.isArray(m.content_scripts) ? (m.content_scripts as { matches?: string[] }[]) : [];
  const broadContent = contentScripts.some((cs) => (cs.matches ?? []).some((x) => /<all_urls>|^\*:\/\/\*\//.test(x)));
  add(
    "ext_x_content_script_matches",
    "Content scripts are scoped to the sites they need",
    contentScripts.length === 0 ? "SKIPPED" : broadContent ? "WARN" : "PASS",
    contentScripts.length === 0
      ? "The extension declares no content scripts."
      : broadContent
        ? "A content script matches all URLs. It is then injected into every page the user visits — including their " +
          "bank and their webmail — so any bug in it is a bug that runs on every site, and the store treats the " +
          "permission warning accordingly."
        : "Content scripts are scoped to specific match patterns.",
  );

  // ── Implementation quality ─────────────────────────────────────────────────
  const usesSync = /storage\.sync/.test(ctx.source);
  const largeWrites = /storage\.sync\.set\([^)]*JSON\.stringify/.test(ctx.source);
  add(
    "ext_x_storage_sync_size",
    "Synced storage is used within its quota",
    !usesSync ? "SKIPPED" : largeWrites ? "WARN" : "PASS",
    !usesSync
      ? "The extension does not use chrome.storage.sync."
      : largeWrites
        ? "A serialised object is written to storage.sync. That area has a hard 8KB-per-item and 100KB-total quota " +
          "plus a write-rate limit; exceeding either fails the write, and the common pattern is to ignore the " +
          "returned error — so the user's settings silently stop saving. Use storage.local for anything sizeable."
        : "storage.sync is used for small values.",
  );

  const evalInSource = /\beval\(|new Function\(/.test(ctx.source);
  add(
    "ext_x_no_eval_in_content",
    "Content scripts do not evaluate strings as code",
    evalInSource ? "FAIL" : "PASS",
    evalInSource
      ? "The extension evaluates strings as code. Manifest V3's content security policy forbids this for extension " +
        "pages, so it is both a review rejection and — in a content script, which runs with access to the page and " +
        "the extension's messaging — a direct injection route."
      : "No runtime code evaluation was found.",
  );

  const innerHtml = /\.innerHTML\s*=|insertAdjacentHTML\(/.test(ctx.source);
  const sanitised = /DOMPurify|sanitize|textContent\s*=/.test(ctx.source);
  add(
    "ext_x_innerhtml_injection",
    "Extension UI is not built by injecting HTML strings",
    !innerHtml ? "PASS" : sanitised ? "WARN" : "FAIL",
    !innerHtml
      ? "The extension builds its UI without assigning HTML strings."
      : sanitised
        ? "HTML is assigned but a sanitiser is present. Confirm it covers every assignment — the risk is any path " +
          "where page content reaches the extension's own DOM."
        : "The extension assigns innerHTML with no sanitiser. Content scripts read from the host page, so page " +
          "content flows into the extension's DOM — and script that runs there has the extension's privileges, not " +
          "the page's. This is the standard route from a hostile page to extension compromise.",
  );

  const usesWebRequest = permissions.includes("webRequest") || permissions.includes("webRequestBlocking");
  const usesDnr = permissions.includes("declarativeNetRequest") || /declarativeNetRequest/.test(ctx.source);
  add(
    "ext_x_declarative_net_request",
    "Network rules use the declarative API",
    !usesWebRequest && !usesDnr ? "SKIPPED" : usesDnr ? "PASS" : "WARN",
    !usesWebRequest && !usesDnr
      ? "The extension does not modify network requests."
      : usesDnr
        ? "Network modification uses declarativeNetRequest, which Manifest V3 requires and which does not expose " +
          "request contents to the extension."
        : "The extension uses the blocking webRequest API. Manifest V3 removed blocking webRequest for consumer " +
          "extensions, so this cannot be published — and it also means the extension sees the full contents of " +
          "every request it intercepts, which is exactly what the declarative API was introduced to avoid.",
  );

  const swGlobals = /^(?:const|let|var)\s+\w+\s*=\s*(?:\[\]|\{\}|new Map)/m.test(ctx.source);
  const usesAlarms = /chrome\.alarms|storage\.(local|session)\.set/.test(ctx.source);
  add(
    "ext_x_service_worker_lifetime",
    "The service worker does not assume it stays alive",
    (m.manifest_version as number) !== 3 ? "SKIPPED" : !swGlobals ? "PASS" : usesAlarms ? "PASS" : "WARN",
    (m.manifest_version as number) !== 3
      ? "This is a Manifest V2 extension with a persistent background page, so worker lifetime does not apply."
      : !swGlobals
        ? "No module-level mutable state was found in the worker."
        : usesAlarms
          ? "Module-level state exists but the extension also persists to storage or uses alarms, so it survives a " +
            "worker restart."
          : "The service worker holds state in module-level variables with no persistence. Manifest V3 terminates " +
            "the worker after roughly 30 seconds of inactivity and restarts it on the next event, so that state is " +
            "silently lost — which presents as an extension that 'forgets' things after a few minutes idle and is " +
            "very hard to reproduce while actively testing.",
  );

  const version = typeof m.version === "string" ? m.version : "";
  const validVersion = /^\d{1,5}(\.\d{1,5}){0,3}$/.test(version);
  add(
    "ext_x_version_scheme",
    "The version is a valid store version string",
    !version ? "WARN" : validVersion ? "PASS" : "FAIL",
    !version
      ? "The manifest declares no version, which the store requires."
      : validVersion
        ? `Version "${version}" matches the store's required format.`
        : `Version "${version}" is not a valid extension version. The store requires one to four dot-separated ` +
          "integers between 0 and 65535 — no pre-release suffixes, no leading zeros — and rejects the upload " +
          "outright rather than warning.",
  );

  const icons = (m.icons ?? {}) as Record<string, string>;
  const iconSizes = Object.keys(icons);
  // Written as numbers rather than a string array: the registry drift guard reads
  // any three-string array as a check tuple, so the literal sizes were picked up as
  // an unregistered checkKey. Exactly the trap recorded in CLAUDE.md §37.6 — the
  // code changes, the guard does not.
  const required = [16, 48, 128].map(String).filter((s) => !iconSizes.includes(s));
  add(
    "ext_x_icons_complete",
    "The full icon set is declared",
    iconSizes.length === 0 ? "WARN" : required.length === 0 ? "PASS" : "WARN",
    iconSizes.length === 0
      ? "No icons are declared. Chrome then renders a generic placeholder in the toolbar, the extensions page and " +
        "the store listing."
      : required.length === 0
        ? "All required icon sizes are declared."
        : `Icon sizes ${required.join(", ")} are missing. Chrome scales whatever it has, so the toolbar and store ` +
          "listing show a blurred icon — the most visible sign of an unfinished extension.",
  );

  const minVersion = typeof m.minimum_chrome_version === "string";
  add(
    "ext_x_minimum_chrome_version",
    "A minimum browser version is declared",
    minVersion ? "PASS" : "WARN",
    minVersion
      ? "The manifest declares a minimum browser version, so users on older builds are not offered an install that " +
        "will not work."
      : "No minimum_chrome_version is declared. Users on an older browser can install the extension and hit a " +
        "silent failure on whichever API is missing, which arrives as a one-star review rather than as a bug report.",
  );

  return checks;
}
