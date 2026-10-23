import { describe, expect, it } from "vitest";
import { evaluateChromeExtensionChecks } from "../chrome-extension";
import type { RepoSnapshot } from "../native-mobile";
import type { PulseScanCheckInput } from "@/types/pulse";

function snapshot(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "acme",
    repo: "ext",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}
const find = (c: PulseScanCheckInput[], k: string) => c.find((x) => x.checkKey === k);

// Shapes from darkreader/darkreader src/manifest.json + src/manifest-chrome-mv3.json (Oct 2026).
const darkreaderBase = JSON.stringify({
  manifest_version: 2,
  name: "Dark Reader",
  version: "4.9.110",
  description: "__MSG_extension_description__",
  icons: { "16": "icons/dr_16.png", "48": "icons/dr_48.png", "128": "icons/dr_128.png" },
  background: { persistent: true, page: "background/index.html" },
  content_scripts: [{ matches: ["<all_urls>"], js: ["inject/fallback.js", "inject/index.js"], run_at: "document_start", all_frames: true }],
});
const darkreaderMv3Patch = JSON.stringify({
  manifest_version: 3,
  background: { service_worker: "background/index.js" },
});

// Shape from gorhill/uBlock platform/mv3/chromium/manifest.json.
const ublockMv3 = (war: unknown[]) => JSON.stringify({
  manifest_version: 3,
  name: "__MSG_extName__",
  version: "2026.1012.1",
  description: "__MSG_extShortDesc__",
  icons: { "16": "img/icon_16.png", "32": "img/icon_32.png", "64": "img/icon_64.png", "128": "img/icon_128.png" },
  background: { service_worker: "/js/background.js", type: "module" },
  web_accessible_resources: war,
});
const dynamicWar = [
  { resources: ["/strictblock.html"], matches: ["<all_urls>"], use_dynamic_url: true },
  { resources: ["/picker-ui.html"], matches: ["<all_urls>"], use_dynamic_url: true },
];

describe("ext_manifest_v3 — sibling MV3 variant", () => {
  it("does not FAIL an MV2 base manifest that has a sibling MV3 variant (darkreader)", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "src/manifest.json": darkreaderBase,
      "src/manifest-chrome-mv3.json": darkreaderMv3Patch,
    }));
    const c = find(out, "ext_manifest_v3")!;
    expect(c.status).toBe("PASS");
    expect(c.confidence).toBe("MEDIUM");
    expect(c.evidence).toContain("src/manifest-chrome-mv3.json");
  });

  it("WARNs (not FAIL, not PASS) when the MV3 variant is known by name only — the production path", () => {
    // native-repo.ts reads only manifest.json files, so darkreader's variant arrives as a path, unread.
    const out = evaluateChromeExtensionChecks(snapshot({ "src/manifest.json": darkreaderBase }, ["src/manifest-chrome-mv3.json"]));
    const c = find(out, "ext_manifest_v3")!;
    expect(c.status).toBe("WARN");
    expect(c.confidence).toBe("MEDIUM");
    expect(c.detail).not.toMatch(/does not run/);
  });

  it("still FAILs a lone MV2 manifest whose only sibling is a Firefox variant without manifest_version", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "src/manifest.json": darkreaderBase,
      "src/manifest-firefox.json": JSON.stringify({ background: { page: "background/index.html" } }),
    }));
    const c = find(out, "ext_manifest_v3")!;
    expect(c.status).toBe("FAIL");
    expect(c.detail).toMatch(/does not run/);
  });

  // Audit 2026-10 (item 9): this asserted the defect. The MV3 manifest in another directory
  // IS the Chrome build (gorhill/uBlock's platform/mv3/chromium is what the Web Store ships);
  // the old finder judged whichever manifest came first in Map order.
  it("judges the MV3 Chrome manifest when an MV2 one lives in another directory (uBlock)", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "platform/chromium/manifest.json": JSON.stringify({ manifest_version: 2, name: "uBlock Origin", version: "1.60.0", description: "d" }),
      "platform/mv3/chromium/manifest.json": ublockMv3(dynamicWar),
    }));
    const c = find(out, "ext_manifest_v3")!;
    expect(c.status).toBe("PASS");
    expect(c.detail).toContain("platform/mv3/chromium/manifest.json");
  });
});

describe("ext_dom_injection — test suites are not shipped source", () => {
  it("ignores innerHTML that only appears in tests/**/*.tests.ts (darkreader)", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "src/manifest.json": darkreaderBase,
      "src/inject/index.ts": "export function render(el: HTMLElement, s: string) { el.textContent = s; }",
      "tests/inject/dynamic/inline-override.tests.ts": "container.innerHTML = '<span style=\"color: red;\">Inline style override</span>';",
    }));
    expect(find(out, "ext_dom_injection")).toBeUndefined();
  });

  it("still FAILs unsanitised innerHTML in shipped content-script source", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "src/manifest.json": darkreaderBase,
      "src/inject/panel.ts": "export function show(el: HTMLElement, html: string) { el.innerHTML = html; }",
      "tests/panel.tests.ts": "container.innerHTML = '';",
    }));
    expect(find(out, "ext_dom_injection")?.status).toBe("FAIL");
  });
});

describe("ext_entrypoints_resolve — extension-root-relative paths", () => {
  it("does not claim a missing worker when the build assembles it from elsewhere (uBlock /js/background.js)", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "platform/mv3/chromium/manifest.json": ublockMv3(dynamicWar),
    }, ["platform/mv3/extension/js/background.js"]));
    const c = find(out, "ext_entrypoints_resolve")!;
    expect(c.status).toBe("PASS");
    expect(c.confidence).toBe("MEDIUM");
    expect(c.detail).toContain("platform/mv3/extension/js/background.js");
    expect(c.detail).not.toMatch(/no such file exists/);
  });

  it("resolves a leading-slash worker against the manifest directory (exists, HIGH)", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": JSON.stringify({ manifest_version: 3, name: "X", version: "1.0", description: "d", background: { service_worker: "/background.js" } }),
    }, ["background.js"]));
    const c = find(out, "ext_entrypoints_resolve")!;
    expect(c.status).toBe("PASS");
    expect(c.confidence).toBe("HIGH");
  });

  it("still WARNs when the only same-named file is vendored or a test fixture", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": JSON.stringify({ manifest_version: 3, name: "X", version: "1.0", description: "d", background: { service_worker: "background.js" } }),
    }, ["node_modules/foo/background.js", "tests/fixtures/background.js"]));
    const c = find(out, "ext_entrypoints_resolve")!;
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/no such file exists/);
  });

  it("resolves a worker relative to a manifest in src/ (exists, HIGH)", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "src/manifest.json": JSON.stringify({ manifest_version: 3, name: "X", version: "1.0", description: "d", background: { service_worker: "background.js" } }),
    }, ["src/background.js"]));
    const c = find(out, "ext_entrypoints_resolve")!;
    expect(c.status).toBe("PASS");
    expect(c.confidence).toBe("HIGH");
  });

  it("still WARNs when the worker exists nowhere in the tree", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "platform/mv3/chromium/manifest.json": ublockMv3(dynamicWar),
    }, ["platform/mv3/extension/js/popup.js"]));
    const c = find(out, "ext_entrypoints_resolve")!;
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/no such file exists/);
  });
});

describe("ext_web_accessible_resources — use_dynamic_url", () => {
  it("does not call all-origin resources fingerprintable when every entry uses dynamic URLs (uBlock MV3)", () => {
    const out = evaluateChromeExtensionChecks(snapshot({ "platform/mv3/chromium/manifest.json": ublockMv3(dynamicWar) }));
    const c = find(out, "ext_web_accessible_resources")!;
    expect(c.status).toBe("PASS");
    expect(c.detail).toContain("use_dynamic_url");
    expect(c.detail).not.toMatch(/declare specific origin matches/);
  });

  it("still WARNs on all-origin resources served under the fixed extension URL", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "platform/mv3/chromium/manifest.json": ublockMv3([
        { resources: ["/strictblock.html"], matches: ["<all_urls>"], use_dynamic_url: true },
        { resources: ["/web_accessible_resources/*"], matches: ["<all_urls>"] },
      ]),
    }));
    const c = find(out, "ext_web_accessible_resources")!;
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/FINGERPRINTABLE/);
  });
});

describe("ext_icons_complete — wording", () => {
  it("says a missing 48 is scaled from a declared size, not rendered blank (uBlock 16/32/64/128)", () => {
    const out = evaluateChromeExtensionChecks(snapshot({ "platform/mv3/chromium/manifest.json": ublockMv3(dynamicWar) }));
    const c = find(out, "ext_icons_complete")!;
    expect(c.status).toBe("WARN");
    expect(c.evidence).toBe("missing 48");
    expect(c.detail).toContain("16, 32, 64, 128px");
    expect(c.detail).not.toMatch(/blank placeholder/);
  });

  it("still WARNs with placeholder wording when no icons are declared", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "manifest.json": JSON.stringify({ manifest_version: 3, name: "X", version: "1.0", description: "d" }),
    }));
    const c = find(out, "ext_icons_complete")!;
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/generic placeholder/);
  });
});

describe("ext_web_accessible_resources — Manifest V2 string entries (reviewer follow-up)", () => {
  const mv2 = (war: unknown[]) => JSON.stringify({
    manifest_version: 2, name: "X", version: "1.0.0", description: "d",
    icons: { "16": "a.png", "48": "b.png", "128": "c.png" },
    web_accessible_resources: war,
  });

  it("WARNs on MV2 bare-path resources, which every origin can fetch", () => {
    const c = find(evaluateChromeExtensionChecks(snapshot({ "manifest.json": mv2(["inject/*.css", "icons/*.png"]) })), "ext_web_accessible_resources")!;
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/Manifest V2 lists resources as bare paths/);
    expect(c.detail).not.toMatch(/declare specific origin matches/);
  });

  it("still PASSes an MV3 entry restricted to specific origins", () => {
    const c = find(evaluateChromeExtensionChecks(snapshot({
      "manifest.json": JSON.stringify({
        manifest_version: 3, name: "X", version: "1.0.0", description: "d",
        icons: { "16": "a.png", "48": "b.png", "128": "c.png" },
        web_accessible_resources: [{ resources: ["x.css"], matches: ["https://example.com/*"] }],
      }),
    })), "ext_web_accessible_resources")!;
    expect(c.status).toBe("PASS");
    expect(c.detail).toMatch(/declare specific origin matches/);
  });
});

describe("ext_manifest_v3 — a Firefox MV3 sibling is not the Chrome build (review)", () => {
  it("still FAILs an MV2 manifest whose only V3 sibling is a Firefox manifest", () => {
    const out = evaluateChromeExtensionChecks(snapshot({
      "src/manifest.json": darkreaderBase,
      "src/manifest-firefox.json": JSON.stringify({ manifest_version: 3, browser_specific_settings: { gecko: { id: "x@y" } } }),
    }));
    expect(find(out, "ext_manifest_v3")?.status).toBe("FAIL");
  });
});
