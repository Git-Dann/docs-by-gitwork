// @vitest-environment node
/**
 * Defects found by the October 2026 corpus run, each one a scan naming the wrong
 * subject or grading a subject it never read. Every fixture is the real shape of the
 * input that produced the defect.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAppStoreListing } from "@/server/pulse-checks/store-listing";
import { computeScoreBreakdown } from "@/server/pulse-checks/score-breakdown";
import { evaluateReleaseGate, resolveGatePolicy } from "@/server/pulse-checks/release-decision";
import { detectNativePlatform } from "@/server/pulse-checks/native-mobile";
import { describeScanSubject, storeSubjectLabel } from "@/lib/pulse-store-url";
import { CATEGORIES } from "@/server/pulse-checks/categories";
import type { PulseScanCheckInput } from "@/types/pulse";

const iosHtml = readFileSync(join(__dirname, "../pulse-checks/__tests__/fixtures/app-store-beyond-nutrition.html"), "utf8");

describe("a Mac App Store listing is reported as a Mac app, not an iOS app", () => {
  it("an iPhone listing is not macOnly", () => {
    expect(parseAppStoreListing(iosHtml)?.macOnly).toBe(false);
  });

  it("a listing whose operating system is macOS is macOnly", () => {
    // Same page, the store's own operatingSystem field set to what Xcode's listing says.
    const mac = iosHtml.replace(/"operatingSystem"\s*:\s*"[^"]*"/, '"operatingSystem":"MACOS 15.6 or later"');
    expect(mac).not.toBe(iosHtml);
    expect(parseAppStoreListing(mac)?.macOnly).toBe(true);
  });

  it("labels the subject and the gate as a Mac app", () => {
    const url = "https://apps.apple.com/gb/app/xcode/id497799835";
    expect(storeSubjectLabel("app_store", "DESKTOP_APP")).toBe("Mac app · Mac App Store listing");
    expect(describeScanSubject(url, "DESKTOP_APP")).toBe("Mac app · Mac App Store listing");
    expect(resolveGatePolicy({ targetUrl: url, platform: "DESKTOP_APP" }).label).toBe("Mac app · Mac App Store listing");
  });

  it("leaves an iPhone listing labelled as an iOS app", () => {
    const url = "https://apps.apple.com/gb/app/x/id1";
    expect(describeScanSubject(url, "IOS_APP")).toBe("iOS app · App Store listing");
    expect(resolveGatePolicy({ targetUrl: url, platform: "IOS_APP" }).label).not.toMatch(/Mac/);
  });
});

const check = (over: Partial<PulseScanCheckInput> & { checkKey: string; status: PulseScanCheckInput["status"] }): PulseScanCheckInput =>
  ({ category: CATEGORIES.SECURITY, label: over.checkKey, detail: "", severity: "MEDIUM", confidence: "HIGH", ...over }) as PulseScanCheckInput;

describe("a repository Pulse could not read gets no score and no verdict", () => {
  // A rate-limited token reads nothing, yet the generic checks it COULD run (a readme
  // check, say) passed — and the scan reported 80/100 and READY.
  const passing = [check({ checkKey: "has_readme", status: "PASS" }), check({ checkKey: "has_license", status: "PASS" })];

  for (const status of ["FAIL", "INCONCLUSIVE"] as const) {
    it(`caps the score at 0 when repo_accessible is ${status}`, () => {
      const b = computeScoreBreakdown([check({ checkKey: "repo_accessible", status, detail: "GitHub rate limit reached." }), ...passing]);
      expect(b.finalScore).toBe(0);
    });
  }

  it("reports the gate as INCONCLUSIVE with the reason, never READY", () => {
    const checks = [check({ checkKey: "repo_accessible", status: "FAIL", detail: "GitHub rate limit reached. Retry later." }), ...passing];
    const g = evaluateReleaseGate(checks, { finalScore: 0, completeness: 1 }, resolveGatePolicy({ inputType: "GITHUB_REPO" }));
    expect(g.decision).not.toBe("READY");
    const reason = g.unverified.find((r) => r.code === "SUBJECT_UNREADABLE");
    expect(reason?.summary).toMatch(/could not be read/);
    expect(reason?.summary).not.toMatch(/\.\.$/);
  });

  it("does not add the reason when the repository was read", () => {
    const g = evaluateReleaseGate(
      [check({ checkKey: "repo_accessible", status: "PASS" }), ...passing],
      { finalScore: 90, completeness: 1 },
      resolveGatePolicy({ inputType: "GITHUB_REPO" }),
    );
    expect(g.unverified.map((r) => r.code)).not.toContain("SUBJECT_UNREADABLE");
  });
});

describe("a repo with both iOS and Android markers is judged by where its code is", () => {
  const androidCore = [
    "build.gradle", "app/build.gradle", "app/src/main/AndroidManifest.xml",
    ...Array.from({ length: 40 }, (_, i) => `app/src/main/java/org/schabi/newpipe/F${i}.java`),
    ...Array.from({ length: 10 }, (_, i) => `app/src/main/kotlin/K${i}.kt`),
  ];

  it("NewPipe — Android with two Swift helpers and an Info.plist — is Android", () => {
    expect(detectNativePlatform([...androidCore, "tools/a.swift", "tools/b.swift", "tools/Info.plist"])).toBe("android");
  });

  it("an iOS app with a small Android shim stays iOS", () => {
    const ios = ["App.xcodeproj/project.pbxproj", ...Array.from({ length: 60 }, (_, i) => `App/V${i}.swift`), "App/Info.plist"];
    expect(detectNativePlatform([...ios, "shim/build.gradle", "shim/AndroidManifest.xml", "shim/Main.kt"])).toBe("ios");
  });

  it("does not count Gradle Kotlin build scripts as Android source", () => {
    const ios = ["App.xcodeproj/project.pbxproj", "App/A.swift", "App/B.swift", "App/Info.plist"];
    const scripts = ["build.gradle.kts", "a/build.gradle.kts", "b/build.gradle.kts", "app/AndroidManifest.xml"];
    expect(detectNativePlatform([...ios, ...scripts])).toBe("ios");
  });
});

describe("repo shape: what the repo ships, not what it demonstrates", () => {
  // Real paths from the October 2026 corpus run (trees read with the GitHub API).
  it("cal.com — a Heroku app.json beside a web package.json is not React Native", () => {
    const paths = ["package.json", "app.json", "apps/web/package.json", "apps/web/next.config.js"];
    const pkg = '{"name":"calcom-monorepo","devDependencies":{"turbo":"^1"}}';
    expect(detectNativePlatform(paths, pkg)).toBeNull();
  });

  it("an Expo app (app.json + an expo dependency) is still React Native", () => {
    const paths = ["package.json", "app.json", "App.tsx"];
    expect(detectNativePlatform(paths, '{"dependencies":{"expo":"~51.0.0","react-native":"0.74.0"}}')).toBe("react-native");
  });

  it("supabase — Flutter and Expo projects under examples/ do not make the repo a mobile app", () => {
    const paths = [
      "package.json", "apps/studio/package.json",
      "examples/auth/expo-social-auth/app.json",
      "examples/auth/flutter-mfa/android/app/build.gradle",
      "examples/auth/flutter-mfa/android/app/src/main/AndroidManifest.xml",
      "examples/auth/flutter-mfa/ios/Runner.xcodeproj/project.pbxproj",
      "examples/auth/flutter-mfa/ios/Runner/Info.plist",
      "examples/auth/flutter-mfa/pubspec.yaml",
    ];
    expect(detectNativePlatform(paths, '{"name":"supabase"}')).toBeNull();
  });

  it("immich — a Flutter app kept in mobile/ is Flutter, not native Android", () => {
    const paths = [
      "mobile/android/app/build.gradle", "mobile/android/app/src/main/AndroidManifest.xml", "mobile/android/build.gradle",
      "mobile/ios/Runner.xcodeproj/project.pbxproj", "mobile/ios/Runner/Info.plist",
      "mobile/packages/ui/pubspec.yaml", "mobile/pubspec.yaml", "native/native_core/pubspec.yaml",
      "server/package.json",
    ];
    expect(detectNativePlatform(paths)).toBe("flutter");
  });

  it("a nested pubspec without its own android/ios folder is a Dart package, not an app", () => {
    expect(detectNativePlatform(["packages/ui/pubspec.yaml", "server/main.go"])).toBeNull();
  });
});

describe("Electron pinned by electronVersion (atom/atom)", () => {
  it("is a desktop app", async () => {
    const { detectProjectShape } = await import("@/server/pulse-checks/project-shape");
    expect(detectProjectShape(["package.json", "src/main-process/atom-application.js"], '{"name":"atom","electronVersion":"11.5.0"}')).toBe("electron");
  });
});

describe("generic repo kind ignores tooling and examples", () => {
  it("cli/cli — an index.html under .github/ does not make a Go CLI a web app", async () => {
    const { classifyGenericRepo } = await import("@/server/pulse-checks/repo-kind");
    const paths = ["go.mod", "cmd/gh/main.go", ".github/extensions/terminal-mockup/assets/index.html", "docs/index.html"];
    expect(classifyGenericRepo(paths, new Map())).toBe("none");
  });
  it("a real index.html at the root is still a web app", async () => {
    const { classifyGenericRepo } = await import("@/server/pulse-checks/repo-kind");
    expect(classifyGenericRepo(["index.html", "src/main.js"], new Map())).toBe("web");
  });
});
