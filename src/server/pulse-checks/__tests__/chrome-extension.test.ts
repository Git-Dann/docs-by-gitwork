import { describe, it, expect } from "vitest";
import { evaluateChromeExtensionChecks, findExtensionManifest, isChromeExtension } from "../chrome-extension";
import type { RepoSnapshot } from "../native-mobile";
import type { PulseScanCheckInput } from "@/types/pulse";

function snapshot(files: Record<string, string>): RepoSnapshot {
  return {
    owner: "acme",
    repo: "ext",
    paths: Object.keys(files),
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const manifest = (obj: Record<string, unknown>) => JSON.stringify({ manifest_version: 3, ...obj });
const keys = (c: PulseScanCheckInput[]) => c.map((x) => x.checkKey);
const find = (c: PulseScanCheckInput[], k: string) => c.find((x) => x.checkKey === k);

describe("detection", () => {
  it("requires a manifest_version key, not just the filename", () => {
    // manifest.json is a crowded filename. A PWA web app manifest must NOT be
    // scanned as an extension — this single test is what prevents that.
    const pwa = snapshot({
      "public/manifest.json": JSON.stringify({ name: "My PWA", start_url: "/", display: "standalone" }),
    });
    expect(isChromeExtension(pwa)).toBe(false);
    expect(evaluateChromeExtensionChecks(pwa)).toEqual([]);
  });

  it("detects a real extension manifest", () => {
    const ext = snapshot({ "manifest.json": manifest({ name: "X", version: "1.0", description: "d" }) });
    expect(isChromeExtension(ext)).toBe(true);
    expect(findExtensionManifest(ext)?.path).toBe("manifest.json");
  });

  it("returns nothing when the repo has no manifest at all", () => {
    expect(evaluateChromeExtensionChecks(snapshot({ "index.js": "1" }))).toEqual([]);
  });
});

describe("manifest validity", () => {
  it("fails unparseable JSON and assesses nothing else", () => {
    // A broken manifest means Chrome cannot load the extension, so every other
    // verdict would be guesswork.
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": `{ "manifest_version": 3, "name": "X", }`, // trailing comma
    }));
    expect(out).toHaveLength(1);
    expect(find(out, "ext_manifest_valid")?.status).toBe("FAIL");
  });
});

describe("Manifest V3", () => {
  it("fails V2 and says it does not run, not that it is untidy", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": JSON.stringify({ manifest_version: 2, name: "X", version: "1", description: "d" }),
    }));
    const c = find(out, "ext_manifest_v3");
    expect(c?.status).toBe("FAIL");
    expect(c?.detail).toMatch(/does not run/);
  });

  it("passes V3", () => {
    const out = evaluateChromeExtensionChecks(snapshot({ "manifest.json": manifest({}) }));
    expect(find(out, "ext_manifest_v3")?.status).toBe("PASS");
  });
});

describe("host permissions", () => {
  it("fails <all_urls>", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ host_permissions: ["<all_urls>"] }),
    }));
    const c = find(out, "ext_host_permissions_scoped");
    expect(c?.status).toBe("FAIL");
    expect(c?.detail).toMatch(/all your data on all websites/);
  });

  it("fails a wildcard content-script match too", () => {
    // The permission can hide in content_scripts rather than host_permissions.
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ content_scripts: [{ matches: ["*://*/*"], js: ["c.js"] }] }),
    }));
    expect(find(out, "ext_host_permissions_scoped")?.status).toBe("FAIL");
  });

  it("passes specific origins", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ host_permissions: ["https://app.acme.com/*"] }),
    }));
    expect(find(out, "ext_host_permissions_scoped")?.status).toBe("PASS");
  });

  it("does not fire when the extension asks for no host access", () => {
    const out = evaluateChromeExtensionChecks(snapshot({ "manifest.json": manifest({}) }));
    expect(keys(out)).not.toContain("ext_host_permissions_scoped");
  });
});

describe("remote code and CSP", () => {
  it("fails a remote script origin in the CSP", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({
        content_security_policy: { extension_pages: "script-src 'self' https://cdn.example.com" },
      }),
    }));
    const c = find(out, "ext_no_remote_code");
    expect(c?.status).toBe("FAIL");
    expect(c?.detail).toMatch(/BANS remotely-hosted code/);
  });

  it("fails unsafe-eval", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ content_security_policy: { extension_pages: "script-src 'self' 'unsafe-eval'" } }),
    }));
    expect(find(out, "ext_no_remote_code")?.status).toBe("FAIL");
  });

  it("passes a self-only CSP", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ content_security_policy: { extension_pages: "script-src 'self'" } }),
    }));
    expect(find(out, "ext_no_remote_code")?.status).toBe("PASS");
    expect(keys(out)).not.toContain("ext_csp_unsafe_inline");
  });
});

describe("other exposures", () => {
  it("fails a wildcard externally_connectable", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ externally_connectable: { matches: ["*://*/*"] } }),
    }));
    expect(find(out, "ext_externally_connectable_scoped")?.status).toBe("FAIL");
  });

  it("does not fire on a scoped externally_connectable", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ externally_connectable: { matches: ["https://app.acme.com/*"] } }),
    }));
    expect(keys(out)).not.toContain("ext_externally_connectable_scoped");
  });

  it("fails a committed OAuth client secret", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ oauth2: { client_id: "abc", client_secret: "shh" } }),
    }));
    expect(find(out, "ext_oauth_secret_committed")?.status).toBe("FAIL");
  });

  it("does not fire on an OAuth block with only a client_id", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ oauth2: { client_id: "abc", scopes: ["email"] } }),
    }));
    expect(keys(out)).not.toContain("ext_oauth_secret_committed");
  });

  it("fails a non-HTTPS update_url and ignores an HTTPS one", () => {
    const bad = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ update_url: "http://updates.acme.com/x.xml" }),
    }));
    expect(find(bad, "ext_update_url_https")?.status).toBe("FAIL");

    const good = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ update_url: "https://updates.acme.com/x.xml" }),
    }));
    expect(keys(good)).not.toContain("ext_update_url_https");
  });

  it("flags high-risk permissions and explains what each one grants", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ permissions: ["storage", "debugger", "cookies"] }),
    }));
    const c = find(out, "ext_high_risk_permissions");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toMatch(/attach the DevTools debugger/);
    // `storage` is ordinary — it must not be listed as high-risk.
    expect(c?.evidence).not.toMatch(/storage/);
  });

  it("stays quiet when only ordinary permissions are requested", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({ permissions: ["storage", "alarms"] }),
    }));
    expect(keys(out)).not.toContain("ext_high_risk_permissions");
  });
});

describe("store listing", () => {
  it("fails when required fields are missing", () => {
    const out = evaluateChromeExtensionChecks(snapshot({ "manifest.json": manifest({ name: "X" }) }));
    const c = find(out, "ext_listing_complete");
    expect(c?.status).toBe("FAIL");
    expect(c?.evidence).toMatch(/version/);
  });

  it("passes a complete manifest with icons", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": manifest({
        name: "X", version: "1.0.0", description: "d",
        icons: { "16": "a.png", "48": "b.png", "128": "c.png" },
        minimum_chrome_version: "120",
      }),
    }));
    expect(keys(out)).not.toContain("ext_listing_complete");
    expect(find(out, "ext_minimum_chrome_version")?.status).toBe("PASS");
  });
});
