import { describe, it, expect } from "vitest";
import { evaluateIosExtendedChecks, stripSwiftComments } from "../ios-app-extended";
import { evaluateAndroidExtendedChecks, stripJvmComments } from "../android-app-extended";
import { evaluateCrossPlatformExtendedChecks } from "../cross-platform-extended";
import { evaluateBackendServiceChecks, pySetting } from "../backend-service";
import { evaluateDesktopExtendedChecks } from "../desktop-app-extended";
import { evaluateExtensionExtendedChecks } from "../chrome-extension-extended";
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

const at = (checks: PulseScanCheckInput[], key: string) => {
  const c = checks.find((x) => x.checkKey === key);
  if (!c) throw new Error(`no check emitted for ${key}`);
  return c;
};

// ─── Comment stripping: the bug that has silently killed a check three times ──
describe("comment stripping preserves string literals", () => {
  it("Swift: a URL inside a literal is not truncated at its //", () => {
    const out = stripSwiftComments('let u = "https://api.example.com/v1" // trailing\n');
    expect(out).toContain("https://api.example.com/v1");
    expect(out).not.toContain("trailing");
  });

  it("Kotlin/Java: single-quoted char literals do not unbalance the scanner", () => {
    const out = stripJvmComments("val sep = '/'; val u = \"https://x.dev/a\" // c\n");
    expect(out).toContain("https://x.dev/a");
    expect(out).not.toContain("// c");
  });
});

// ─── iOS extended ────────────────────────────────────────────────────────────
describe("iOS extended", () => {
  const base = { "A.swift": "import UIKit\n" };

  it("skips everything when there is no Swift at all", () => {
    const checks = evaluateIosExtendedChecks(snap({ "README.md": "x" }));
    expect(checks.every((c) => c.status === "SKIPPED")).toBe(true);
  });

  it("fails a WebView that grants remote content file access", () => {
    const s = snap(
      { "W.swift": 'let c = WKWebViewConfiguration()\nc.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")\n' },
      ["W.swift"],
    );
    expect(at(evaluateIosExtendedChecks(s), "ios_x_webview_file_access").status).toBe("FAIL");
  });

  it("warns on synchronous network I/O", () => {
    const s = snap({ "N.swift": 'let d = try? Data(contentsOf: URL(string: "https://a.dev")!)\n' }, ["N.swift"]);
    expect(at(evaluateIosExtendedChecks(s), "ios_x_main_thread_io").status).toBe("WARN");
  });

  it("stays quiet on async networking", () => {
    const s = snap({ "N.swift": "let (d, _) = try await URLSession.shared.data(from: url)\n" }, ["N.swift"]);
    expect(at(evaluateIosExtendedChecks(s), "ios_x_main_thread_io").status).toBe("PASS");
  });

  it("marks an absence LOW-confidence when the sample is thin", () => {
    // One file read out of twenty — an absence finding here is not evidence.
    const s = snap(base, Array.from({ length: 19 }, (_, i) => `Other${i}.swift`));
    const check = at(evaluateIosExtendedChecks(s), "ios_x_url_scheme_validation");
    if (check.status !== "PASS" && check.status !== "SKIPPED") {
      expect(check.confidence).toBe("LOW");
    }
  });
});

// ─── Android extended ────────────────────────────────────────────────────────
describe("Android extended", () => {
  it("fails a mutable PendingIntent", () => {
    const s = snap(
      {
        "AndroidManifest.xml": "<manifest/>",
        "A.kt": "val p = PendingIntent.getActivity(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT)\n",
      },
      ["A.kt"],
    );
    expect(at(evaluateAndroidExtendedChecks(s), "android_x_pending_intent_mutable").status).toBe("FAIL");
  });

  it("passes when FLAG_IMMUTABLE is set", () => {
    const s = snap(
      {
        "AndroidManifest.xml": "<manifest/>",
        "A.kt": "val p = PendingIntent.getActivity(ctx, 0, i, PendingIntent.FLAG_IMMUTABLE)\n",
      },
      ["A.kt"],
    );
    expect(at(evaluateAndroidExtendedChecks(s), "android_x_pending_intent_mutable").status).toBe("PASS");
  });

  it("fails committed signing credentials", () => {
    const s = snap({
      "AndroidManifest.xml": "<manifest/>",
      "build.gradle": 'signingConfigs { release { storePassword "hunter2" } }',
    });
    expect(at(evaluateAndroidExtendedChecks(s), "android_x_signing_config_committed").status).toBe("FAIL");
  });

  it("passes backup when it is explicitly disabled", () => {
    const s = snap({ "AndroidManifest.xml": '<application android:allowBackup="false"/>' });
    expect(at(evaluateAndroidExtendedChecks(s), "android_x_allow_backup").status).toBe("PASS");
  });
});

// ─── Cross-platform extended ─────────────────────────────────────────────────
describe("cross-platform extended", () => {
  it("warns on an unsigned OTA channel", () => {
    const s = snap({ "package.json": '{"dependencies":{"react-native-code-push":"^8"}}', "a.ts": "x" }, ["a.ts"]);
    expect(
      at(evaluateCrossPlatformExtendedChecks(s, "react-native"), "xp_ota_updates_signed").status,
    ).toBe("WARN");
  });

  it("skips OTA checks when no OTA mechanism exists", () => {
    const s = snap({ "package.json": "{}", "a.ts": "const x = 1;\n" }, ["a.ts"]);
    expect(at(evaluateCrossPlatformExtendedChecks(s, "react-native"), "xp_ota_updates_signed").status).toBe("SKIPPED");
  });

  it("warns when version numbers diverge between platforms", () => {
    const s = snap(
      {
        "pubspec.yaml": "version: 1.4.0\n",
        "Info.plist": "<key>CFBundleShortVersionString</key>\n<string>1.2.0</string>",
        "main.dart": "void main() {}\n",
      },
      ["main.dart"],
    );
    expect(at(evaluateCrossPlatformExtendedChecks(s, "flutter"), "xp_platform_parity_version").status).toBe("WARN");
  });

  it("does not penalise Dart asserts, which the compiler strips in release", () => {
    const s = snap({ "main.dart": "void main() { assert(true); }\n" }, ["main.dart"]);
    expect(at(evaluateCrossPlatformExtendedChecks(s, "flutter"), "xp_release_assertions").status).toBe("PASS");
  });
});

// ─── Backend service ─────────────────────────────────────────────────────────
describe("backend service", () => {
  it("pySetting returns null when the value comes from the environment", () => {
    expect(pySetting('DEBUG = os.environ.get("DEBUG", False)', "DEBUG")).toBeNull();
    expect(pySetting("DEBUG = True", "DEBUG")).toBe("True");
  });

  it("fails a committed Django DEBUG = True", () => {
    const s = snap({ "settings.py": "DEBUG = True\n", "manage.py": "x" });
    expect(at(evaluateBackendServiceChecks(s), "svc_django_debug").status).toBe("FAIL");
  });

  it("does NOT fail Django DEBUG when it is read from the environment", () => {
    // The discriminating case: the correct pattern must not be graded as the
    // insecure default, or the check fires on every well-built Django project.
    const s = snap({ "settings.py": 'DEBUG = os.getenv("DEBUG") == "1"\n', "manage.py": "x" });
    expect(at(evaluateBackendServiceChecks(s), "svc_django_debug").status).toBe("PASS");
  });

  it("fails a wildcard-plus-credentials CORS configuration", () => {
    const s = snap({ "server.ts": 'cors({ origin: "*", credentials: true })\n', "package.json": '{"dependencies":{"express":"^4"}}' });
    expect(at(evaluateBackendServiceChecks(s), "svc_cors_wildcard").status).toBe("FAIL");
  });

  it("stays quiet on a wildcard origin WITHOUT credentials", () => {
    const s = snap({ "server.ts": 'cors({ origin: "*" })\n', "package.json": '{"dependencies":{"express":"^4"}}' });
    expect(at(evaluateBackendServiceChecks(s), "svc_cors_wildcard").status).toBe("PASS");
  });

  it("skips Django checks entirely for a Node service", () => {
    const s = snap({ "package.json": '{"dependencies":{"express":"^4"}}', "server.ts": "x" });
    expect(at(evaluateBackendServiceChecks(s), "svc_django_debug").status).toBe("SKIPPED");
  });

  it("fails a wildcard Spring actuator exposure", () => {
    const s = snap({
      "application.properties": "management.endpoints.web.exposure.include=*\n",
      "pom.xml": "<project/>",
    });
    expect(at(evaluateBackendServiceChecks(s), "svc_spring_actuator_exposure").status).toBe("FAIL");
  });

  it("treats a placeholder in .env.example as fine", () => {
    const s = snap({ ".env.example": "API_SECRET=your-secret-here\n", "package.json": '{"dependencies":{"express":"^4"}}' });
    expect(at(evaluateBackendServiceChecks(s), "svc_env_example_no_secrets").status).toBe("PASS");
  });
});

// ─── Desktop extended ────────────────────────────────────────────────────────
describe("desktop extended", () => {
  it("fails an updater with no signature verification", () => {
    const s = snap({ "main.ts": "import { autoUpdater } from 'electron-updater';\nautoUpdater.checkForUpdates();\n" });
    expect(at(evaluateDesktopExtendedChecks(s, "electron"), "desk_x_update_signature").status).toBe("FAIL");
  });

  it("skips the updater check when there is no updater", () => {
    const s = snap({ "main.ts": "const w = new BrowserWindow({});\n" });
    expect(at(evaluateDesktopExtendedChecks(s, "electron"), "desk_x_update_signature").status).toBe("SKIPPED");
  });

  it("fails use of the removed remote module", () => {
    const s = snap({ "main.ts": "require('@electron/remote/main').initialize();\n" });
    expect(at(evaluateDesktopExtendedChecks(s, "electron"), "desk_x_remote_module").status).toBe("FAIL");
  });

  it("does not apply Electron-only checks to a Tauri app", () => {
    const s = snap({ "main.rs": "fn main() {}\n" });
    expect(at(evaluateDesktopExtendedChecks(s, "tauri"), "desk_x_remote_module").status).toBe("SKIPPED");
  });
});

// ─── Extension extended ──────────────────────────────────────────────────────
describe("browser extension extended", () => {
  const mf = (extra: Record<string, unknown>) =>
    JSON.stringify({ manifest_version: 3, name: "x", version: "1.0.0", ...extra });

  it("fails externally_connectable open to every URL", () => {
    const s = snap({ "manifest.json": mf({ externally_connectable: { matches: ["*://*/*"] } }) });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_external_connectable").status).toBe("FAIL");
  });

  it("skips it when no external origins are declared", () => {
    const s = snap({ "manifest.json": mf({}) });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_external_connectable").status).toBe("SKIPPED");
  });

  it("fails an invalid store version string", () => {
    const s = snap({ "manifest.json": mf({ version: "1.0.0-beta" }) });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_version_scheme").status).toBe("FAIL");
  });

  it("passes a valid version and full icon set", () => {
    const s = snap({ "manifest.json": mf({ icons: { "16": "a", "48": "b", "128": "c" } }) });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_version_scheme").status).toBe("PASS");
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_icons_complete").status).toBe("PASS");
  });

  it("warns when data permissions are requested with no privacy policy", () => {
    const s = snap({ "manifest.json": mf({ permissions: ["cookies", "history"] }) });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_privacy_policy").status).toBe("WARN");
  });

  it("skips the privacy-policy requirement when no user data is touched", () => {
    const s = snap({ "manifest.json": mf({ permissions: ["alarms"] }) });
    expect(at(evaluateExtensionExtendedChecks(s), "ext_x_privacy_policy").status).toBe("SKIPPED");
  });
});
