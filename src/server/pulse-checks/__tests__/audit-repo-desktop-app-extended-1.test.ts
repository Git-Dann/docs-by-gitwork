import { describe, it, expect } from "vitest";
import { evaluateDesktopExtendedChecks } from "../desktop-app-extended";
import type { RepoSnapshot } from "../native-mobile";
import type { PulseScanCheckInput } from "@/types/pulse";

function snapshot(files: Record<string, string>, extraPaths: string[] = [], truncated = false): RepoSnapshot {
  return {
    owner: "o",
    repo: "r",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated,
    accessible: true,
  };
}
const at = (checks: PulseScanCheckInput[], key: string) => {
  const c = checks.find((x) => x.checkKey === key);
  if (!c) throw new Error(`no check emitted for ${key}`);
  return c;
};

// 20 unsampled source files: 1 of 21 read ≈ 5% coverage (mattermost/desktop's initialize.ts was among the unread).
const UNREAD = Array.from({ length: 20 }, (_, i) => `src/main/module${i}.ts`);
const BARE_MAIN = `app.whenReady().then(() => new BrowserWindow({}));`;

describe("absence findings are coverage-aware", () => {
  it("drops absence WARNs to LOW on a thin sample", () => {
    const checks = evaluateDesktopExtendedChecks(snapshot({ "src/main.ts": BARE_MAIN }, UNREAD), "electron");
    for (const key of [
      "desk_x_permission_handler",
      "desk_x_single_instance",
      "desk_x_csp_defined",
      "desk_x_crash_reporter",
      "desk_x_navigation_guard",
      "desk_x_new_window_guard",
    ]) {
      const c = at(checks, key);
      expect(c.status, key).toBe("WARN");
      expect(c.confidence, key).toBe("LOW");
      expect(c.detail, key).toMatch(/inconclusive/);
    }
  });

  it("keeps absence WARNs HIGH when the whole source was read", () => {
    const checks = evaluateDesktopExtendedChecks(snapshot({ "src/main.ts": BARE_MAIN }), "electron");
    for (const key of ["desk_x_permission_handler", "desk_x_single_instance", "desk_x_csp_defined", "desk_x_crash_reporter"]) {
      const c = at(checks, key);
      expect(c.status, key).toBe("WARN");
      expect(c.confidence, key).toBe("HIGH");
    }
  });

  it("treats a truncated tree as uninformative coverage", () => {
    const c = at(evaluateDesktopExtendedChecks(snapshot({ "src/main.ts": BARE_MAIN }, [], true), "electron"), "desk_x_permission_handler");
    expect(c.confidence).toBe("LOW");
  });

  it("never downgrades a presence finding (FAIL) on a thin sample", () => {
    const checks = evaluateDesktopExtendedChecks(
      snapshot({ "src/main.ts": `new BrowserWindow({ webPreferences: { enableRemoteModule: true } }); require('@electron/remote');` }, UNREAD),
      "electron",
    );
    const fails = checks.filter((x) => x.status === "FAIL");
    expect(fails.length).toBeGreaterThan(0);
    for (const c of fails) expect(c.confidence).toBe("HIGH");
  });
});

describe("desk_x_csp_defined", () => {
  it("PASSes a <meta http-equiv=Content-Security-Policy> in the renderer HTML (atom static/index.html)", () => {
    const checks = evaluateDesktopExtendedChecks(snapshot({
      "src/main.ts": BARE_MAIN,
      "static/index.html": `<meta http-equiv="Content-Security-Policy" content="default-src * atom://*">`,
    }), "electron");
    expect(at(checks, "desk_x_csp_defined").status).toBe("PASS");
  });

  it("does not count `\"csp\": null` with a devCsp as a production policy (clash-verge-rev)", () => {
    const checks = evaluateDesktopExtendedChecks(snapshot({
      "src-tauri/src/main.rs": "fn main() {}",
      "src-tauri/tauri.conf.json": `{ "app": { "security": { "csp": null, "devCsp": "default-src 'self'" } } }`,
    }), "tauri");
    expect(at(checks, "desk_x_csp_defined").status).toBe("WARN");
  });

  it("does not count an empty or false csp", () => {
    for (const v of [`""`, "false"]) {
      const checks = evaluateDesktopExtendedChecks(snapshot({
        "src-tauri/src/main.rs": "fn main() {}",
        "src-tauri/tauri.conf.json": `{ "app": { "security": { "csp": ${v} } } }`,
      }), "tauri");
      expect(at(checks, "desk_x_csp_defined").status, v).toBe("WARN");
    }
  });

  it("still PASSes a real Tauri csp string", () => {
    const checks = evaluateDesktopExtendedChecks(snapshot({
      "src-tauri/src/main.rs": "fn main() {}",
      "src-tauri/tauri.conf.json": `{ "app": { "security": { "csp": "default-src 'self'" } } }`,
    }), "tauri");
    expect(at(checks, "desk_x_csp_defined").status).toBe("PASS");
  });
});

describe("desk_x_devtools_release", () => {
  it("does not flag an app-defined openDevTools() wrapper (clash-verge-rev)", () => {
    const checks = evaluateDesktopExtendedChecks(snapshot({
      "src/services/cmds.ts": `export async function openDevTools() { return invoke("open_devtools"); }\nbutton.onClick = () => openDevTools();`,
    }), "tauri");
    expect(at(checks, "desk_x_devtools_release").status).toBe("PASS");
  });

  it("still WARNs an unguarded webContents.openDevTools(), with hedged wording", () => {
    const c = at(evaluateDesktopExtendedChecks(snapshot({
      "src/main.ts": `win.webContents.openDevTools();`,
    }), "electron"), "desk_x_devtools_release");
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/may be reachable/);
  });
});

describe("desk_x_shell_open_external", () => {
  it("PASSes an anchored https regex guard (atom window-event-handler.js)", () => {
    const c = at(evaluateDesktopExtendedChecks(snapshot({
      "src/window-event-handler.js": `if (/^https?:\\/\\//.test(uri)) shell.openExternal(uri);`,
    }), "electron"), "desk_x_shell_open_external");
    expect(c.status).toBe("PASS");
  });

  it("still WARNs an unguarded shell.openExternal(url)", () => {
    const c = at(evaluateDesktopExtendedChecks(snapshot({
      "src/main.ts": `win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });`,
    }), "electron"), "desk_x_shell_open_external");
    expect(c.status).toBe("WARN");
  });
});

describe("desk_x_single_instance", () => {
  it("PASSes a second-instance handler (mattermost)", () => {
    const c = at(evaluateDesktopExtendedChecks(snapshot({
      "src/main/app/initialize.ts": `app.on('second-instance', handleAppSecondInstance);`,
    }), "electron"), "desk_x_single_instance");
    expect(c.status).toBe("PASS");
  });

  it("PASSes a Tauri check_singleton (clash-verge-rev src-tauri/src/lib.rs)", () => {
    const c = at(evaluateDesktopExtendedChecks(snapshot({
      "src-tauri/src/lib.rs": `if server::check_singleton().await.is_err() { std::process::exit(0); }`,
    }), "tauri"), "desk_x_single_instance");
    expect(c.status).toBe("PASS");
  });

  it("still WARNs with conditional wording when nothing is found", () => {
    const c = at(evaluateDesktopExtendedChecks(snapshot({ "src/main.ts": BARE_MAIN }), "electron"), "desk_x_single_instance");
    expect(c.status).toBe("WARN");
    expect(c.detail).toMatch(/can corrupt/);
  });
});

describe("desk_x_crash_reporter wording", () => {
  it("does not claim there are no logs at all", () => {
    const c = at(evaluateDesktopExtendedChecks(snapshot({ "src/main.ts": BARE_MAIN }), "electron"), "desk_x_crash_reporter");
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toMatch(/no\s+"?\s*logs to go back to/);
  });

  it("still PASSes a configured crashReporter", () => {
    const c = at(evaluateDesktopExtendedChecks(snapshot({ "src/main.ts": `crashReporter.start({ submitURL: url });` }), "electron"), "desk_x_crash_reporter");
    expect(c.status).toBe("PASS");
  });
});

describe("test and mock files are not the shipped app (reviewer follow-up)", () => {
  const MOCK = `module.exports = { session: { defaultSession: { setPermissionRequestHandler: jest.fn() } },
    BrowserWindow: jest.fn(() => ({ webContents: { setWindowOpenHandler: jest.fn(), on: jest.fn() } })) };`;

  it("does not let a jest mock of electron stand in for the app's permission and window handlers", () => {
    const checks = evaluateDesktopExtendedChecks(
      snapshot({ "src/main.ts": BARE_MAIN, "__mocks__/electron.js": MOCK }),
      "electron",
    );
    expect(at(checks, "desk_x_permission_handler").status).toBe("WARN");
    expect(at(checks, "desk_x_new_window_guard").status).toBe("WARN");
  });

  it("still PASSes the same handlers when the app's own main process installs them", () => {
    const checks = evaluateDesktopExtendedChecks(
      snapshot({
        "src/main.ts": `${BARE_MAIN}\nsession.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false));\n` +
          `win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));`,
        "__mocks__/electron.js": MOCK,
      }),
      "electron",
    );
    expect(at(checks, "desk_x_permission_handler").status).toBe("PASS");
    expect(at(checks, "desk_x_new_window_guard").status).toBe("PASS");
  });
});

describe("desk_x_csp_defined — Tauri config is always read (review)", () => {
  it("keeps a Tauri `\"csp\": null` WARN at HIGH even on a thin source sample", () => {
    const unreadRust = Array.from({ length: 20 }, (_, i) => `src-tauri/src/mod${i}.rs`);
    const c = at(
      evaluateDesktopExtendedChecks(
        snapshot({ "src-tauri/src/main.rs": "fn main() {}", "src-tauri/tauri.conf.json": `{ "app": { "security": { "csp": null } } }` }, unreadRust),
        "tauri",
      ),
      "desk_x_csp_defined",
    );
    expect(c.status).toBe("WARN");
    expect(c.confidence).toBe("HIGH");
  });
});
