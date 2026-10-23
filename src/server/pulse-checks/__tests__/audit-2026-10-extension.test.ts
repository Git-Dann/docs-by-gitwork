// Audit 2026-10 — browser-extension family, verified against darkreader, refined-github,
// gorhill/uBlock and uBOL-home. Every fix is tested in both directions: the input the audit
// caught now gets the right verdict, and the representative correct input is unchanged.
import { describe, expect, it } from "vitest";
import {
  evaluateChromeExtensionChecks,
  evaluateExtensionManifest,
  extensionSourceFiles,
  findExtensionManifest,
  stripJsCommentsAndStrings,
} from "../chrome-extension";
import { evaluateExtensionExtendedChecks } from "../chrome-extension-extended";
import { resolveSnapshotShape, selectFilesToRead } from "../native-repo";
import type { RepoSnapshot } from "../native-mobile";
import type { PulseScanCheckInput } from "@/types/pulse";

function snap(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}
const all = (s: RepoSnapshot) => [...evaluateChromeExtensionChecks(s), ...evaluateExtensionExtendedChecks(s)];
const at = (checks: PulseScanCheckInput[], key: string) => checks.find((c) => c.checkKey === key);
const mv3 = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ manifest_version: 3, name: "X", version: "1.0.0", description: "d", ...extra });
const mv2 = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ manifest_version: 2, name: "X", version: "1.0.0", description: "d", ...extra });

describe("D1 — a Safari Web Extension wrapper is not an iOS app", () => {
  it("resolves refined-github's layout as chrome-extension", () => {
    const paths = [
      "source/manifest.json",
      "source/background.ts",
      "safari/Refined GitHub.xcodeproj/project.pbxproj",
      "safari/Refined GitHub/App.swift",
      "safari/Web Extension/Info.plist",
      "safari/Web Extension/SafariWebExtensionHandler.swift",
    ];
    const probes = new Map([["source/manifest.json", mv3()]]);
    expect(resolveSnapshotShape(paths, probes)).toBe("chrome-extension");
  });

  it("resolves uBOL-home's nested dist/safari/xcode wrapper as chrome-extension", () => {
    const paths = [
      "chromium/manifest.json",
      "dist/safari/xcode/Shared (App)/ContentView.swift",
      "dist/safari/xcode/Shared (Extension)/SafariWebExtensionHandler.swift",
      "dist/safari/xcode/uBlock Origin Lite.xcodeproj/project.pbxproj",
    ];
    expect(resolveSnapshotShape(paths, new Map([["chromium/manifest.json", mv3()]]))).toBe("chrome-extension");
  });

  it("keeps a real iOS app (Xcode project, PWA manifest without manifest_version) as ios", () => {
    const paths = ["App.xcodeproj/project.pbxproj", "App/AppDelegate.swift", "App/Info.plist", "web/manifest.json"];
    expect(resolveSnapshotShape(paths, new Map([["web/manifest.json", JSON.stringify({ name: "pwa" })]]))).toBe("ios");
  });

  it("keeps an iOS app that ships a Safari extension as one target as ios", () => {
    const paths = [
      "MyApp.xcodeproj/project.pbxproj",
      "MyApp/AppDelegate.swift",
      "MyApp/Feed.swift",
      "Extension/SafariWebExtensionHandler.swift",
      "Extension/Resources/manifest.json",
    ];
    expect(resolveSnapshotShape(paths, new Map([["Extension/Resources/manifest.json", mv3()]]))).toBe("ios");
  });
});

describe("D2 — .tsx/.jsx are extension source", () => {
  it("counts and reads popup .tsx, but not type declarations or test files", () => {
    const s = snap(
      { "manifest.json": mv3(), "src/popup.tsx": "export const P = () => null;", "src/types.d.ts": "", "src/a.test.tsx": "" },
      ["src/options.jsx"],
    );
    const r = extensionSourceFiles(s);
    expect(r.files.map((f) => f.path)).toEqual(["src/popup.tsx"]);
    expect(r.total).toBe(2);
  });

  it("samples tsx/jsx for the chrome-extension shape", () => {
    const { source } = selectFilesToRead(
      [{ path: "manifest.json", size: 10 }, { path: "src/popup.tsx", size: 10 }, { path: "src/x.jsx", size: 10 }],
      "chrome-extension",
    );
    expect(source).toEqual(expect.arrayContaining(["src/popup.tsx", "src/x.jsx"]));
  });
});

describe("1/2 — eval is a real call, not a string, a comment, or inspectedWindow.eval", () => {
  it("passes darkreader's build-task string table and a DevTools inspectedWindow.eval", () => {
    const s = snap({
      "manifest.json": mv3(),
      "tasks/bundle-js.js": "const replace = { 'eval(': 'void(', };\neval(code);",
      "webpack.config.js": "eval(x)",
      "src/devtools.js": "chrome.devtools.inspectedWindow.eval('document.title', cb);\nconst t = 'eval(';",
    });
    const out = all(s);
    expect(at(out, "ext_no_eval")!.status).toBe("PASS");
    expect(at(out, "ext_x_no_eval_in_content")!.status).toBe("PASS");
  });

  it("passes uBlock's comment that mentions eval()", () => {
    const s = snap({ "manifest.json": mv3(), "src/js/jsonpath.js": "/*\n *   JS eval() is not used here\n */\nexport const q = 1;\n// eval(x)\n" });
    const out = all(s);
    expect(at(out, "ext_no_eval")!.status).toBe("PASS");
    expect(at(out, "ext_x_no_eval_in_content")!.status).toBe("PASS");
  });

  it("still FAILs a real eval(userCode) and new Function(s), in both families, naming the file", () => {
    for (const body of ["eval(userCode);", "const f = new Function(s);", "window.eval(code)"]) {
      const out = all(snap({ "manifest.json": mv3(), "src/bg.js": body }));
      expect(at(out, "ext_no_eval")!.status).toBe("FAIL");
      expect(at(out, "ext_x_no_eval_in_content")!.status).toBe("FAIL");
      expect(at(out, "ext_no_eval")!.evidence).toBe("src/bg.js");
    }
  });

  it("stripJsCommentsAndStrings keeps code tokens and drops literals", () => {
    const out = stripJsCommentsAndStrings("a('eval(') /* eval( */ // eval(\nb(`eval(`); c()");
    expect(out).not.toMatch(/eval/);
    expect(out).toMatch(/a\(''\)/);
    expect(out).toMatch(/c\(\)/);
  });
});

describe("3 — token storage needs a token key inside a storage write", () => {
  it("ignores an auth-token URL param in one file and an unrelated storage.local in another (uBlock)", () => {
    const s = snap({
      "manifest.json": mv3(),
      "src/a.js": "fetch(url + '?auth-token=' + t);",
      "src/b.js": "chrome.storage.local.set({ theme: 'dark' });",
    });
    expect(at(all(s), "ext_token_storage")).toBeUndefined();
  });

  it("WARNs when a token is written to storage.local", () => {
    const s = snap({ "manifest.json": mv3(), "src/auth.js": "chrome.storage.local.set({ access_token: tok });" });
    const c = at(all(s), "ext_token_storage")!;
    expect(c.status).toBe("WARN");
    expect(c.evidence).toBe("src/auth.js");
  });
});

describe("4 — declarativeNetRequest is decided from the judged manifest", () => {
  it("WARNs an MV2 webRequestBlocking manifest even when a comment elsewhere mentions declarativeNetRequest", () => {
    const s = snap({
      "manifest.json": mv2({ permissions: ["webRequest", "webRequestBlocking"] }),
      "src/x.js": "// TODO move to declarativeNetRequest\nconst a = 1;",
    });
    expect(at(all(s), "ext_x_declarative_net_request")!.status).toBe("WARN");
  });

  it("PASSes when the manifest requests declarativeNetRequest", () => {
    const s = snap({ "manifest.json": mv3({ permissions: ["declarativeNetRequest"] }) });
    expect(at(all(s), "ext_x_declarative_net_request")!.status).toBe("PASS");
  });
});

describe("5 — http(s)://*/* is all sites in the extended family too", () => {
  it("WARNs content scripts matching http://*/* and https://*/*", () => {
    const s = snap({ "manifest.json": mv3({ content_scripts: [{ matches: ["http://*/*", "https://*/*"], js: ["c.js"] }] }) });
    expect(at(all(s), "ext_x_content_script_matches")!.status).toBe("WARN");
  });
  it("PASSes scoped content scripts", () => {
    const s = snap({ "manifest.json": mv3({ content_scripts: [{ matches: ["https://github.com/*"], js: ["c.js"] }] }) });
    expect(at(all(s), "ext_x_content_script_matches")!.status).toBe("PASS");
  });
  it("FAILs externally_connectable https://*/*, PASSes a specific origin", () => {
    expect(at(all(snap({ "manifest.json": mv3({ externally_connectable: { matches: ["https://*/*"] } }) })), "ext_x_external_connectable")!.status).toBe("FAIL");
    expect(at(all(snap({ "manifest.json": mv3({ externally_connectable: { matches: ["https://app.example.com/*"] } }) })), "ext_x_external_connectable")!.status).toBe("PASS");
  });
});

describe("6 — MV2 <all_urls> in permissions is host access", () => {
  it("emits ext_host_permissions_scoped and ext_activetab_alternative for ['<all_urls>', 'storage']", () => {
    const out = all(snap({ "manifest.json": mv2({ permissions: ["<all_urls>", "storage"] }) }));
    expect(at(out, "ext_host_permissions_scoped")!.evidence).toBe("<all_urls>");
    expect(at(out, "ext_activetab_alternative")!.status).toBe("WARN");
  });
  it("no activeTab nag when activeTab is requested, and PASS for scoped hosts", () => {
    expect(at(all(snap({ "manifest.json": mv2({ permissions: ["<all_urls>", "activeTab"] }) })), "ext_activetab_alternative")).toBeUndefined();
    expect(at(all(snap({ "manifest.json": mv2({ permissions: ["https://github.com/*"] }) })), "ext_host_permissions_scoped")!.status).toBe("PASS");
  });
});

describe("7/8 — Chrome manifest variants are read and honoured", () => {
  const base = mv2({ permissions: ["storage"] });
  const variant = JSON.stringify({ manifest_version: 3, minimum_chrome_version: "106.0.0.0" });

  it("reads manifest-*.json variants as config", () => {
    const { config } = selectFilesToRead(
      [{ path: "src/manifest.json", size: 10 }, { path: "src/manifest-chrome-mv3.json", size: 10 }, { path: "src/other.json", size: 10 }],
      "chrome-extension",
    );
    expect(config).toContain("src/manifest-chrome-mv3.json");
    expect(config).not.toContain("src/other.json");
  });

  it("PASSes MV3 and minimum_chrome_version (both families) from darkreader's Chrome variant", () => {
    const out = all(snap({ "src/manifest.json": base, "src/manifest-chrome-mv3.json": variant }));
    expect(at(out, "ext_manifest_v3")).toMatchObject({ status: "PASS", confidence: "MEDIUM" });
    expect(at(out, "ext_minimum_chrome_version")).toMatchObject({ status: "PASS", confidence: "MEDIUM" });
    expect(at(out, "ext_x_minimum_chrome_version")).toMatchObject({ status: "PASS", confidence: "MEDIUM" });
  });

  it("still WARNs minimum_chrome_version when only a Firefox variant declares anything", () => {
    const out = all(snap({ "src/manifest.json": base, "src/manifest-firefox.json": JSON.stringify({ minimum_chrome_version: "100" }) }));
    expect(at(out, "ext_minimum_chrome_version")!.status).toBe("WARN");
    expect(at(out, "ext_x_minimum_chrome_version")!.status).toBe("WARN");
  });
});

describe("9 — the Chrome manifest is chosen, not the first in Map order", () => {
  const ublock = {
    "platform/chromium/manifest.json": mv2({ permissions: ["webRequestBlocking"] }),
    "platform/firefox/manifest.json": mv2({ browser_specific_settings: { gecko: { id: "x" } } }),
    "platform/mv3/firefox/manifest.json": mv3({ background: { scripts: ["bg.js"] } }),
    "platform/mv3/chromium/manifest.json": mv3({ background: { service_worker: "/js/background.js" } }),
  };

  it("picks platform/mv3/chromium over the retired MV2 build and Firefox builds", () => {
    expect(findExtensionManifest(snap(ublock))!.path).toBe("platform/mv3/chromium/manifest.json");
    const c = at(all(snap(ublock)), "ext_manifest_v3")!;
    expect(c.status).toBe("PASS");
    expect(c.detail).toContain("platform/mv3/chromium/manifest.json");
  });

  it("a lone Firefox manifest's background.scripts is a WARN, not 'Chrome will refuse to load it'", () => {
    const s = snap({ "firefox/manifest.json": mv3({ browser_specific_settings: { gecko: { id: "x" } }, background: { scripts: ["bg.js"] } }) });
    const c = at(all(s), "ext_service_worker")!;
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toMatch(/refuse to load/);
  });

  it("still FAILs a Chrome MV3 manifest whose background is a page", () => {
    const c = at(all(snap({ "manifest.json": mv3({ background: { page: "bg.html" } }) })), "ext_service_worker")!;
    expect(c.status).toBe("FAIL");
  });
});

describe("10 — a compiled service worker is not 'missing'", () => {
  const manifest = mv3({ background: { service_worker: "assets/background.js" } });
  it("PASSes MEDIUM when source/background.ts is the worker's source (refined-github)", () => {
    const c = at(all(snap({ "source/manifest.json": manifest, "source/background.ts": "export {};", "tsdown.config.js": "" })), "ext_entrypoints_resolve")!;
    expect(c).toMatchObject({ status: "PASS", confidence: "MEDIUM" });
  });
  it("is INCONCLUSIVE when only a bundler config could produce it", () => {
    const c = at(all(snap({ "source/manifest.json": manifest, "source/main.ts": "", "vite.config.ts": "" })), "ext_entrypoints_resolve")!;
    expect(c.status).toBe("INCONCLUSIVE");
  });
  it("still WARNs HIGH when nothing could produce it", () => {
    const c = at(all(snap({ "source/manifest.json": manifest, "source/main.ts": "" })), "ext_entrypoints_resolve")!;
    expect(c).toMatchObject({ status: "WARN", confidence: "HIGH" });
  });
});

describe("11 — a privacy policy is a policy file or link, and absence is INCONCLUSIVE", () => {
  const m = mv3({ permissions: ["cookies"] });
  it("does not PASS on uBOL's easyprivacy.json filter list", () => {
    const c = at(all(snap({ "manifest.json": m }, ["rulesets/main/easyprivacy.json"])), "ext_x_privacy_policy")!;
    expect(c.status).toBe("INCONCLUSIVE");
  });
  it("PASSes on privacy-policy.md", () => {
    const c = at(all(snap({ "manifest.json": m }, ["privacy-policy.md"])), "ext_x_privacy_policy")!;
    expect(c.status).toBe("PASS");
  });
});

describe("12 — all-sites host access is a WARN on the repo surface too", () => {
  it("repo and store agree", () => {
    const m = { manifest_version: 3, host_permissions: ["<all_urls>"] };
    expect(at(evaluateExtensionManifest(m, "repo"), "ext_host_permissions_scoped")!.status).toBe("WARN");
    expect(at(evaluateExtensionManifest(m, "store"), "ext_host_permissions_scoped")!.status).toBe("WARN");
  });
});

describe("consistency — coverage gating, worker-only lifetime, shared rules", () => {
  it("absence-derived eval PASS is LOW below 30% coverage and HIGH above it, in both families", () => {
    const thin = all(snap({ "manifest.json": mv3(), "src/a.js": "x()" }, ["src/b.js", "src/c.js", "src/d.js", "src/e.js"]));
    expect(at(thin, "ext_no_eval")!.confidence).toBe("LOW");
    expect(at(thin, "ext_x_no_eval_in_content")!.confidence).toBe("LOW");
    const full = all(snap({ "manifest.json": mv3(), "src/a.js": "x()" }));
    expect(at(full, "ext_no_eval")!.confidence).toBe("HIGH");
    expect(at(full, "ext_x_no_eval_in_content")!.confidence).toBe("HIGH");
  });

  it("service-worker lifetime reads the worker, not module state in a popup", () => {
    const m = mv3({ background: { service_worker: "bg.js" } });
    const popupOnly = all(snap({ "manifest.json": m, "bg.js": "chrome.runtime.onInstalled.addListener(() => {});", "popup.js": "const cache = {};" }));
    expect(at(popupOnly, "ext_x_service_worker_lifetime")!.status).toBe("PASS");
    const inWorker = all(snap({ "manifest.json": m, "bg.js": "const cache = {};\nchrome.runtime.onMessage.addListener(() => {});" }));
    expect(at(inWorker, "ext_x_service_worker_lifetime")!.status).toBe("WARN");
  });

  it("the two version checks agree on a leading zero", () => {
    const out = all(snap({ "manifest.json": mv3({ version: "1.01" }) }));
    expect(at(out, "ext_version_format")!.status).toBe("FAIL");
    expect(at(out, "ext_x_version_scheme")!.status).toBe("FAIL");
  });

  it("innerHTML in a data string is not an assignment (uBOL scriptlet args), in either family", () => {
    const out = all(snap({ "manifest.json": mv3(), "rules/x.js": "const args = ['/skin|insertAdjacentHTML|netflix/', 'a.innerHTML = 1'];" }));
    expect(at(out, "ext_dom_injection")).toBeUndefined();
    expect(at(out, "ext_x_innerhtml_injection")!.status).toBe("PASS");
    const real = all(snap({ "manifest.json": mv3(), "src/ui.js": "el.innerHTML = html;" }));
    expect(at(real, "ext_dom_injection")!.status).toBe("FAIL");
    expect(at(real, "ext_x_innerhtml_injection")!.status).toBe("FAIL");
  });

  it("scripting is high-risk only with all-sites host access; userScripts always", () => {
    expect(at(evaluateExtensionManifest({ manifest_version: 3, permissions: ["scripting"], host_permissions: ["https://github.com/*"] }, "repo"), "ext_high_risk_permissions")).toBeUndefined();
    expect(at(evaluateExtensionManifest({ manifest_version: 3, permissions: ["scripting"], host_permissions: ["<all_urls>"] }, "repo"), "ext_high_risk_permissions")!.evidence).toBe("scripting");
    expect(at(evaluateExtensionManifest({ manifest_version: 3, permissions: ["userScripts"] }, "repo"), "ext_high_risk_permissions")!.evidence).toBe("userScripts");
  });
});
