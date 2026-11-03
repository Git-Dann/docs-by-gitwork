import { describe, it, expect } from "vitest";
import { evaluateIosExtendedChecks } from "../ios-app-extended";
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

const swift = { "iOS/AppDelegate.swift": "import UIKit\n" };

describe("ios_x_crash_symbols", () => {
  const pbxNoSetting =
    "/* Begin XCBuildConfiguration section */\n\t\t51C451B4 /* Release */ = {\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbaseConfigurationReference = 51C451B7 /* NetNewsWire_project_release.xcconfig */;\n\t\t\tbuildSettings = {\n\t\t\t};\n\t\t\tname = Release;\n\t\t};\n";

  it("passes when dwarf-with-dsym is set in a read .xcconfig (NetNewsWire)", () => {
    const s = snap({
      ...swift,
      "NetNewsWire.xcodeproj/project.pbxproj": pbxNoSetting,
      "xcconfig/NetNewsWire_project_release.xcconfig":
        '#include "./NetNewsWire_project.xcconfig"\n\nDEBUG_INFORMATION_FORMAT = dwarf-with-dsym\n',
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_crash_symbols").status).toBe("PASS");
  });

  it("does not WARN when .xcconfig files exist but were not read", () => {
    const s = snap({ ...swift, "NetNewsWire.xcodeproj/project.pbxproj": pbxNoSetting }, [
      "xcconfig/NetNewsWire_project_release.xcconfig",
    ]);
    const c = at(evaluateIosExtendedChecks(s), "ios_x_crash_symbols");
    expect(c.status).toBe("INCONCLUSIVE");
    expect(c.detail).not.toMatch(/is not set to dwarf-with-dsym/);
  });

  it("still warns when the only unread xcconfigs are vendored CocoaPods files", () => {
    const s = snap({ ...swift, "App.xcodeproj/project.pbxproj": pbxNoSetting }, [
      "Pods/Target Support Files/Pods-App/Pods-App.release.xcconfig",
      "Carthage/Build/Foo.xcconfig",
    ]);
    expect(at(evaluateIosExtendedChecks(s), "ios_x_crash_symbols").status).toBe("WARN");
  });

  it("still passes a pbxproj that sets dwarf-with-dsym (kickstarter)", () => {
    const s = snap({
      ...swift,
      "Kickstarter.xcodeproj/project.pbxproj":
        '\t\t\tbuildSettings = {\n\t\t\t\tDEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";\n\t\t\t};\n',
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_crash_symbols").status).toBe("PASS");
  });

  it("still warns when the only project config uses plain dwarf and there are no xcconfigs", () => {
    const s = snap({
      ...swift,
      "App.xcodeproj/project.pbxproj": "\t\t\tbuildSettings = {\n\t\t\t\tDEBUG_INFORMATION_FORMAT = dwarf;\n\t\t\t};\n",
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_crash_symbols").status).toBe("WARN");
  });
});

describe("ios_x_data_protection", () => {
  it("does not pass on an unrelated `.complete` enum case (NetNewsWire)", () => {
    const s = snap({
      "Shared/Widget/WidgetDataEncoder.swift": "try encodedData.write(to: dataURL, options: [.atomic])\n",
      "Shared/Article Extractor/ArticleExtractor.swift": "self.state = .complete\n",
      "iOS/Article/WebViewController.swift": "switch state {\ncase .complete:\n\tbreak\ndefault: break\n}\n",
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_data_protection").status).toBe("WARN");
  });

  it("passes a write that sets .completeFileProtection", () => {
    const s = snap({
      "Store.swift": "try data.write(to: url, options: [.atomic, .completeFileProtection])\n",
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_data_protection").status).toBe("PASS");
  });

  it("passes FileManager attributes with FileProtectionType.complete", () => {
    const s = snap({
      "Store.swift":
        "FileManager.default.createFile(atPath: p, contents: d, attributes: [.protectionKey: FileProtectionType.complete])\n",
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_data_protection").status).toBe("PASS");
  });

  it("passes when the entitlements set an app-wide default protection class", () => {
    const s = snap({
      "Store.swift": "try data.write(to: url)\n",
      "App/App.entitlements":
        "<dict>\n\t<key>com.apple.developer.default-data-protection</key>\n\t<string>NSFileProtectionComplete</string>\n</dict>\n",
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_data_protection").status).toBe("PASS");
  });
});

describe("ios_x_encryption_declaration", () => {
  it("passes the INFOPLIST_KEY_ build-setting form (IceCubesApp)", () => {
    const s = snap({
      ...swift,
      "IceCubesApp/Info.plist": "<dict>\n\t<key>CFBundleURLTypes</key>\n\t<array/>\n</dict>\n",
      "IceCubesApp.xcodeproj/project.pbxproj":
        "\t\t\t\tGENERATE_INFOPLIST_FILE = YES;\n\t\t\t\tINFOPLIST_KEY_ITSAppUsesNonExemptEncryption = NO;\n",
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_encryption_declaration").status).toBe("PASS");
  });

  it("still warns when neither Info.plist nor build settings declare it", () => {
    const s = snap({
      ...swift,
      "App/Info.plist": "<dict>\n\t<key>CFBundleName</key>\n\t<string>App</string>\n</dict>\n",
      "App.xcodeproj/project.pbxproj": "\t\t\t\tGENERATE_INFOPLIST_FILE = YES;\n",
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_encryption_declaration").status).toBe("WARN");
  });
});

describe("ios_x_url_scheme_validation", () => {
  it("recognises host allow-listing via url.host.map (kickstarter Navigation.swift)", () => {
    const s = snap({
      "Kickstarter-iOS/AppDelegate.swift":
        "func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {\n  return self.viewModel.inputs.applicationOpenUrl(url)\n}\n",
      "Library/Navigation.swift":
        "let hostRecognizer = { accum, host in\n  accum || url.host.map { $0.hasPrefix(host) } == .some(true)\n}\nlet isRecognizedHost = recognizedHosts.reduce(false, hostRecognizer)\n",
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_url_scheme_validation").status).toBe("PASS");
  });

  it("still warns when the only host reads are networking logs, not deep-link validation", () => {
    const s = snap({
      "App.swift": "WindowGroup { ContentView() }\n  .onOpenURL { url in\n    router.navigate(to: url)\n  }\n",
      "Networking/Logger.swift":
        "func log(_ request: URLRequest) {\n  print(request.url?.host ?? \"\")\n  if let url = request.url { print(url.host as Any) }\n}\n",
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_url_scheme_validation").status).toBe("WARN");
  });

  it("still warns when an incoming URL is acted on with no inspection", () => {
    const s = snap({
      "App.swift": "WindowGroup { ContentView() }\n  .onOpenURL { url in\n    router.navigate(to: url)\n  }\n",
    });
    expect(at(evaluateIosExtendedChecks(s), "ios_x_url_scheme_validation").status).toBe("WARN");
  });
});
