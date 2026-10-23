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
import {
  EXTENSION_SOUND_COVERAGE,
  HTML_INJECTION_RE,
  HTML_SANITISER_RE,
  MESSAGE_LISTENER_RE,
  SENDER_CHECK_RE,
  declaredMinimumChromeVersion,
  extensionSourceFiles,
  findDynamicEval,
  findExtensionManifest,
  installHostPatterns,
  isAllUrlsPattern,
  isValidExtensionVersion,
  missingIconSizes,
  resolveServiceWorker,
  stripJsCommentsAndStrings,
  type ExtensionManifest,
  type ExtensionSourceFile,
} from "./chrome-extension";

/**
 * ⚠️ Everything here reads the SAME judged manifest and the SAME shipped-source set as
 * chrome-extension.ts (findExtensionManifest / extensionSourceFiles). The two families
 * used to pick their own manifest by Map order and build their own uncommented source
 * blob, so a comment in uBlock ("JS eval() ...") failed one family's eval check while the
 * other passed — and ~6 checks that ask the same question could contradict each other.
 */
interface Ctx {
  found: ExtensionManifest | null;
  manifest: Record<string, unknown> | null;
  manifestText: string;
  files: ExtensionSourceFile[];
  /** Comment-stripped shipped source, strings kept. */
  source: string;
  /** Comments and string contents stripped — for identifier-level questions. */
  code: string;
  coverage: number;
  paths: string[];
}

function buildCtx(snapshot: RepoSnapshot): Ctx {
  const found = findExtensionManifest(snapshot);
  const { files, coverage } = extensionSourceFiles(snapshot);
  return {
    found,
    manifest: found?.json ?? null,
    manifestText: found?.raw ?? "",
    files,
    source: files.map((f) => f.text).join("\n"),
    code: files.map((f) => f.code).join("\n"),
    coverage,
    paths: snapshot.paths,
  };
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

  // Absence findings rest on the shipped scripts we actually read. Below the sound-coverage
  // threshold a "not found" PASS/SKIPPED is LOW confidence, never a confident all-clear.
  const thin = ctx.coverage < EXTENSION_SOUND_COVERAGE;
  const thinNote = thin
    ? ` (Based on ${Math.round(ctx.coverage * 100)}% of this extension's script files, so "not found" is not a ` +
      `confident answer.)`
    : "";

  const add = (
    checkKey: string,
    label: string,
    status: PulseScanCheckInput["status"],
    detail: string,
    confidence: PulseScanCheckInput["confidence"] = "HIGH",
    evidence?: string,
  ) => {
    checks.push({
      category: CATEGORIES.SECURITY,
      checkKey,
      label,
      status,
      confidence,
      detail,
      ...(evidence ? { evidence } : {}),
    });
  };
  /** For a verdict derived from NOT finding something in sampled source. */
  const absence = (checkKey: string, label: string, status: PulseScanCheckInput["status"], detail: string) =>
    add(checkKey, label, status, thin ? detail + thinNote : detail, thin ? "LOW" : "HIGH");

  if (!ctx.manifestText || !ctx.found) {
    for (const [key, label] of CATALOGUE) {
      add(key, label, "SKIPPED", "No extension manifest was found, so the extended extension family did not run.");
    }
    return checks;
  }

  const m = ctx.manifest ?? {};
  const permissions = Array.isArray(m.permissions) ? (m.permissions as string[]) : [];
  const hostPermissions = installHostPatterns(m);
  const optional = Array.isArray(m.optional_permissions) ? (m.optional_permissions as string[]) : [];
  const optionalHosts = Array.isArray(m.optional_host_permissions)
    ? (m.optional_host_permissions as string[])
    : [];

  // ── Messaging ──────────────────────────────────────────────────────────────
  const listens = MESSAGE_LISTENER_RE.test(ctx.code);
  const checksSender = SENDER_CHECK_RE.test(ctx.code);
  const senderLabel = "Messages from content scripts verify their sender";
  if (!listens) {
    absence("ext_x_message_sender_check", senderLabel, "SKIPPED", "The extension registers no message listeners.");
  } else {
    add(
      "ext_x_message_sender_check",
      senderLabel,
      checksSender ? "PASS" : "WARN",
      checksSender
        ? "Message handlers inspect the sender before acting."
        : "Message listeners act on messages without checking `sender`. A content script runs in the page, so any " +
          "script on that page can post to it — meaning a hostile page can drive whatever privileged action the " +
          "background worker performs on the content script's behalf." + thinNote,
      thin ? "LOW" : "MEDIUM",
    );
  }

  const externallyConnectable = m.externally_connectable as { matches?: string[] } | undefined;
  const extMatches = externallyConnectable?.matches ?? [];
  const wildcardExternal = isAllUrlsPattern(extMatches);
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
  // API documentation links (chrome.privacy / browser.privacy reference pages) are not a policy.
  const policyRe =
    /privacy[\s_-]?(policy|url)|privacyPolicy|https?:\/\/(?!developer\.chrome\.com|developer\.mozilla\.org)[^\s'"`)]*\/privacy(?:[-_/.#?]|\b)/i;
  // ⚠️ A policy FILE is named for one. `/privacy/i` over every path passed uBOL-home on
  // rulesets/main/easyprivacy.json — a filter list, not a policy.
  const policyFile = ctx.paths.find((p) => /(^|\/)privacy[-_ ]?(policy)?\.(md|html?)$/i.test(p));
  const hasPolicy = Boolean(policyFile) || policyRe.test(ctx.manifestText + ctx.source) ||
    [...snapshot.files].some(([p, t]) => /\.(md|html?)$/i.test(p) && policyRe.test(t));
  add(
    "ext_x_privacy_policy",
    "A privacy policy is declared when user data is handled",
    // The policy URL lives in the Web Store developer dashboard, not the repo — so not finding
    // one here is "could not establish", never "there is none".
    !handlesUserData ? "SKIPPED" : hasPolicy ? "PASS" : "INCONCLUSIVE",
    !handlesUserData
      ? "The extension requests no permissions that access user data, so a privacy policy is not required."
      : hasPolicy
        ? `A privacy policy is present alongside the data-accessing permissions${policyFile ? ` (${policyFile})` : ""}.`
        : `The extension requests data-accessing permissions (${permissions
            .filter((p) => sensitivePerms.includes(p))
            .concat(hostPermissions)
            .slice(0, 4)
            .join(", ")}) and no privacy policy was found in the repository. The policy URL is set in the store's ` +
          "developer dashboard, which a source scan cannot see, so this could not be established either way. " +
          "Confirm one is posted there — the Chrome Web Store requires a posted privacy policy for any extension " +
          "handling personal or sensitive user data.",
    hasPolicy ? "MEDIUM" : "LOW",
  );

  // MV2 manifests put host patterns in `permissions`; http(s)://*/* is all-sites too.
  const broadHosts = hostPermissions.filter((h) => isAllUrlsPattern([h]));
  // Only optional HOST access moves broad access to runtime; an optional `contextMenus` does not.
  const optionalHostAccess = optionalHosts.length + optional.filter((p) => /<all_urls>|:\/\//.test(p)).length;
  add(
    "ext_x_optional_permissions",
    "Broad permissions are requested at runtime rather than at install",
    broadHosts.length === 0 ? "PASS" : optionalHostAccess > 0 ? "PASS" : "WARN",
    broadHosts.length === 0
      ? "The extension requests no all-sites host permission at install time."
      : optionalHostAccess > 0
        ? "Broad access is requested, but the extension also declares optional host permissions, so at least some " +
          "site access is asked for in context."
        : "The extension requests access to all sites at install time with no optional host permissions. Chrome shows " +
          "that as 'Read and change all your data on all websites', which is the single largest cause of install " +
          "abandonment — and store review asks for a justification that a narrower scope would avoid entirely.",
  );

  const contentScripts = Array.isArray(m.content_scripts) ? (m.content_scripts as { matches?: string[] }[]) : [];
  // Same rule as ext_content_script_scope — the old regex here missed http://*/* and https://*/*.
  const broadContent = contentScripts.some((cs) => isAllUrlsPattern(cs.matches));
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
  const syncLabel = "Synced storage is used within its quota";
  const usesSync = /storage\.sync/.test(ctx.code);
  const largeWrites = /storage\.sync\.set\([^)]*JSON\.stringify/.test(ctx.source);
  if (!usesSync) {
    absence("ext_x_storage_sync_size", syncLabel, "SKIPPED", "The extension does not use chrome.storage.sync.");
  } else {
    add(
      "ext_x_storage_sync_size",
      syncLabel,
      largeWrites ? "WARN" : "PASS",
      largeWrites
        ? "A serialised object is written to storage.sync. That area has a hard 8KB-per-item and 100KB-total quota " +
          "plus a write-rate limit; exceeding either fails the write, and the common pattern is to ignore the " +
          "returned error — so the user's settings silently stop saving. Use storage.local for anything sizeable."
        : "storage.sync is used for small values.",
      largeWrites ? "MEDIUM" : thin ? "LOW" : "MEDIUM",
    );
  }

  // Same rule as ext_no_eval: a real call, strings and comments stripped.
  const evalIn = findDynamicEval(ctx.files);
  const evalLabel = "Content scripts do not evaluate strings as code";
  if (evalIn) {
    add(
      "ext_x_no_eval_in_content",
      evalLabel,
      "FAIL",
      `The extension evaluates strings as code (${evalIn}). Manifest V3's content security policy forbids this for ` +
        "extension pages, so it is both a review rejection and — in a content script, which runs with access to the " +
        "page and the extension's messaging — a direct injection route.",
      "HIGH",
      evalIn,
    );
  } else {
    absence("ext_x_no_eval_in_content", evalLabel, "PASS", "No runtime code evaluation was found.");
  }

  // Same rule as ext_dom_injection.
  const innerHtml = HTML_INJECTION_RE.test(ctx.code);
  const sanitised = HTML_SANITISER_RE.test(ctx.code);
  const htmlLabel = "Extension UI is not built by injecting HTML strings";
  if (!innerHtml) {
    absence("ext_x_innerhtml_injection", htmlLabel, "PASS", "The extension builds its UI without assigning HTML strings.");
  } else {
    add(
      "ext_x_innerhtml_injection",
      htmlLabel,
      sanitised ? "WARN" : "FAIL",
      sanitised
        ? "HTML is assigned but a sanitiser is present. Confirm it covers every assignment — the risk is any path " +
          "where page content reaches the extension's own DOM."
        : "The extension assigns innerHTML with no sanitiser. Content scripts read from the host page, so page " +
          "content flows into the extension's DOM — and script that runs there has the extension's privileges, not " +
          "the page's. This is the standard route from a hostile page to extension compromise.",
      "MEDIUM",
    );
  }

  // ⚠️ Decided from the JUDGED manifest's permissions. A comment elsewhere in uBlock mentioning
  // declarativeNetRequest passed an MV2 manifest that requests webRequestBlocking and no DNR.
  // Source is consulted only when the manifest says nothing either way, and only as code.
  const usesWebRequest = permissions.includes("webRequest") || permissions.includes("webRequestBlocking");
  const manifestDnr = permissions.some((p) => /^declarativeNetRequest/.test(p)) || "declarative_net_request" in m;
  const usesDnr = manifestDnr ||
    (!usesWebRequest && ctx.files.some((f) => /declarativeNetRequest\s*\.\s*\w+\s*\(/.test(f.code)));
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

  // Read the WORKER file, not the whole repo: module-level state in a popup or options
  // page is harmless, and a repo-wide match said nothing about the worker.
  const lifetimeLabel = "The service worker does not assume it stays alive";
  const background = m.background as Record<string, unknown> | undefined;
  const declaredWorker = typeof background?.service_worker === "string" ? background.service_worker : null;
  if ((m.manifest_version as number) !== 3) {
    add("ext_x_service_worker_lifetime", lifetimeLabel, "SKIPPED",
      "This is a Manifest V2 extension with a persistent background page, so worker lifetime does not apply.");
  } else if (!declaredWorker) {
    add("ext_x_service_worker_lifetime", lifetimeLabel, "SKIPPED", "The manifest declares no background service worker.");
  } else {
    const resolved = resolveServiceWorker(snapshot, ctx.found.path, declaredWorker);
    const workerText = resolved.path ? snapshot.files.get(resolved.path) : undefined;
    if (workerText === undefined) {
      add("ext_x_service_worker_lifetime", lifetimeLabel, "INCONCLUSIVE",
        `The service worker (\`${declaredWorker}\`) or its source was not read, so whether it holds state in ` +
        "module-level variables could not be established.", "LOW");
    } else {
      const workerCode = stripJsCommentsAndStrings(workerText);
      const swGlobals = /^(?:const|let|var)\s+\w+\s*=\s*(?:\[\]|\{\}|new Map)/m.test(workerCode);
      const usesAlarms = /chrome\.alarms|storage\.(local|session)\.set/.test(workerText);
      add(
        "ext_x_service_worker_lifetime",
        lifetimeLabel,
        !swGlobals ? "PASS" : usesAlarms ? "PASS" : "WARN",
        !swGlobals
          ? `No module-level mutable state was found in the worker (${resolved.path}). Modules it imports were not ` +
            "inspected."
          : usesAlarms
            ? "Module-level state exists but the worker also persists to storage or uses alarms, so it survives a " +
              "worker restart."
            : `The service worker (${resolved.path}) holds state in module-level variables with no persistence. ` +
              "Manifest V3 terminates the worker after roughly 30 seconds of inactivity and restarts it on the next " +
              "event, so that state is silently lost — which presents as an extension that 'forgets' things after a " +
              "few minutes idle and is very hard to reproduce while actively testing.",
        "MEDIUM",
        resolved.path,
      );
    }
  }

  // Same rule as ext_version_format (leading zeros and the 65535 cap included).
  const version = typeof m.version === "string" ? m.version : "";
  const validVersion = isValidExtensionVersion(version);
  add(
    "ext_x_version_scheme",
    "The version is a valid store version string",
    !version ? "FAIL" : validVersion ? "PASS" : "FAIL",
    !version
      ? "The manifest declares no version, which the store requires."
      : validVersion
        ? `Version "${version}" matches the store's required format.`
        : `Version "${version}" is not a valid extension version. The store requires one to four dot-separated ` +
          "integers between 0 and 65535 — no pre-release suffixes, no leading zeros — and rejects the upload " +
          "outright rather than warning.",
  );

  const iconSizes = Object.keys((m.icons ?? {}) as Record<string, string>);
  const required = missingIconSizes(m);
  add(
    "ext_x_icons_complete",
    "The full icon set is declared",
    iconSizes.length === 0 ? "WARN" : required.length === 0 ? "PASS" : "WARN",
    iconSizes.length === 0
      ? "No icons are declared. Chrome then renders a generic placeholder in the toolbar, the extensions page and " +
        "the store listing."
      : required.length === 0
        ? "All required icon sizes are declared."
        : `Icon sizes ${required.join(", ")} are missing. Chrome uses 16px for the favicon and context menus, 48px ` +
          "on the extensions management page and 128px at install and in the Web Store; for a missing size it scales " +
          "the nearest declared icon, which can look soft.",
  );

  // Shared with ext_minimum_chrome_version: the judged manifest, or a Chrome variant merged over it.
  const minVersion = declaredMinimumChromeVersion(snapshot, ctx.found);
  add(
    "ext_x_minimum_chrome_version",
    "A minimum browser version is declared",
    minVersion ? "PASS" : "WARN",
    minVersion
      ? `The Chrome build declares minimum_chrome_version ${minVersion.value} (${minVersion.from}), so users on older ` +
        "builds are not offered an install that will not work."
      : "No minimum_chrome_version is declared. Users on an older browser can install the extension and hit a " +
        "silent failure on whichever API is missing, which arrives as a one-star review rather than as a bug report.",
    minVersion && minVersion.from !== ctx.found.path ? "MEDIUM" : "HIGH",
  );

  return checks;
}
