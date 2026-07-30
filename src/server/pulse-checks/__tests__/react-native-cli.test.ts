import { describe, it, expect } from "vitest";
import { evaluateReactNativeChecks } from "../react-native-app";
import { evaluateCliChecks, binEntries } from "../cli-tool";
import { buildPlatformCoverageCheck } from "../platform-coverage";
import type { RepoSnapshot } from "../native-mobile";

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

const statusOf = (checks: { checkKey: string; status: string }[], key: string) =>
  checks.find((c) => c.checkKey === key)?.status;
const detailOf = (checks: { checkKey: string; detail?: string }[], key: string) =>
  checks.find((c) => c.checkKey === key)?.detail ?? "";

// ─────────────────────────────────────────────────────────────────────────────
// REACT NATIVE
// ─────────────────────────────────────────────────────────────────────────────

describe("React Native — credential storage", () => {
  const pkg = (deps: Record<string, string>) => JSON.stringify({ dependencies: deps });

  it("fails tokens in AsyncStorage with no secure store anywhere", () => {
    const checks = evaluateReactNativeChecks(snapshot({
      "package.json": pkg({ "@react-native-async-storage/async-storage": "^2.0.0" }),
      "src/auth.ts": `await AsyncStorage.setItem("access_token", token)`,
    }));
    expect(statusOf(checks, "rn_token_storage")).toBe("FAIL");
  });

  it("downgrades to WARN when a secure store exists but may be unused", () => {
    // The half-finished migration — a secure store in the deps while the tokens
    // were never moved into it. Found in three of the same client's apps.
    const checks = evaluateReactNativeChecks(snapshot({
      "package.json": pkg({
        "@react-native-async-storage/async-storage": "^2.0.0",
        "react-native-keychain": "^9.0.0",
      }),
      "src/auth.ts": `await AsyncStorage.setItem("access_token", token)`,
    }));
    expect(statusOf(checks, "rn_token_storage")).toBe("WARN");
    expect(detailOf(checks, "rn_token_storage")).toMatch(/half-finished migration/i);
  });

  it("says nothing about token storage when AsyncStorage is not used", () => {
    const checks = evaluateReactNativeChecks(snapshot({
      "package.json": pkg({ "react-native-keychain": "^9.0.0" }),
      "src/auth.ts": `await Keychain.setGenericPassword("user", token)`,
    }));
    expect(statusOf(checks, "rn_token_storage")).toBeUndefined();
  });
});

describe("React Native — the two native shells must agree", () => {
  it("names the platform when only one permits cleartext", () => {
    const checks = evaluateReactNativeChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { "react-native": "0.86.0" } }),
      "android/app/src/main/AndroidManifest.xml": `<application android:usesCleartextTraffic="true" />`,
      "ios/App/Info.plist": `<dict><key>CFBundleName</key><string>App</string></dict>`,
    }));
    expect(statusOf(checks, "rn_cleartext_traffic")).toBe("FAIL");
    // The finding is that they DISAGREE — that is the actionable part.
    expect(detailOf(checks, "rn_cleartext_traffic")).toMatch(/Android permits[\s\S]*while iOS does not/i);
  });

  it("passes when neither shell permits cleartext", () => {
    const checks = evaluateReactNativeChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { "react-native": "0.86.0" } }),
      "android/app/src/main/AndroidManifest.xml": `<application android:name=".MainApplication" />`,
      "ios/App/Info.plist": `<dict><key>CFBundleName</key><string>App</string></dict>`,
    }));
    expect(statusOf(checks, "rn_cleartext_traffic")).toBe("PASS");
  });
});

describe("React Native — build configuration", () => {
  it("warns when Hermes is explicitly disabled", () => {
    const checks = evaluateReactNativeChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { "react-native": "0.86.0" } }),
      "android/gradle.properties": `hermesEnabled=false`,
    }));
    expect(statusOf(checks, "rn_hermes_enabled")).toBe("WARN");
  });

  it("flags an unsupported React Native minor", () => {
    const old = evaluateReactNativeChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { "react-native": "0.68.2" } }),
    }));
    expect(statusOf(old, "rn_version_supported")).toBe("WARN");

    const current = evaluateReactNativeChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { "react-native": "0.86.0" } }),
    }));
    expect(statusOf(current, "rn_version_supported")).toBe("PASS");
  });

  it("passes release logging when the babel plugin strips console", () => {
    const withPlugin = evaluateReactNativeChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { "react-native": "0.86.0" } }),
      "babel.config.js": `module.exports = { env: { production: { plugins: ["transform-remove-console"] } } }`,
      "src/api.ts": `console.log("request", body)`,
    }));
    expect(statusOf(withPlugin, "rn_release_logging")).toBe("PASS");

    const without = evaluateReactNativeChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { "react-native": "0.86.0" } }),
      "babel.config.js": `module.exports = { presets: ["module:metro-react-native-babel-preset"] }`,
      "src/api.ts": `console.log("request", body)`,
    }));
    expect(statusOf(without, "rn_release_logging")).toBe("WARN");
  });
});

describe("React Native — accessibility is a ratio, not a presence test", () => {
  it("does not pass an app with one labelled control out of many", () => {
    // §34.3: presence alone passed an app with 358 hardcoded font sizes and one
    // accessible control. The same mistake is available here.
    const many = Array.from({ length: 20 }, () => `<TouchableOpacity onPress={x} />`).join("\n");
    const checks = evaluateReactNativeChecks(snapshot({
      "package.json": JSON.stringify({ dependencies: { "react-native": "0.86.0" } }),
      "src/Screen.tsx": `${many}\n<Pressable accessibilityLabel="Close" />`,
    }));
    expect(statusOf(checks, "rn_accessibility_labels")).toBe("WARN");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

describe("CLI — supply chain", () => {
  it("warns about install-time lifecycle scripts", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": JSON.stringify({
        name: "tool", bin: { tool: "bin/cli.js" }, scripts: { postinstall: "node scripts/setup.js" },
      }),
    }));
    expect(statusOf(checks, "cli_install_scripts")).toBe("WARN");
    expect(detailOf(checks, "cli_install_scripts")).toMatch(/supply-chain/i);
  });

  it("does not warn when an install script is declared but empty", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": JSON.stringify({ name: "tool", bin: { tool: "bin/cli.js" }, scripts: { postinstall: "  " } }),
    }));
    expect(statusOf(checks, "cli_install_scripts")).toBe("PASS");
  });

  it("fails a bin name that shadows a system command", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": JSON.stringify({ name: "tool", bin: { node: "bin/cli.js" } }),
    }));
    expect(statusOf(checks, "cli_bin_name_safe")).toBe("FAIL");
  });

  it("accepts a namespaced bin name", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": JSON.stringify({ name: "tool", bin: { "acme-tool": "bin/cli.js" } }),
    }));
    expect(statusOf(checks, "cli_bin_name_safe")).toBe("PASS");
  });
});

describe("CLI — bin shebang", () => {
  it("fails a bin entry with no shebang", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": JSON.stringify({ name: "tool", bin: { tool: "bin/cli.js" } }),
      "bin/cli.js": `const run = require("../lib");\nrun();`,
    }));
    expect(statusOf(checks, "cli_bin_shebang")).toBe("FAIL");
  });

  it("passes a bin entry that has one", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": JSON.stringify({ name: "tool", bin: { tool: "bin/cli.js" } }),
      "bin/cli.js": `#!/usr/bin/env node\nrequire("../lib")();`,
    }));
    expect(statusOf(checks, "cli_bin_shebang")).toBe("PASS");
  });

  it("says NOTHING when the bin file was not read", () => {
    // A bin pointing at uncommitted build output is normal. Reporting "missing
    // shebang" there would be exactly the "we could not look" → "it isn't there"
    // failure this codebase keeps finding.
    const checks = evaluateCliChecks(snapshot({
      "package.json": JSON.stringify({ name: "tool", bin: { tool: "dist/cli.js" } }),
    }));
    expect(statusOf(checks, "cli_bin_shebang")).toBeUndefined();
  });

  it("normalises both bin spellings", () => {
    expect(binEntries({ name: "@scope/tool", bin: "./cli.js" })).toEqual([{ name: "tool", path: "./cli.js" }]);
    expect(binEntries({ bin: { a: "x.js", b: "y.js" } })).toHaveLength(2);
  });
});

describe("CLI — interface contract", () => {
  it("warns when nothing sets a non-zero exit code", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": JSON.stringify({ name: "tool", bin: { tool: "bin/cli.js" } }),
      "bin/cli.js": `#!/usr/bin/env node\nconsole.log("done")`,
    }));
    expect(statusOf(checks, "cli_exit_codes")).toBe("WARN");
  });

  it("passes when failure paths exit non-zero", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": JSON.stringify({ name: "tool", bin: { tool: "bin/cli.js" } }),
      "bin/cli.js": `#!/usr/bin/env node\nif (bad) { console.error("nope"); process.exit(1); }`,
    }));
    expect(statusOf(checks, "cli_exit_codes")).toBe("PASS");
    expect(statusOf(checks, "cli_stderr_for_errors")).toBe("PASS");
  });

  it("flags exec() built from a template string as a shell-injection risk", () => {
    const checks = evaluateCliChecks(snapshot({
      "package.json": JSON.stringify({ name: "tool", bin: { tool: "bin/cli.js" } }),
      "bin/cli.js": "#!/usr/bin/env node\nconst { exec } = require('child_process');\nexec(`git clone ${url}`)",
    }));
    expect(statusOf(checks, "cli_shell_injection")).toBe("WARN");
  });

  it("returns nothing for a repo with no package.json", () => {
    expect(evaluateCliChecks(snapshot({ "src/main.rs": "fn main() {}" }))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM COVERAGE — the dropdown selection, reflected
// ─────────────────────────────────────────────────────────────────────────────

describe("platform coverage", () => {
  it("says nothing for a web-shaped selection", () => {
    for (const p of ["WEB_APP", "SAAS", "MARKETING_SITE", "OTHER", ""]) {
      expect(buildPlatformCoverageCheck({ selectedPlatform: p, inputType: "URL", detectedShape: null })).toBeNull();
    }
  });

  it("explains that a URL scan cannot run the source-based family", () => {
    const check = buildPlatformCoverageCheck({
      selectedPlatform: "IOS_APP", inputType: "URL", detectedShape: null,
    })!;
    // SKIPPED, not FAIL: scanning a URL is legitimate, and the score must not
    // punish a project for how it was scanned.
    expect(check.status).toBe("SKIPPED");
    expect(check.detail).toMatch(/GitHub repo/i);
  });

  it("passes when the repo matches the selection", () => {
    const check = buildPlatformCoverageCheck({
      selectedPlatform: "DESKTOP_APP", inputType: "GITHUB_REPO", detectedShape: "electron",
    })!;
    expect(check.status).toBe("PASS");
  });

  it("warns — and names both — when the repo is a different shape", () => {
    const check = buildPlatformCoverageCheck({
      selectedPlatform: "IOS_APP", inputType: "GITHUB_REPO", detectedShape: "cli",
    })!;
    expect(check.status).toBe("WARN");
    expect(check.detail).toMatch(/detection wins over the dropdown/i);
    expect(check.evidence).toBe("selected IOS_APP, detected cli");
  });

  it("treats Flutter and React Native as equivalent for the cross-platform entry", () => {
    for (const shape of ["flutter", "react-native"] as const) {
      expect(buildPlatformCoverageCheck({
        selectedPlatform: "CROSS_PLATFORM_MOBILE", inputType: "GITHUB_REPO", detectedShape: shape,
      })!.status).toBe("PASS");
    }
  });
});
