import { describe, expect, it } from "vitest";
import { evaluateExtensionManifest } from "@/server/pulse-checks/chrome-extension";

// Shapes taken from the published manifests (CRX downloads, Oct 2026).
const reactDevtools = {
  manifest_version: 3,
  name: "React Developer Tools",
  version: "8.0.0",
  minimum_chrome_version: "114",
  permissions: ["scripting", "storage", "tabs"],
  optional_permissions: ["clipboardWrite"],
  host_permissions: ["<all_urls>"],
  content_scripts: [{ matches: ["<all_urls>"], js: ["build/prepareInjection.js"] }],
};

const lastpass = {
  manifest_version: 3,
  name: "LastPass",
  version: "4.156.0",
  permissions: ["scripting", "tabs", "notifications", "contextMenus", "storage", "unlimitedStorage", "webNavigation", "webRequest", "webRequestAuthProvider", "offscreen", "alarms", "cookies", "declarativeNetRequest"],
  optional_permissions: ["privacy", "clipboardWrite"],
  host_permissions: ["http://*/*", "https://*/*"],
};

const scoped = {
  manifest_version: 3,
  name: "Scoped",
  version: "1.0.0",
  minimum_chrome_version: "120",
  permissions: ["storage"],
  host_permissions: ["https://example.com/*"],
};

function find(checks: ReturnType<typeof evaluateExtensionManifest>, key: string) {
  return checks.find((c) => c.checkKey === key);
}

describe("ext_host_permissions_scoped wording", () => {
  it("store surface: a complete conditional sentence, no dangling 'if this one does not,'", () => {
    const c = find(evaluateExtensionManifest(reactDevtools, "store"), "ext_host_permissions_scoped")!;
    expect(c.status).toBe("WARN");
    expect(c.evidence).toBe("<all_urls>");
    expect(c.detail).not.toMatch(/does not, It/);
    expect(c.detail).toContain("If this extension does not need every site, list the specific origins instead");
    expect(c.detail).toContain("one compromised dependency");
  });

  it("repo surface: still FAIL with the review-rejection wording and unconditional advice", () => {
    const c = find(evaluateExtensionManifest(reactDevtools, "repo"), "ext_host_permissions_scoped")!;
    expect(c.status).toBe("FAIL");
    expect(c.detail).toContain("most common reason a Web Store review is rejected");
    expect(c.detail).toContain("List the specific origins instead");
  });

  it("scoped hosts still PASS", () => {
    const c = find(evaluateExtensionManifest(scoped, "store"), "ext_host_permissions_scoped")!;
    expect(c.status).toBe("PASS");
  });

  it("http/https wildcards still detected (LastPass)", () => {
    const c = find(evaluateExtensionManifest(lastpass, "store"), "ext_host_permissions_scoped")!;
    expect(c.status).toBe("WARN");
    expect(c.evidence).toBe("http://*/*, https://*/*");
  });
});

describe("unchanged neighbours", () => {
  it("high-risk permissions ignore optional_permissions and list required ones", () => {
    const c = find(evaluateExtensionManifest(lastpass, "store"), "ext_high_risk_permissions")!;
    expect(c.status).toBe("WARN");
    expect(c.evidence).toBe("tabs, webRequest, cookies");
  });

  it("minimum_chrome_version WARN when absent, PASS when declared", () => {
    expect(find(evaluateExtensionManifest(lastpass, "store"), "ext_minimum_chrome_version")!.status).toBe("WARN");
    expect(find(evaluateExtensionManifest(reactDevtools, "store"), "ext_minimum_chrome_version")!.status).toBe("PASS");
  });
});
