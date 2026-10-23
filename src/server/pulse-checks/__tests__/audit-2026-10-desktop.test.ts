import { describe, it, expect } from "vitest";
import { evaluateDesktopChecks, readSettingState } from "../desktop-app";
import { evaluateDesktopExtendedChecks, tauriDevtoolsFeatureEnabled } from "../desktop-app-extended";
import { desktopAppRoots, selectFilesToRead } from "../native-repo";
import type { RepoSnapshot } from "../native-mobile";

// ─────────────────────────────────────────────────────────────────────────────
// Audit of the desktop family against electron/fiddle, marktext and clash-verge-rev
// (October 2026). Every case is two-sided: an input that must flip, and a correct
// input that must not. Fixtures are trimmed from the real repos' code.
// ─────────────────────────────────────────────────────────────────────────────

function snapshot(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "acme",
    repo: "app",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const primary = (files: Record<string, string>, shape: "electron" | "tauri" = "electron") =>
  evaluateDesktopChecks(snapshot(files), shape);
const extended = (files: Record<string, string>, shape: "electron" | "tauri" = "electron") =>
  evaluateDesktopExtendedChecks(snapshot(files), shape);
const find = (checks: ReturnType<typeof evaluateDesktopChecks>, key: string) => checks.find((c) => c.checkKey === key);

const ROOT_PKG = JSON.stringify({ name: "app", version: "1.0.0", devDependencies: { electron: "^42.0.0" } });
// marktext: the root is a workspace shell; the app's dependencies live in packages/desktop.
const MONO_ROOT = JSON.stringify({ name: "marktext", private: true, devDependencies: { electron: "~42.1.0" } });
const monoDesktop = (deps: Record<string, string>) =>
  JSON.stringify({ name: "marktext-desktop", version: "0.18.0", dependencies: deps, devDependencies: { electron: "~42.1.0" } });

describe("1 — electron_csp reads the renderer HTML", () => {
  const META = `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'"></head>`;
  it("PASSes a CSP <meta> in static/index.html (fiddle), and the extended check agrees", () => {
    const files = { "package.json": ROOT_PKG, "src/main/main.ts": "app.whenReady()", "static/index.html": META };
    expect(find(primary(files), "electron_csp")?.status).toBe("PASS");
    expect(find(extended(files), "desk_x_csp_defined")?.status).toBe("PASS");
  });
  it("still WARNs with neither a meta tag nor onHeadersReceived", () => {
    const files = { "package.json": ROOT_PKG, "src/main/main.ts": "app.whenReady()", "static/index.html": "<head></head>" };
    expect(find(primary(files), "electron_csp")?.status).toBe("WARN");
    expect(find(extended(files), "desk_x_csp_defined")?.status).toBe("WARN");
  });
});

describe("2 — electron_auto_update reads the app's own manifest", () => {
  it("PASSes electron-updater declared in packages/desktop/package.json (marktext)", () => {
    const c = find(primary({
      "package.json": MONO_ROOT,
      "packages/desktop/package.json": monoDesktop({ "electron-updater": "^6.8.9" }),
    }), "electron_auto_update");
    expect(c?.status).toBe("PASS");
  });
  it("PASSes update-electron-app (fiddle)", () => {
    const pkg = JSON.stringify({ version: "1.0.0", dependencies: { "update-electron-app": "^3.2.0" }, devDependencies: { electron: "^42.0.0" } });
    expect(find(primary({ "package.json": pkg }), "electron_auto_update")?.status).toBe("PASS");
  });
  it("does not let a jest mock of autoUpdater stand in for the app's updater", () => {
    const c = find(primary({
      "package.json": ROOT_PKG,
      "tests/mocks/electron.ts": "export const autoUpdater = { checkForUpdates: jest.fn() };",
    }), "electron_auto_update");
    expect(c?.status).toBe("WARN");
  });
});

describe("3 — electron_fuses recognises electron-builder's electronFuses block", () => {
  it("PASSes electronFuses with runAsNode off", () => {
    const c = find(primary({
      "package.json": ROOT_PKG,
      "electron-builder.yml": "electronFuses:\n  runAsNode: false\n  enableNodeCliInspectArguments: false\n",
    }), "electron_fuses");
    expect(c?.status).toBe("PASS");
  });
  it("PASSes Forge's FusesPlugin with [FuseV1Options.RunAsNode]: false (fiddle)", () => {
    const c = find(primary({
      "package.json": ROOT_PKG,
      "forge.config.ts": "plugins: [new FusesPlugin({ version: FuseVersion.V1, [FuseV1Options.RunAsNode]: false })]",
    }), "electron_fuses");
    expect(c?.status).toBe("PASS");
  });
  it("says fuses ARE configured when only RunAsNode is left on (marktext), not that there are none", () => {
    const c = find(primary({
      "package.json": ROOT_PKG,
      "electron-builder.yml": "electronFuses:\n  enableNodeCliInspectArguments: false\n  resetAdHocDarwinSignature: true\n",
    }), "electron_fuses");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toMatch(/are configured, but `RunAsNode`/);
  });
  it("still WARNs with no fuses configuration at all", () => {
    const c = find(primary({ "package.json": ROOT_PKG, "electron-builder.yml": "appId: x\n" }), "electron_fuses");
    expect(c?.status).toBe("WARN");
    expect(c?.detail).toMatch(/No Electron Fuses configuration/);
  });
});

describe("4 — desktop_crash_reporting in a monorepo", () => {
  it("PASSes crashReporter.start in packages/desktop/src/main/index.ts, even after a file the comment-stripper cannot parse", () => {
    const c = find(primary({
      "package.json": MONO_ROOT,
      "packages/desktop/package.json": monoDesktop({}),
      // A regex literal containing a quote desynchronised the stripper for the FILES AFTER it.
      "packages/desktop/src/main/a.ts": "const q = /'/g; const s = x.replace(q, '');",
      "packages/desktop/src/main/index.ts": "import { crashReporter } from 'electron'\ncrashReporter.start({ uploadToServer: false })",
    }), "desktop_crash_reporting");
    expect(c?.status).toBe("PASS");
  });
  it("still WARNs when the only 'reporting' is a local logger, and the extended check agrees", () => {
    const files = {
      "package.json": JSON.stringify({ version: "1.0.0", dependencies: { "electron-log": "^5.0.0" }, devDependencies: { electron: "^42.0.0" } }),
      "src/main/index.ts": "import log from 'electron-log'\nlog.info('ready')",
    };
    expect(find(primary(files), "desktop_crash_reporting")?.status).toBe("WARN");
    expect(find(extended(files), "desk_x_crash_reporter")?.status).toBe("WARN");
  });
});

describe("5 — desk_x_credentials_plaintext needs a plaintext write, not the word 'token'", () => {
  it("does not WARN on a markdown lexer's tokens", () => {
    const c = find(extended({
      "package.json": ROOT_PKG,
      "src/muya/lexer.ts": "const tokens = lexer.lex(src); for (const token of tokens) render(token);",
    }), "desk_x_credentials_plaintext");
    expect(c?.status).toBe("SKIPPED");
  });
  it("PASSes keytar declared in the desktop workspace's package.json (marktext)", () => {
    const c = find(extended({
      "package.json": MONO_ROOT,
      "packages/desktop/package.json": monoDesktop({ keytar: "^7.9.0" }),
      "packages/desktop/src/main/dataCenter/index.ts": "await keytar.setPassword(SERVICE, account, token)",
    }), "desk_x_credentials_plaintext");
    expect(c?.status).toBe("PASS");
  });
  it("still WARNs a token written to localStorage with no keychain", () => {
    const c = find(extended({
      "package.json": ROOT_PKG,
      "src/renderer/auth.ts": "localStorage.setItem('accessToken', accessToken)",
    }), "desk_x_credentials_plaintext");
    expect(c?.status).toBe("WARN");
  });
});

describe("6 — desk_x_update_signature sees update-electron-app and electron-updater", () => {
  it("is INCONCLUSIVE (not SKIPPED) for update-electron-app with no explicit signature config (fiddle)", () => {
    const c = find(extended({
      "package.json": JSON.stringify({ version: "1.0.0", dependencies: { "update-electron-app": "^3.2.0" }, devDependencies: { electron: "^42.0.0" } }),
    }), "desk_x_update_signature");
    expect(c?.status).toBe("INCONCLUSIVE");
    expect(c?.confidence).toBe("LOW");
  });
  it("does not read `notarize: false` as signing configuration (marktext)", () => {
    const c = find(extended({
      "package.json": MONO_ROOT,
      "packages/desktop/package.json": monoDesktop({ "electron-updater": "^6.8.9" }),
      "packages/desktop/electron-builder.yml": "mac:\n  notarize: false\n",
    }), "desk_x_update_signature");
    expect(c?.status).toBe("INCONCLUSIVE");
  });
  it("still SKIPs an app with no updater", () => {
    expect(find(extended({ "package.json": ROOT_PKG }), "desk_x_update_signature")?.status).toBe("SKIPPED");
  });
});

describe("7 — shell.openExternal is judged per call site", () => {
  const MENU = "{ label: 'Docs', click() { shell.openExternal('https://github.com/electron/fiddle') } }";
  it("WARNs an unvalidated renderer-supplied URL even when a literal call exists elsewhere (marktext ipc/shell.ts)", () => {
    const files = {
      "package.json": ROOT_PKG,
      "src/main/menu.ts": MENU,
      "src/main/ipc/shell.ts": "ipcMain.handle('mt::shell::open-external', async(_e, url: string) => {\n  await shell.openExternal(url)\n})",
    };
    expect(find(primary(files), "electron_open_external_validated")?.status).toBe("WARN");
    expect(find(extended(files), "desk_x_shell_open_external")?.status).toBe("WARN");
  });
  it("PASSes fiddle's safelyOpenWebURL, which parses the protocol before the call", () => {
    const files = {
      "package.json": ROOT_PKG,
      "src/main/menu.ts": MENU,
      "src/main/windows.ts":
        "export function safelyOpenWebURL(url: string) {\n  try {\n    const { protocol } = new URL(url);\n" +
        "    if (['http:', 'https:'].includes(protocol)) {\n      shell.openExternal(url);\n    }\n  } catch {}\n}",
    };
    expect(find(primary(files), "electron_open_external_validated")?.status).toBe("PASS");
    expect(find(extended(files), "desk_x_shell_open_external")?.status).toBe("PASS");
  });
});

describe("8 — electron_ipc_sender_validation needs a real sender-frame check", () => {
  it("WARNs when the only match is an unrelated `rawUrl` near `.sender` (marktext)", () => {
    const c = find(primary({
      "package.json": ROOT_PKG,
      "src/main/ipc/file.ts": "ipcMain.on('mt::open', (e, rawUrl) => { const id = e.sender.id; open(rawUrl) })",
    }), "electron_ipc_sender_validation");
    expect(c?.status).toBe("WARN");
  });
  it("PASSes fiddle's `new URL(senderFrame.url).protocol` check", () => {
    const c = find(primary({
      "package.json": ROOT_PKG,
      "src/main/fiddle-core.ts":
        "ipcMain.handle('start', async (event) => {\n  const { sender, senderFrame } = event;\n" +
        "  if (senderFrame && new URL(senderFrame.url).protocol === 'isolated-actions:') return start(sender);\n})",
    }), "electron_ipc_sender_validation");
    expect(c?.status).toBe("PASS");
  });
});

describe("9 — Tauri desk_x_navigation_guard", () => {
  const CONF = JSON.stringify({ app: { security: { capabilities: ["main"] } } });
  it("does not PASS on the word 'capabilities' — SKIPPED with no remote IPC (clash-verge-rev)", () => {
    expect(find(extended({ "src-tauri/tauri.conf.json": CONF }, "tauri"), "desk_x_navigation_guard")?.status).toBe("SKIPPED");
  });
  it("PASSes a Rust on_navigation handler", () => {
    const c = find(extended({
      "src-tauri/tauri.conf.json": CONF,
      "src-tauri/src/lib.rs": "WebviewWindowBuilder::new(app, \"main\", url).on_navigation(|u| u.scheme() == \"tauri\")",
    }, "tauri"), "desk_x_navigation_guard");
    expect(c?.status).toBe("PASS");
  });
  it("WARNs remote IPC access with no on_navigation handler", () => {
    const c = find(extended({
      "src-tauri/tauri.conf.json": JSON.stringify({ app: { security: { dangerousRemoteDomainIpcAccess: [{ domain: "x.com" }] } } }),
    }, "tauri"), "desk_x_navigation_guard");
    expect(c?.status).toBe("WARN");
  });
});

describe("10 — desk_x_protocol_handler", () => {
  it("SKIPs a Tauri app whose only 'protocol' is a tauri://localhost string (clash-verge-rev CORS list)", () => {
    const c = find(extended({
      "src-tauri/tauri.conf.json": "{}",
      "src-tauri/src/config/clash.rs": "let origins = vec![\"tauri://localhost\", \"http://tauri.localhost\"];",
    }, "tauri"), "desk_x_protocol_handler");
    expect(c?.status).toBe("SKIPPED");
  });
  it("PASSes fiddle's protocol.handle, which parses and normalises the request", () => {
    const c = find(extended({
      "package.json": ROOT_PKG,
      "src/main/isolated-actions.ts":
        "protocol.handle(SCHEME, async (request) => {\n  const url = new URL(request.url);\n" +
        "  const rel = path.posix.normalize(decodeURIComponent(url.pathname));\n  return net.fetch(pathToFileURL(rel).toString());\n})",
    }), "desk_x_protocol_handler");
    expect(c?.status).toBe("PASS");
  });
  it("WARNs a protocol.handle that serves the raw path", () => {
    const c = find(extended({
      "package.json": ROOT_PKG,
      "src/main/protocol.ts": "protocol.handle('app', (req) => net.fetch('file://' + req.url.slice(6)))",
    }), "desk_x_protocol_handler");
    expect(c?.status).toBe("WARN");
  });
});

describe("11 — Tauri desk_x_devtools_release reads the devtools cargo feature", () => {
  const CARGO_ON = `[package]\nname = "app"\n\n[dependencies]\ntauri = { workspace = true, features = [\n  "protocol-asset",\n  "devtools",\n  "tray-icon",\n] }\n`;
  it("WARNs when the tauri dependency enables \"devtools\" (clash-verge-rev)", () => {
    expect(tauriDevtoolsFeatureEnabled(CARGO_ON)).toBe(true);
    const c = find(extended({
      "src-tauri/tauri.conf.json": "{}",
      "src-tauri/Cargo.toml": CARGO_ON,
      "src-tauri/src/cmd/app.rs": "pub fn open_devtools(app: AppHandle) { window.open_devtools(); }",
    }, "tauri"), "desk_x_devtools_release");
    expect(c?.status).toBe("WARN");
  });
  it("still PASSes without the feature, and ignores it on a dev-dependency or an optional plugin feature", () => {
    const off = `[dependencies]\ntauri = { version = "2", features = ["tray-icon"] }\n\n[features]\ntauri-dev = ["dep:tauri-plugin-devtools"]\n\n[dev-dependencies]\ntauri = { version = "2", features = ["devtools"] }\n`;
    expect(tauriDevtoolsFeatureEnabled(off)).toBe(false);
    const c = find(extended({ "src-tauri/tauri.conf.json": "{}", "src-tauri/Cargo.toml": off }, "tauri"), "desk_x_devtools_release");
    expect(c?.status).toBe("PASS");
  });
});

describe("12 — Tauri URL opening: opener plugin scopes, and no Electron-only verdict", () => {
  const cap = (permissions: unknown[]) => JSON.stringify({ identifier: "migrated", permissions });
  it("SKIPs desk_x_shell_open_external on Tauri", () => {
    expect(find(extended({ "src-tauri/tauri.conf.json": "{}" }, "tauri"), "desk_x_shell_open_external")?.status).toBe("SKIPPED");
  });
  it("PASSes opener:allow-open-url scoped to http/https (clash-verge-rev migrated.json)", () => {
    const c = find(primary({
      "src-tauri/tauri.conf.json": "{}",
      "src-tauri/capabilities/migrated.json": cap([
        "core:default",
        { identifier: "opener:allow-open-url", allow: [{ url: "http://*" }, { url: "https://*" }] },
      ]),
    }, "tauri"), "tauri_shell_open_validator");
    expect(c?.status).toBe("PASS");
  });
  it("WARNs an unscoped opener:allow-open-url, or one that allows file://", () => {
    const unscoped = find(primary({
      "src-tauri/tauri.conf.json": "{}",
      "src-tauri/capabilities/default.json": cap(["opener:allow-open-url"]),
    }, "tauri"), "tauri_shell_open_validator");
    expect(unscoped?.status).toBe("WARN");
    const fileScope = find(primary({
      "src-tauri/tauri.conf.json": "{}",
      "src-tauri/capabilities/default.json": cap([{ identifier: "opener:allow-open-url", allow: [{ url: "file://*" }] }]),
    }, "tauri"), "tauri_shell_open_validator");
    expect(fileScope?.status).toBe("WARN");
  });
});

describe("webPreferences values that are not literals", () => {
  it("reports `nodeIntegration: isDev` as INCONCLUSIVE, not as the secure default", () => {
    expect(readSettingState("new BrowserWindow({ webPreferences: { nodeIntegration: isDev } })", "", "nodeIntegration", true))
      .toBe("dynamic");
    const c = find(primary({
      "package.json": ROOT_PKG,
      "src/main/index.ts": "new BrowserWindow({ webPreferences: { nodeIntegration: isDev, contextIsolation: true } })",
    }), "electron_node_integration");
    expect(c?.status).toBe("INCONCLUSIVE");
  });
  it("ignores type annotations and still PASSes a literal value", () => {
    // sandbox: true is the SECURE value; the type annotation must not read as a runtime expression.
    expect(readSettingState("interface P { sandbox: boolean }\nconst o = { sandbox: true }", "", "sandbox", false)).toBe(true);
    const c = find(primary({
      "package.json": ROOT_PKG,
      "src/main/index.ts": "new BrowserWindow({ webPreferences: { nodeIntegration: false } })",
    }), "electron_node_integration");
    expect(c?.status).toBe("PASS");
  });
  it("finds an insecure literal outside the main-process files (presence is sound anywhere in the app)", () => {
    const c = find(primary({
      "package.json": ROOT_PKG,
      "src/main/index.ts": "new BrowserWindow({ webPreferences: { nodeIntegration: false } })",
      "src/windows/settings.ts": "new BrowserWindow({ webPreferences: { nodeIntegration: true } })",
    }), "electron_node_integration");
    expect(c?.status).toBe("FAIL");
  });
});

describe("electron_code_signing", () => {
  it("does not PASS on `notarize: false`, and reports 'not found' at LOW confidence (signing lives in CI)", () => {
    const c = find(primary({ "package.json": ROOT_PKG, "electron-builder.yml": "mac:\n  notarize: false\n" }), "electron_code_signing");
    expect(c?.status).toBe("WARN");
    expect(c?.confidence).toBe("LOW");
  });
  it("still PASSes an osxSign block", () => {
    const c = find(primary({ "package.json": ROOT_PKG, "forge.config.ts": "packagerConfig: { osxSign: { identity: 'Developer ID' } }" }), "electron_code_signing");
    expect(c?.status).toBe("PASS");
  });
});

describe("A — desktop sampling reads the app, not its sibling packages", () => {
  // marktext: ~940 files in packages/muya (no electron dependency) used to take most of the cap.
  const muya = Array.from({ length: 400 }, (_, i) => ({ path: `packages/muya/src/block/b${i}.ts`, size: 9000 }));
  const desktop = [
    { path: "packages/desktop/electron-builder.yml", size: 3000 },
    { path: "packages/desktop/src/main/index.ts", size: 3900 },
    { path: "packages/desktop/src/main/ipc/shell.ts", size: 1200 },
    { path: "packages/desktop/src/preload/index.ts", size: 800 },
    { path: "packages/desktop/test/unit/main.spec.ts", size: 9000 },
  ];
  const noConfig = desktop.filter((e) => !/electron-builder/.test(e.path));

  it("finds the app root beside the packager config", () => {
    expect(desktopAppRoots([...muya, ...desktop].map((e) => e.path))).toEqual(["packages/desktop"]);
    expect(desktopAppRoots(["forge.config.ts", "src/main/main.ts"])).toEqual([""]);
  });

  it("samples the main/preload files ahead of the sibling package and tests", () => {
    const { source } = selectFilesToRead([...muya, ...desktop], "electron");
    expect(source.slice(0, 3)).toEqual(expect.arrayContaining([
      "packages/desktop/src/main/index.ts",
      "packages/desktop/src/main/ipc/shell.ts",
      "packages/desktop/src/preload/index.ts",
    ]));
    expect(source.indexOf("packages/desktop/test/unit/main.spec.ts")).toBeGreaterThan(2);
  });

  it("leaves non-desktop shapes untouched (the app-root narrowing is electron/tauri only)", () => {
    // If the desktop ranking leaked, the packager config's presence would reorder a "none" sample.
    expect(selectFilesToRead([...muya, ...desktop], "none").source)
      .toEqual(selectFilesToRead([...muya, ...noConfig], "none").source);
    expect(selectFilesToRead([...muya, ...desktop], "electron").source)
      .not.toEqual(selectFilesToRead([...muya, ...noConfig], "electron").source);
  });
});
