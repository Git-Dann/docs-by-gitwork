import { describe, it, expect } from "vitest";
import {
  applyNativeApplicability,
  detectNativePlatform,
  isNativeMobile,
  isVendoredPath,
  nativeSkipReason,
  nativeTechStack,
  NATIVE_INAPPLICABLE_CHECKS,
  FLUTTER_INAPPLICABLE_CHECKS,
} from "../native-mobile";
import { selectFilesToRead, swiftRelevance } from "../native-repo";
import { CHECKS_REGISTRY } from "../../checks-registry";

// ─────────────────────────────────────────────────────────────────────────────
// Platform detection + the applicability layer that stops a Swift project being
// marked down for having no tsconfig. Pure functions, so tested directly.
// ─────────────────────────────────────────────────────────────────────────────

const IOS_PATHS = [
  "MyApp.xcodeproj/project.pbxproj",
  "MyApp/Info.plist",
  "MyApp/AppDelegate.swift",
  "Podfile",
];

describe("detectNativePlatform", () => {
  it("detects a native iOS project from an Xcode project", () => {
    expect(detectNativePlatform(IOS_PATHS)).toBe("ios");
  });

  it("detects native iOS from Swift sources beside an Info.plist (no xcodeproj in tree)", () => {
    expect(detectNativePlatform(["App/Info.plist", "App/Main.swift"])).toBe("ios");
  });

  it("detects native Android from Gradle + a manifest", () => {
    expect(
      detectNativePlatform(["app/build.gradle.kts", "app/src/main/AndroidManifest.xml", "app/src/Main.kt"]),
    ).toBe("android");
  });

  // The trap: RN and Flutter projects CONTAIN ios/ and android/ folders with real
  // Info.plist and AndroidManifest.xml files. Matched naively, every RN app reads as
  // native iOS and gets the wrong check family plus the wrong skips.
  it("classifies React Native as react-native, not ios, despite an ios/ folder", () => {
    const paths = [
      "package.json",
      "metro.config.js",
      "ios/MyApp/Info.plist",
      "ios/MyApp.xcodeproj/project.pbxproj",
      "android/app/build.gradle",
      "android/app/src/main/AndroidManifest.xml",
    ];
    expect(detectNativePlatform(paths)).toBe("react-native");
  });

  it("classifies Flutter as flutter, not ios, despite an ios/ runner", () => {
    const paths = ["pubspec.yaml", "lib/main.dart", "ios/Runner/Info.plist", "android/app/build.gradle"];
    expect(detectNativePlatform(paths)).toBe("flutter");
  });

  it("returns null for a plain web repo", () => {
    expect(detectNativePlatform(["package.json", "tsconfig.json", "src/index.ts"])).toBeNull();
  });

  it("treats only ios/android as native (RN and Flutter keep the JS/Dart toolchain)", () => {
    expect(isNativeMobile("ios")).toBe(true);
    expect(isNativeMobile("android")).toBe(true);
    expect(isNativeMobile("react-native")).toBe(false);
    expect(isNativeMobile("flutter")).toBe(false);
    expect(isNativeMobile(null)).toBe(false);
  });
});

describe("applyNativeApplicability", () => {
  const generic = [
    { checkKey: "has_typescript", status: "FAIL", detail: "No tsconfig.json found." },
    { checkKey: "has_linter", status: "WARN", detail: "No ESLint config found." },
    { checkKey: "dockerfile_present", status: "WARN", detail: "No Dockerfile." },
    { checkKey: "has_readme", status: "FAIL", detail: "No README.md found." },
    { checkKey: "has_gitignore", status: "FAIL", detail: "No .gitignore." },
  ];

  it("skips toolchain-mismatched checks for a native repo, with a reason", () => {
    const out = applyNativeApplicability(generic, "ios");
    const byKey = new Map(out.map((c) => [c.checkKey, c]));

    expect(byKey.get("has_typescript")!.status).toBe("SKIPPED");
    expect(byKey.get("has_linter")!.status).toBe("SKIPPED");
    expect(byKey.get("dockerfile_present")!.status).toBe("SKIPPED");
    // Every skip must explain itself — a silent skip is indistinguishable from a bug.
    expect(byKey.get("has_typescript")!.detail).toMatch(/Swift|Kotlin/);
  });

  it("leaves checks that still apply to a native repo alone", () => {
    const out = applyNativeApplicability(generic, "ios");
    const byKey = new Map(out.map((c) => [c.checkKey, c]));
    // README and .gitignore are true findings for any repo — they must survive.
    expect(byKey.get("has_readme")!.status).toBe("FAIL");
    expect(byKey.get("has_gitignore")!.status).toBe("FAIL");
  });

  it("is a no-op for a plain web repo", () => {
    expect(applyNativeApplicability(generic, null)).toEqual(generic);
  });

  // React Native genuinely IS a JavaScript project, so its skip list is the
  // shortest of the three and this test's job is to prove it stays that way. The
  // JS toolchain checks must SURVIVE — skipping has_typescript or has_linter for
  // RN would hide real findings, since an RN app really does have a tsconfig and
  // really should have a linter.
  it("keeps the JS toolchain checks for a React Native repo", () => {
    const out = applyNativeApplicability(generic, "react-native");
    const byKey = new Map(out.map((c) => [c.checkKey, c]));

    expect(byKey.get("has_typescript")!.status).not.toBe("SKIPPED");
    expect(byKey.get("has_linter")!.status).not.toBe("SKIPPED");
    expect(byKey.get("has_readme")!.status).toBe("FAIL");
    expect(byKey.get("has_gitignore")!.status).toBe("FAIL");
  });

  it("skips only the server-shaped checks for a React Native repo", () => {
    const withServerChecks = [
      ...generic,
      { checkKey: "dockerfile_present", status: "FAIL", detail: "No Dockerfile." },
      { checkKey: "has_migrations", status: "WARN", detail: "No migrations." },
    ];
    const byKey = new Map(
      applyNativeApplicability(withServerChecks, "react-native").map((c) => [c.checkKey, c]),
    );

    expect(byKey.get("dockerfile_present")!.status).toBe("SKIPPED");
    expect(byKey.get("has_migrations")!.status).toBe("SKIPPED");
    // Every skip must explain itself — a silent skip is indistinguishable from a bug.
    expect(byKey.get("dockerfile_present")!.detail).toMatch(/store binary/i);
  });

  it("applies a Dart-shaped skip list to Flutter repos", () => {
    const out = applyNativeApplicability(
      [...generic, { checkKey: "has_tests", status: "WARN", detail: "No test directory detected." }],
      "flutter",
    );
    const byKey = new Map(out.map((c) => [c.checkKey, c]));

    expect(byKey.get("has_typescript")!.status).toBe("SKIPPED");
    expect(byKey.get("has_linter")!.status).toBe("SKIPPED");
    expect(byKey.get("has_typescript")!.detail).toMatch(/Dart/);

    // The Flutter-vs-native difference that makes this a separate list: a Flutter
    // project really does keep a top-level test/ folder, so has_tests still applies.
    expect(byKey.get("has_tests")!.status).toBe("WARN");
    expect(byKey.get("has_readme")!.status).toBe("FAIL");
  });

  it("every Flutter inapplicable key is a real registered check", () => {
    const registered = new Set(CHECKS_REGISTRY.map((c) => c.key));
    for (const key of FLUTTER_INAPPLICABLE_CHECKS.keys()) {
      expect(registered.has(key), `"${key}" is not in CHECKS_REGISTRY`).toBe(true);
    }
  });

  it("never skips a check it has no reason for", () => {
    expect(nativeSkipReason("has_readme", "ios")).toBeUndefined();
    expect(nativeSkipReason("has_typescript", null)).toBeUndefined();
  });

  // Drift guard: an entry naming a check that no longer exists would silently stop
  // skipping anything, and the scoring bug would come back unnoticed.
  it("every inapplicable key is a real registered check", () => {
    const registered = new Set(CHECKS_REGISTRY.map((c) => c.key));
    for (const key of NATIVE_INAPPLICABLE_CHECKS.keys()) {
      expect(registered.has(key), `"${key}" is not in CHECKS_REGISTRY`).toBe(true);
    }
  });
});

describe("nativeTechStack", () => {
  it("labels an iOS repo that package.json sniffing would report as empty", () => {
    expect(nativeTechStack("ios", IOS_PATHS)).toEqual(
      expect.arrayContaining(["iOS", "Swift", "CocoaPods"]),
    );
  });

  it("distinguishes Kotlin from Java on Android", () => {
    const stack = nativeTechStack("android", ["app/build.gradle.kts", "app/src/Main.kt"]);
    expect(stack).toEqual(expect.arrayContaining(["Android", "Kotlin", "Gradle"]));
    expect(stack).not.toContain("Java");
  });

  it("returns nothing for an unrecognised repo", () => {
    expect(nativeTechStack(null, ["package.json"])).toEqual([]);
  });
});

describe("isVendoredPath", () => {
  it("excludes dependency trees so findings describe the app, not its dependencies", () => {
    expect(isVendoredPath("Pods/Kingfisher/Sources/Image.swift")).toBe(true);
    expect(isVendoredPath("Carthage/Build/x.swift")).toBe(true);
    expect(isVendoredPath("MyApp/Features/Feed/FeedView.swift")).toBe(false);
    // A source file merely mentioning "pods" is not vendored.
    expect(isVendoredPath("MyApp/PodsHelper.swift")).toBe(false);
  });
});

describe("swift sampling", () => {
  it("ranks security-critical files above large view files", () => {
    const apiClient = swiftRelevance("App/Networking/APIClient.swift", 4_000);
    const bigView = swiftRelevance("App/Features/Feed/FeedView.swift", 60_000);
    expect(apiClient).toBeGreaterThan(bigView);
  });

  it("prefers larger files when relevance ties", () => {
    expect(swiftRelevance("App/Views/A.swift", 40_000)).toBeGreaterThan(
      swiftRelevance("App/Views/B.swift", 1_000),
    );
  });

  it("always reads config files and never reads vendored sources", () => {
    const { config, source: swift } = selectFilesToRead([
      { path: "MyApp/Info.plist", size: 2_000 },
      { path: "MyApp/MyApp.entitlements", size: 500 },
      { path: "MyApp.xcodeproj/project.pbxproj", size: 90_000 },
      { path: "Podfile.lock", size: 1_000 },
      { path: "MyApp/Networking/APIClient.swift", size: 8_000 },
      { path: "Pods/Kingfisher/Kingfisher.swift", size: 8_000 },
      { path: "Pods/Target Support Files/Pods-MyApp/Info.plist", size: 900 },
    ]);

    expect(config).toEqual(
      expect.arrayContaining(["MyApp/Info.plist", "MyApp/MyApp.entitlements", "Podfile.lock"]),
    );
    expect(config.some((p) => p.startsWith("Pods/"))).toBe(false);
    expect(swift).toContain("MyApp/Networking/APIClient.swift");
    expect(swift.some((p) => p.startsWith("Pods/"))).toBe(false);
  });

  it("skips blobs too large to be source (generated JSON, bundles)", () => {
    const { source: swift } = selectFilesToRead([{ path: "App/Huge.swift", size: 2_000_000 }]);
    expect(swift).toEqual([]);
  });
});

// ── Platform applicability parity (July 2026) ────────────────────────────────
// Picking "React Native / Flutter" in the scan dropdown used to get 2 of the 5
// category exclusions a native project gets, and NONE of the 15 per-check platform
// guards — so the full web suite ran against a mobile app and buried the real
// findings. CROSS_PLATFORM_MOBILE ships the same store-distributed app, so it must
// be excluded from exactly the same web-shaped checks.
describe("CROSS_PLATFORM_MOBILE has parity with native platforms", () => {
  it("skips the same web-shaped categories as IOS_APP", async () => {
    const { getSkippedCategoriesForPlatformForTest } = await import("../../pulse-scan");
    const ios = getSkippedCategoriesForPlatformForTest("IOS_APP").map((s) => s.category).sort();
    const cross = getSkippedCategoriesForPlatformForTest("CROSS_PLATFORM_MOBILE").map((s) => s.category).sort();
    expect(cross).toEqual(ios);
  });

  it("appears in every guard that skips both native platforms", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = new URL("../", import.meta.url).pathname;

    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(`${dir}${file}`, "utf8");
      for (const line of src.split("\n")) {
        if (!line.includes("platformIs(ctx.platform")) continue;
        if (!line.includes('"IOS_APP"') || !line.includes('"ANDROID_APP"')) continue;
        if (!line.includes("CROSS_PLATFORM_MOBILE")) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders, "these guards skip native but not cross-platform mobile").toEqual([]);
  });
});
