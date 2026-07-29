import { describe, it, expect } from "vitest";
import { evaluateDesktopChecks, readBooleanSetting } from "../desktop-app";
import type { RepoSnapshot } from "../native-mobile";

// ─────────────────────────────────────────────────────────────────────────────
// The desktop family's whole job is reading which VALUE is in effect, so these
// tests concentrate on the three ways that goes wrong:
//
//   1. A commented-out setting read as live (§34.3 / §34.6 — shipped twice).
//   2. "Absent" collapsed with "false", which gets contextIsolation backwards:
//      it defaults SECURE, so absence is a pass. sandbox defaults differently.
//   3. One safe window hiding one unsafe one — the insecure value ANYWHERE is
//      the finding.
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

const statusOf = (checks: ReturnType<typeof evaluateDesktopChecks>, key: string) =>
  checks.find((c) => c.checkKey === key)?.status;

describe("readBooleanSetting — absent is not false", () => {
  it("distinguishes absent from explicitly false", () => {
    expect(readBooleanSetting("nodeIntegration: false", "nodeIntegration")).toBe(false);
    expect(readBooleanSetting("const x = 1", "nodeIntegration")).toBeNull();
  });

  it("reports the insecure value when windows disagree", () => {
    // One hardened window does not make the app safe — the other one is still there.
    const src = `
      new BrowserWindow({ webPreferences: { nodeIntegration: false } })
      new BrowserWindow({ webPreferences: { nodeIntegration: true } })
    `;
    expect(readBooleanSetting(src, "nodeIntegration")).toBe(true);
  });
});

describe("Electron webPreferences", () => {
  it("fails an app with nodeIntegration enabled", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.0.0", devDependencies: { electron: "^41.0.0" } }),
      "src/main.js": `new BrowserWindow({ webPreferences: { nodeIntegration: true, contextIsolation: false } })`,
    }), "electron");

    expect(statusOf(checks, "electron_node_integration")).toBe("FAIL");
    expect(statusOf(checks, "electron_context_isolation")).toBe("FAIL");
    // The combined case must say so — it is a direct RCE path, not two settings.
    expect(checks.find((c) => c.checkKey === "electron_node_integration")!.detail)
      .toMatch(/remote-code-execution/i);
  });

  it("does NOT read a commented-out setting as live", () => {
    // The bug that shipped twice before. Without comment stripping this reports
    // nodeIntegration: true on an app that has it disabled.
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.0.0" }),
      "src/main.js": `
        // nodeIntegration: true,   <- removed during the security review
        /* webSecurity: false */
        new BrowserWindow({ webPreferences: { nodeIntegration: false } })
      `,
    }), "electron");

    expect(statusOf(checks, "electron_node_integration")).toBe("PASS");
    expect(statusOf(checks, "electron_web_security")).toBe("PASS");
  });

  it("passes contextIsolation when the key is simply absent", () => {
    // Secure by default since Electron 12 — absence must not be a failure.
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.0.0" }),
      "src/main.js": `new BrowserWindow({ width: 800 })`,
    }), "electron");
    expect(statusOf(checks, "electron_context_isolation")).toBe("PASS");
  });

  it("does not truncate a URL when stripping comments", () => {
    // A URL contains `//`. Naive stripping cuts the string and the setting after
    // it disappears — the §34.6 Dart bug, in JavaScript.
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.0.0" }),
      "src/main.js": `const feed = "https://updates.example.com/feed"; ` +
        `new BrowserWindow({ webPreferences: { nodeIntegration: true } })`,
    }), "electron");
    expect(statusOf(checks, "electron_node_integration")).toBe("FAIL");
  });

  it("flags wholesale ipcRenderer exposure in a preload", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.0.0" }),
      "src/preload.js": `contextBridge.exposeInMainWorld("api", ipcRenderer)`,
    }), "electron");
    expect(statusOf(checks, "electron_preload_surface")).toBe("FAIL");
  });

  it("flags an end-of-life Electron major", () => {
    const old = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.0.0", devDependencies: { electron: "^28.0.0" } }),
    }), "electron");
    expect(statusOf(old, "electron_version_supported")).toBe("FAIL");

    const current = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.0.0", devDependencies: { electron: "^43.0.0" } }),
    }), "electron");
    expect(statusOf(current, "electron_version_supported")).toBe("PASS");
  });

  it("flags an update feed served over plain HTTP", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.0.0" }),
      "src/main.js": `autoUpdater.setFeedURL("http://updates.example.com/latest")`,
    }), "electron");
    expect(statusOf(checks, "electron_update_transport")).toBe("FAIL");
  });
});

describe("Tauri configuration", () => {
  const tauriFiles = (conf: Record<string, unknown>) => ({
    "src-tauri/tauri.conf.json": JSON.stringify(conf),
    "package.json": JSON.stringify({ version: "1.0.0" }),
  });

  it("fails a wildcard remote IPC grant", () => {
    const checks = evaluateDesktopChecks(snapshot(tauriFiles({
      app: { security: { dangerousRemoteDomainIpcAccess: [{ domain: "*", windows: ["main"] }] } },
    })), "tauri");
    expect(statusOf(checks, "tauri_remote_ipc_access")).toBe("FAIL");
  });

  it("warns on a scoped remote IPC grant rather than failing it", () => {
    const checks = evaluateDesktopChecks(snapshot(tauriFiles({
      app: { security: { dangerousRemoteDomainIpcAccess: [{ domain: "app.example.com", windows: ["main"] }] } },
    })), "tauri");
    expect(statusOf(checks, "tauri_remote_ipc_access")).toBe("WARN");
  });

  it("fails an enabled updater with no public key", () => {
    const checks = evaluateDesktopChecks(snapshot(tauriFiles({
      bundle: { createUpdaterArtifacts: true },
      plugins: { updater: { endpoints: ["https://x/releases"] } },
    })), "tauri");
    expect(statusOf(checks, "tauri_updater_signature")).toBe("FAIL");
  });

  it("passes an updater that verifies signatures", () => {
    const checks = evaluateDesktopChecks(snapshot(tauriFiles({
      bundle: { createUpdaterArtifacts: true },
      plugins: { updater: { pubkey: "EXAMPLE_FAKE_UPDATER_PUBKEY_FOR_TESTS_ONLY" } },
    })), "tauri");
    expect(statusOf(checks, "tauri_updater_signature")).toBe("PASS");
  });

  it("warns when no CSP is configured", () => {
    const checks = evaluateDesktopChecks(snapshot(tauriFiles({ app: { security: { csp: null } } })), "tauri");
    expect(statusOf(checks, "tauri_csp")).toBe("WARN");
  });
});

describe("shared desktop checks", () => {
  it("returns nothing at all for an unreadable repo", () => {
    // "We could not look" must never render as findings. §35's whole lesson.
    const unreadable: RepoSnapshot = {
      owner: "a", repo: "b", paths: [], files: new Map(), truncated: false, accessible: false,
    };
    expect(evaluateDesktopChecks(unreadable, "electron")).toEqual([]);
  });

  it("flags a secret compiled into the shipped app", () => {
    const checks = evaluateDesktopChecks(snapshot({
      "package.json": JSON.stringify({ version: "1.0.0" }),
      // Deliberately NOT a real provider prefix. A Stripe/GitHub-shaped literal
      // trips GitHub push protection even inside a test fixture, and the check
      // matches on shape (a long key-like literal), not on any vendor prefix.
      "src/main.js": `const apiKey = "EXAMPLEFAKEKEYFORTESTSONLY000000"`,
    }), "electron");
    expect(statusOf(checks, "desktop_embedded_secret")).toBe("FAIL");
  });
});
