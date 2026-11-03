import { describe, it, expect } from "vitest";
import { evaluateExtensionExtendedChecks } from "../chrome-extension-extended";
import type { RepoSnapshot } from "../native-mobile";
import type { PulseScanCheckInput } from "@/types/pulse";

function snap(files: Record<string, string>): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: Object.keys(files),
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}
const at = (checks: PulseScanCheckInput[], key: string) => {
  const c = checks.find((x) => x.checkKey === key);
  if (!c) throw new Error(`no check emitted for ${key}`);
  return c;
};

// Shapes taken from darkreader/darkreader (src/manifest.json + src/manifest-chrome-mv3.json, Oct 2026).
const darkreaderBase = JSON.stringify({
  manifest_version: 2,
  name: "Dark Reader",
  version: "4.9.133",
  icons: { "16": "icons/dr_16.png", "48": "icons/dr_48.png", "128": "icons/dr_128.png" },
  background: { persistent: true, page: "background/index.html" },
  content_scripts: [{ matches: ["<all_urls>"], js: ["inject/fallback.js", "inject/index.js"], run_at: "document_start" }],
  permissions: ["alarms", "fontSettings", "storage", "tabs", "<all_urls>"],
  optional_permissions: ["contextMenus"],
});
const darkreaderChrome = JSON.stringify({
  manifest_version: 3,
  minimum_chrome_version: "106.0.0.0",
  background: { service_worker: "background/index.js" },
  permissions: ["alarms", "fontSettings", "scripting", "storage"],
  host_permissions: ["*://*/*"],
});

function darkreader(extra: Record<string, string> = {}) {
  return snap({
    "src/manifest.json": darkreaderBase,
    "src/manifest-chrome-mv3.json": darkreaderChrome,
    "src/utils/links.ts": "export const HOMEPAGE_URL = 'https://darkreader.org';\nexport const PRIVACY_URL = 'https://darkreader.org/privacy/';\n",
    "src/inject/dynamic-theme/index.ts": "style.textContent = css;\n",
    "tests/inject/dynamic/fixes.tests.ts": "container.innerHTML = multiline('<style>p{color:red}</style>');\n",
    ...extra,
  });
}

describe("ext_x_innerhtml_injection ignores test fixtures", () => {
  it("PASSes when innerHTML only appears in tests/ (darkreader)", () => {
    expect(at(evaluateExtensionExtendedChecks(darkreader()), "ext_x_innerhtml_injection").status).toBe("PASS");
  });
  it("still FAILs innerHTML in shipped extension code", () => {
    const s = darkreader({ "src/ui/popup/render.ts": "root.innerHTML = '<div>' + tab.title + '</div>';\n" });
    const c = at(evaluateExtensionExtendedChecks(s), "ext_x_innerhtml_injection");
    expect(c.status).not.toBe("PASS");
  });
  it("ignores innerHTML in *.spec.ts files and __tests__ directories too", () => {
    const s = darkreader({
      "src/ui/popup/render.spec.ts": "root.innerHTML = '<b>x</b>';\n",
      "src/__tests__/popup.ts": "root.innerHTML = '<i>y</i>';\n",
    });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_innerhtml_injection").status).toBe("PASS");
  });
});

describe("ext_x_minimum_chrome_version reads the Chrome manifest variant", () => {
  it("PASSes when manifest-chrome-mv3.json declares it (darkreader)", () => {
    expect(at(evaluateExtensionExtendedChecks(darkreader()), "ext_x_minimum_chrome_version").status).toBe("PASS");
  });
  it("still WARNs when no manifest declares it", () => {
    const s = snap({
      "src/manifest.json": darkreaderBase,
      "src/manifest-firefox.json": JSON.stringify({ browser_specific_settings: { gecko: { id: "addon@darkreader.org" } } }),
    });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_minimum_chrome_version").status).toBe("WARN");
  });
});

describe("ext_x_privacy_policy recognises real policy links", () => {
  it("PASSes darkreader's PRIVACY_URL constant", () => {
    expect(at(evaluateExtensionExtendedChecks(darkreader()), "ext_x_privacy_policy").status).toBe("PASS");
  });
  it("PASSes a README privacy-policy link (uBlock)", () => {
    const s = snap({
      "platform/mv3/chromium/manifest.json": JSON.stringify({ manifest_version: 3, name: "uBO Lite", version: "2026.1012.1", host_permissions: ["<all_urls>"] }),
      "README.md": "[Privacy Policy][Privacy Policy]\n\n[Privacy Policy]: https://github.com/gorhill/uBlock/wiki/Privacy-policy\n",
    });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_privacy_policy").status).toBe("PASS");
  });
  // Audit 2026-10: the policy URL lives in the store dashboard, so not finding one in the repo
  // is INCONCLUSIVE ("could not establish"), never a WARN that implies there is none.
  it("is INCONCLUSIVE when only the chrome.privacy API and chrome:// settings URLs appear", () => {
    const s = snap({
      "manifest.json": JSON.stringify({ manifest_version: 3, name: "x", version: "1.0.0", permissions: ["cookies", "privacy"] }),
      "src/bg.ts": "chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: 'default' });\nchrome.tabs.create({ url: 'chrome://settings/privacy' });\n",
      "README.md": "# x\nBlocks trackers.\n",
    });
    const c = at(evaluateExtensionExtendedChecks(s), "ext_x_privacy_policy");
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.detail).toMatch(/could not be established/);
  });
  it("is INCONCLUSIVE when the only privacy URL is the chrome.privacy API reference page", () => {
    const s = snap({
      "manifest.json": JSON.stringify({ manifest_version: 3, name: "x", version: "1.0.0", permissions: ["cookies", "privacy"] }),
      "src/bg.ts": "// see https://developer.chrome.com/docs/extensions/reference/api/privacy\nchrome.privacy.websites.thirdPartyCookiesAllowed.set({ value: false });\n",
      "README.md": "Docs: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/privacy\n",
    });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_privacy_policy").status).toBe("INCONCLUSIVE");
  });
});

describe("ext_x_optional_permissions sees MV2 host access", () => {
  it("WARNs darkreader's <all_urls> in permissions with only an optional contextMenus", () => {
    const c = at(evaluateExtensionExtendedChecks(darkreader()), "ext_x_optional_permissions");
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toMatch(/requests no all-sites/);
    expect(c.detail).toMatch(/no optional host permissions/);
  });
  it("WARNs MV3 all-sites host access when the only optional permission is not a host (contextMenus)", () => {
    const s = snap({
      "manifest.json": JSON.stringify({ manifest_version: 3, name: "x", version: "1.0.0", host_permissions: ["https://*/*"], optional_permissions: ["contextMenus"] }),
    });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_optional_permissions").status).toBe("WARN");
  });
  it("still PASSes broad access paired with optional host permissions", () => {
    const s = snap({
      "manifest.json": JSON.stringify({ manifest_version: 3, name: "x", version: "1.0.0", host_permissions: ["https://example.com/*"], optional_host_permissions: ["*://*/*"] }),
    });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_optional_permissions").status).toBe("PASS");
    const s2 = snap({
      "manifest.json": JSON.stringify({ manifest_version: 3, name: "x", version: "1.0.0", host_permissions: ["<all_urls>"], optional_host_permissions: ["https://*/*"] }),
    });
    expect(at(evaluateExtensionExtendedChecks(s2), "ext_x_optional_permissions").status).toBe("PASS");
  });
  it("still PASSes a narrowly scoped extension", () => {
    const s = snap({
      "manifest.json": JSON.stringify({ manifest_version: 3, name: "x", version: "1.0.0", permissions: ["storage"], host_permissions: ["https://example.com/*"] }),
    });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_optional_permissions").status).toBe("PASS");
  });
});

describe("ext_x_icons_complete wording", () => {
  it("uBlock (16/32/64/128) WARNs about 48 without claiming the toolbar/store icon is blurred", () => {
    const s = snap({
      "platform/mv3/chromium/manifest.json": JSON.stringify({ manifest_version: 3, name: "uBO Lite", version: "2026.1012.1", icons: { "16": "img/icon_16.png", "32": "img/icon_32.png", "64": "img/icon_64.png", "128": "img/icon_128.png" } }),
    });
    const c = at(evaluateExtensionExtendedChecks(s), "ext_x_icons_complete");
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/48/);
    expect(c.detail).not.toMatch(/toolbar and store/);
    expect(c.detail).toMatch(/extensions management page/);
  });
  it("full set still PASSes", () => {
    expect(at(evaluateExtensionExtendedChecks(darkreader()), "ext_x_icons_complete").status).toBe("PASS");
  });
});

describe("ext_x_minimum_chrome_version ignores test fixtures (review)", () => {
  it("WARNs when only a fixture manifest declares it", () => {
    const s = snap({
      "src/manifest.json": darkreaderBase,
      "tests/fixtures/manifest.json": JSON.stringify({ manifest_version: 3, minimum_chrome_version: "100" }),
    });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_minimum_chrome_version").status).toBe("WARN");
  });
});
