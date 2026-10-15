import { describe, it, expect } from "vitest";
import { evaluateDesktopChecks } from "../desktop-app";
import type { RepoSnapshot } from "../native-mobile";

function snapshot(files: Record<string, string>, extraPaths: string[] = []): RepoSnapshot {
  return {
    owner: "atom",
    repo: "atom",
    paths: [...Object.keys(files), ...extraPaths],
    files: new Map(Object.entries(files)),
    truncated: false,
    accessible: true,
  };
}

const find = (checks: ReturnType<typeof evaluateDesktopChecks>, key: string) =>
  checks.find((c) => c.checkKey === key);

const ATOM_MAIN = `const start = require('./start');\nstart(resourcePath, devResourcePath, startTime);\n`;
const ATOM_WINDOW_WITH_GUARD = `
class AtomWindow {
  handleEvents() {
    this.browserWindow.webContents.on('will-navigate', (event, url) => {
      if (url !== this.browserWindow.webContents.getURL())
        event.preventDefault();
    });
  }
}
module.exports = AtomWindow;
`;
const ATOM_WINDOW_NO_GUARD = `
class AtomWindow {
  handleEvents() {
    this.browserWindow.on('focus', () => this.focused());
  }
}
module.exports = AtomWindow;
`;

describe("electron_navigation_guard — handler outside main-process-named files", () => {
  it("passes when will-navigate is registered in main-process/atom-window.js (atom/atom)", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.58.0" }),
      "src/main-process/main.js": ATOM_MAIN,
      "src/main-process/atom-window.js": ATOM_WINDOW_WITH_GUARD,
    }), "electron");
    expect(find(checks, "electron_navigation_guard")?.status).toBe("PASS");
  });

  it("still warns at HIGH confidence when no file registers a navigation guard", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.58.0" }),
      "src/main-process/main.js": ATOM_MAIN,
      "src/main-process/atom-window.js": ATOM_WINDOW_NO_GUARD,
    }), "electron");
    const c = find(checks, "electron_navigation_guard");
    expect(c?.status).toBe("WARN");
    expect(c?.confidence).toBe("HIGH");
  });

  it("sees mattermost-style setWindowOpenHandler deny in src/app/** (not only src/main/**)", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "6.1.0" }),
      "src/main/app/initialize.ts": `export function initialize() { app.whenReady().then(start); }`,
      "src/app/windows/baseWindow.ts": `this.win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));`,
    }), "electron");
    expect(find(checks, "electron_window_open_handler")?.status).toBe("PASS");
  });

  it("does not count a renderer <webview> will-navigate listener as a guard", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.0.0" }),
      "src/main.js": `app.whenReady().then(createWindow);`,
      "src/renderer/view.ts": `webview.addEventListener('will-navigate', (e) => { e.preventDefault(); });`,
    }), "electron");
    expect(find(checks, "electron_navigation_guard")?.status).toBe("WARN");
  });

  it("sees a permission handler registered outside main-process-named files", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "6.1.0" }),
      "src/main.js": `app.whenReady().then(createWindow);`,
      "src/app/session/permissions.ts": `session.defaultSession.setPermissionRequestHandler((wc, p, cb) => cb(false));`,
    }), "electron");
    expect(find(checks, "electron_permission_handler")?.status).toBe("PASS");
  });
});

describe("electron_code_signing — signing tooling declared as dependencies", () => {
  it("passes when electron-osx-sign / electron-notarize are dependencies (atom/atom)", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({
        version: "1.58.0",
        dependencies: { "electron-notarize": "1.0.0", "electron-osx-sign": "0.5.0" },
      }),
      "src/main-process/main.js": ATOM_MAIN,
    }), "electron");
    const c = find(checks, "electron_code_signing");
    expect(c?.status).toBe("PASS");
    expect(c?.detail).not.toMatch(/in the packager config\.$/);
    expect(c?.detail).toMatch(/signing\/notarisation tooling/);
  });

  it("still warns when there is no signing config and no signing tooling", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.0.0", devDependencies: { "electron-packager": "^15.1.0" } }),
      "src/main.js": `app.whenReady().then(createWindow);`,
    }), "electron");
    expect(find(checks, "electron_code_signing")?.status).toBe("WARN");
  });

  it("still passes on packager config signing (mattermost azureSignOptions)", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "6.1.0" }),
      "electron-builder.ts": `win: { azureSignOptions: { certificateProfileName: 'mattermost-desktop-app' } }`,
    }), "electron");
    expect(find(checks, "electron_code_signing")?.status).toBe("PASS");
  });
});

describe("desktop_crash_reporting — wrapped crashReporter", () => {
  it("passes when the main process calls a startCrashReporter wrapper (atom/atom)", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.58.0" }),
      "src/main-process/start.js": `const startCrashReporter = require('../crash-reporter-start');\nstartCrashReporter({ uploadToServer: false, releaseChannel });`,
    }), "electron");
    expect(find(checks, "desktop_crash_reporting")?.status).toBe("PASS");
  });

  it("passes when a crash-reporter module exists in the tree even if it was not sampled", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.58.0" }),
      "src/main-process/main.js": ATOM_MAIN,
    }, ["src/crash-reporter-start.js"]), "electron");
    expect(find(checks, "desktop_crash_reporting")?.status).toBe("PASS");
  });

  it("still warns for an app with no reporter (crash-reporter-named tests, fixtures and vendored files do not count)", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.0.0" }),
      "src/main.js": `app.whenReady().then(createWindow);`,
    }, ["spec/crash-reporter-spec.js", "src/crashReporter.test.ts", "node_modules/foo/crash-reporter.js",
      "test/fixtures/crash-reporter.js"]), "electron");
    expect(find(checks, "desktop_crash_reporting")?.status).toBe("WARN");
  });
});

describe("handler presence ignores tests and mocks (reviewer follow-up)", () => {
  const SPEC = `it('blocks navigation', async () => {
  win.webContents.on('will-navigate', spy);
  session.defaultSession.setPermissionRequestHandler(spy);
});`;

  it("WARNs when will-navigate and a permission handler appear only in a spec file", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.58.0" }),
      "src/main-process/main.js": ATOM_MAIN,
      "src/main-process/atom-window.js": ATOM_WINDOW_NO_GUARD,
      "spec/main-process/atom-window.spec.js": SPEC,
    }), "electron");
    expect(find(checks, "electron_navigation_guard")?.status).toBe("WARN");
    expect(find(checks, "electron_permission_handler")?.status).toBe("WARN");
  });

  it("still PASSes when the same calls are in the app's own window module", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.58.0" }),
      "src/main-process/main.js": ATOM_MAIN,
      "src/main-process/atom-window.js": `${ATOM_WINDOW_WITH_GUARD}\nsession.defaultSession.setPermissionRequestHandler(deny);`,
      "spec/main-process/atom-window.spec.js": SPEC,
    }), "electron");
    expect(find(checks, "electron_navigation_guard")?.status).toBe("PASS");
    expect(find(checks, "electron_permission_handler")?.status).toBe("PASS");
  });
});
