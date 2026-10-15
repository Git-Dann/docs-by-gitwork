import { describe, it, expect } from "vitest";
import { evaluateIosChecks } from "../ios-app";
import type { RepoSnapshot } from "../native-mobile";

// Audit packet repo-ios-app-1: fixtures taken from kickstarter/ios-oss,
// Dimillian/IceCubesApp and Ranchero-Software/NetNewsWire as observed.

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

const check = (files: Record<string, string>, key: string) =>
  evaluateIosChecks(snapshot(files)).find((c) => c.checkKey === key)!;

const PLIST = String.raw`<plist><dict>
  <key>CFBundleIdentifier</key><string>com.example.app</string>
</dict></plist>`;

describe("ios_aps_environment", () => {
  it("does not warn when Debug is development and Release is production (kickstarter)", () => {
    const c = check(
      {
        "Kickstarter-iOS/Debug.entitlements": `<plist><dict>\n\t<key>aps-environment</key>\n\t<string>development</string>\n</dict></plist>`,
        "Kickstarter-iOS/Release.entitlements": `<plist><dict>\n\t<key>aps-environment</key>\n\t<string>production</string>\n</dict></plist>`,
      },
      "ios_aps_environment",
    );
    expect(c.status).toBe("PASS");
  });

  it("still warns when every entitlements file is development (IceCubesApp)", () => {
    const c = check(
      {
        "IceCubesApp/App/IceCubesApp.entitlements": `<plist><dict>\n\t<key>aps-environment</key>\n\t<string>development</string>\n</dict></plist>`,
        "IceCubesApp/App/IceCubesApp-release.entitlements": `<plist><dict>\n\t<key>aps-environment</key>\n\t<string>development</string>\n</dict></plist>`,
      },
      "ios_aps_environment",
    );
    expect(c.status).toBe("WARN");
  });
});

describe("ios_encryption_declaration", () => {
  it("accepts the INFOPLIST_KEY build setting (IceCubesApp)", () => {
    const c = check(
      {
        "IceCubesApp/Resources/Info.plist": PLIST,
        "IceCubesApp.xcodeproj/project.pbxproj": `\t\t\t\tINFOPLIST_KEY_ITSAppUsesNonExemptEncryption = NO;\n\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;`,
      },
      "ios_encryption_declaration",
    );
    expect(c.status).toBe("PASS");
  });

  it("still warns when neither Info.plist nor build settings declare it", () => {
    const c = check(
      {
        "App/Info.plist": PLIST,
        "App.xcodeproj/project.pbxproj": `\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;`,
      },
      "ios_encryption_declaration",
    );
    expect(c.status).toBe("WARN");
  });
});

describe("ios_ats_arbitrary_loads", () => {
  it("keeps FAIL for NSAllowsArbitraryLoads but no longer claims invalid certificates are accepted (NetNewsWire)", () => {
    const c = check(
      {
        "iOS/Resources/Info.plist": `<plist><dict>\n\t<key>NSAppTransportSecurity</key>\n\t<dict>\n\t\t<key>NSAllowsArbitraryLoads</key>\n\t\t<true/>\n\t</dict>\n</dict></plist>`,
      },
      "ios_ats_arbitrary_loads",
    );
    expect(c.status).toBe("FAIL");
    expect(c.detail).not.toMatch(/invalid certificates/i);
    expect(c.detail).toMatch(/certificate validation still applies/i);
  });

  it("still WARNs on an insecure exception domain (kickstarter ksr.test)", () => {
    const c = check(
      {
        "Kickstarter-iOS/Info.plist": `<plist><dict><key>NSAppTransportSecurity</key><dict><key>NSExceptionDomains</key><dict>\n\t\t\t<key>ksr.test</key>\n\t\t\t<dict>\n\t\t\t\t<key>NSExceptionAllowsInsecureHTTPLoads</key>\n\t\t\t\t<true/>\n\t\t\t\t<key>NSIncludesSubdomains</key>\n\t\t\t\t<true/>\n\t\t\t</dict></dict></dict></dict></plist>`,
      },
      "ios_ats_arbitrary_loads",
    );
    expect(c.status).toBe("WARN");
  });
});

describe("ios_keychain_accessibility", () => {
  it("recognises KeychainSwift withAccess: .accessibleAfterFirstUnlock (IceCubesApp)", () => {
    const c = check(
      {
        "Packages/AppAccount/Sources/AppAccount/AppAccount.swift": String.raw`import KeychainSwift

public struct AppAccount: Codable {
  private static var keychain: KeychainSwift {
    let keychain = KeychainSwift()
    keychain.accessGroup = AppInfo.keychainGroup
    return keychain
  }

  public func save() throws {
    let encoder = JSONEncoder()
    let data = try encoder.encode(self)
    Self.keychain.set(data, forKey: key, withAccess: .accessibleAfterFirstUnlock)
  }
}
`,
      },
      "ios_keychain_accessibility",
    );
    expect(c.status).toBe("PASS");
  });

  it("FAILs KeychainAccess .accessibility(.alwaysThisDeviceOnly)", () => {
    const c = check(
      {
        "App/Tokens.swift": String.raw`import KeychainAccess
let keychain = Keychain(service: "x").accessibility(.alwaysThisDeviceOnly)
func save(_ t: String) { keychain["token"] = t }
`,
      },
      "ios_keychain_accessibility",
    );
    expect(c.status).toBe("FAIL");
  });

  it("still WARNs on raw SecItemAdd with no class, and SwiftUI .accessibility(addTraits:) does not count", () => {
    const c = check(
      {
        "Library/Keychain.swift": String.raw`import Security
import SwiftUI

func saveToken(_ token: String) {
  let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrAccount as String: "oauth_token",
    kSecValueData as String: Data(token.utf8),
  ]
  SecItemAdd(query as CFDictionary, nil)
}

struct Row: View {
  var body: some View { Text("Open").accessibility(addTraits: .isButton) }
}
`,
      },
      "ios_keychain_accessibility",
    );
    expect(c.status).toBe("WARN");
  });
});

describe("ios_privacy_manifest", () => {
  it("does not treat a SwiftData creationDate property as a FileTimestamp API (IceCubesApp)", () => {
    const c = check(
      {
        "IceCubesApp/App/Tabs/Timeline/TimelineTab.swift": String.raw`import SwiftData
import SwiftUI

struct TimelineTab: View {
  @AppStorage("remote_local_timeline") var remoteLocalTimeline = false
  @Query(sort: \LocalTimeline.creationDate, order: .reverse) var localTimelines: [LocalTimeline]
  @Query(sort: \TagGroup.creationDate, order: .reverse) var tagGroups: [TagGroup]
  var body: some View { Text("Home") }
}
`,
      },
      "ios_privacy_manifest",
    );
    expect(c.status).toBe("FAIL");
    expect(c.evidence ?? "").toContain("NSPrivacyAccessedAPICategoryUserDefaults");
    expect(c.evidence ?? "").not.toContain("NSPrivacyAccessedAPICategoryFileTimestamp");
  });

  // Regression side only: this passed before the fix as well.
  it("still reports real file-attribute timestamp access", () => {
    const c = check(
      {
        "Shared/AccountStats/AccountStatsViewModel.swift": String.raw`import Foundation

func lastModified(path: String) -> Date? {
  if let attributes = try? FileManager.default.attributesOfItem(atPath: path) {
    return attributes[.modificationDate] as? Date
  }
  return nil
}
`,
      },
      "ios_privacy_manifest",
    );
    expect(c.status).toBe("FAIL");
    expect(c.evidence ?? "").toContain("NSPrivacyAccessedAPICategoryFileTimestamp");
  });
});

describe("ios_dynamic_type", () => {
  it("counts UIKit UIFontMetrics / preferredFont as scaling type (kickstarter KDS)", () => {
    const c = check(
      {
        "KDS/Sources/KDS/Fonts/CustomFont.swift": String.raw`import UIKit

public struct CustomFont {
  public func font(size: CGFloat? = nil) -> UIFont {
    let metrics = UIFontMetrics(forTextStyle: fontConfig.textStyle)
    let font = UIFont.preferredFont(
      forTextStyle: fontConfig.textStyle
    )
    return metrics.scaledFont(for: font)
  }
}
`,
      },
      "ios_dynamic_type",
    );
    expect(c.status).toBe("PASS");
    expect(c.detail).not.toMatch(/No font declarations/);
  });

  it("leaves a SwiftUI text-style app at PASS and flags hardcoded UIKit sizes", () => {
    const swiftUI = check(
      {
        "App/FeedView.swift": String.raw`import SwiftUI
struct FeedView: View {
  var body: some View {
    VStack {
      Text("Title").font(.headline)
      Text("Body").font(.body)
      Text("Meta").font(.caption)
    }
  }
}
`,
      },
      "ios_dynamic_type",
    );
    expect(swiftUI.status).toBe("PASS");

    const fixed = check(
      {
        "App/Cells.swift": String.raw`import UIKit
final class Cell: UITableViewCell {
  func style() {
    titleLabel.font = UIFont.systemFont(ofSize: 17)
    subtitleLabel.font = UIFont.systemFont(ofSize: 13)
    badgeLabel.font = UIFont.boldSystemFont(ofSize: 11)
    priceLabel.font = UIFont(name: "Avenir-Heavy", size: 15)
  }
}
`,
      },
      "ios_dynamic_type",
    );
    expect(fixed.status).toBe("FAIL");
  });

  it("does not PASS shorthand `.systemFont(ofSize:)` sizes just because one UIFontMetrics exists", () => {
    const lines = Array.from({ length: 12 }, (_, i) => `    label${i}.font = .systemFont(ofSize: 14)`).join("\n");
    const c = check(
      {
        "App/Cells.swift": `import UIKit\nfinal class Cell {\n  func style() {\n${lines}\n    let m = UIFontMetrics(forTextStyle: .body)\n  }\n}\n`,
      },
      "ios_dynamic_type",
    );
    expect(c.status).not.toBe("PASS");
  });

  it("does not count adjustsFontForContentSizeCategory on a fixed systemFont as scaled", () => {
    const c = check(
      {
        "App/Cell.swift": `import UIKit\nfinal class Cell {\n  func style() {\n    title.font = .systemFont(ofSize: 17)\n    title.adjustsFontForContentSizeCategory = true\n    sub.font = .systemFont(ofSize: 13)\n    sub.adjustsFontForContentSizeCategory = true\n  }\n}\n`,
      },
      "ios_dynamic_type",
    );
    expect(c.status).not.toBe("PASS");
  });
});

describe("ios_adaptive_streaming", () => {
  it("recognises an API-provided hls field as HLS (kickstarter)", () => {
    const c = check(
      {
        "Library/Sources/Library/Library/VideoFeedItem+Constructor.swift": String.raw`import AVFoundation

extension VideoFeedItem {
  init(project: Project) {
    self.videoURL = project.video?.videoSources?.hls?.src.flatMap { URL(string: $0) }
    self.player = AVPlayer()
  }
}
`,
      },
      "ios_adaptive_streaming",
    );
    expect(c.status).toBe("PASS");
  });

  it("still WARNs when nothing indicates HLS (IceCubesApp), including words that merely contain 'hls'", () => {
    const c = check(
      {
        "Packages/MediaUI/Sources/MediaUI/MediaUIAttachmentVideoView.swift": String.raw`import AVKit
import SwiftUI

struct MediaUIAttachmentVideoView: View {
  let url: URL
  let hint = "Wenn du diese Funktion abwählst"
  var body: some View { VideoPlayer(player: AVPlayer(url: url)) }
}
`,
      },
      "ios_adaptive_streaming",
    );
    expect(c.status).toBe("WARN");
  });
});

describe("ios_offline_cache_fallback", () => {
  it("counts a Bodega SQLite timeline cache as an offline fallback (IceCubesApp)", () => {
    const c = check(
      {
        "Packages/Timeline/Sources/Timeline/actors/TimelineCache.swift": String.raw`import Bodega
import Models
import SwiftUI

public actor TimelineCache {
  private func storageFor(_ client: String, _ filter: String) -> SQLiteStorageEngine {
    SQLiteStorageEngine.default(appendingPath: client)
  }
}
`,
      },
      "ios_offline_cache_fallback",
    );
    expect(c.status).toBe("PASS");
  });

  it("still WARNs for a plain URLSession.shared client with no store", () => {
    const c = check(
      {
        "App/FeedService.swift": String.raw`import Foundation
final class FeedService {
  func load() async throws -> Data {
    let (data, _) = try await URLSession.shared.data(from: URL(string: "https://api.example.com/feed")!)
    return data
  }
}
`,
      },
      "ios_offline_cache_fallback",
    );
    expect(c.status).toBe("WARN");
  });
});

describe("ios_force_unwrap_density", () => {
  const cleanShipped = Array.from({ length: 300 }, (_, i) => `    let value${i} = compute(${i})`).join("\n");
  const testHeavy = Array.from(
    { length: 300 },
    () => `    let project = try! JSONDecoder().decode(Project.self, from: data)`,
  ).join("\n");

  it("ignores try! in XCTest files (kickstarter)", () => {
    const c = check(
      {
        "KsApi/Sources/KsApi/Service.swift": cleanShipped,
        "KsApi/Tests/KsApiTests/ServiceTests.swift": testHeavy,
      },
      "ios_force_unwrap_density",
    );
    expect(c.status).toBe("PASS");
  });

  it("still flags try! in shipped code", () => {
    const shippedHeavy = Array.from({ length: 300 }, (_, i) =>
      i % 10 === 0 ? `    let project = try! JSONDecoder().decode(Project.self, from: data)` : `    let value${i} = compute(${i})`,
    ).join("\n");
    const c = check({ "App/Decoder.swift": shippedHeavy }, "ios_force_unwrap_density");
    expect(c.status).not.toBe("PASS");
  });
});

describe("ios_http_status_discarded", () => {
  it("passes when nil is used only where there is no HTTP response (NetNewsWire ImageDownloader)", () => {
    const c = check(
      {
        "Modules/Images/Sources/Images/ImageDownloader.swift": String.raw`import Foundation

func downloadImage(_ url: String) async throws(ImageDownloadError) -> Data {
  guard let imageURL = URL(string: url) else {
    throw ImageDownloadError(statusCode: nil, decodingFailed: false, isTransient: false)
  }
  let downloadResponse: DownloadResponse
  do {
    downloadResponse = try await Downloader.shared.download(imageURL)
  } catch {
    throw ImageDownloadError(statusCode: nil, decodingFailed: false, isTransient: true)
  }
  let statusCode = (downloadResponse.response as? HTTPURLResponse)?.statusCode
  let isTransient = statusCode.map { (500...599).contains($0) } ?? true
  throw ImageDownloadError(statusCode: statusCode, decodingFailed: false, isTransient: isTransient)
}
`,
      },
      "ios_http_status_discarded",
    );
    expect(c.status).toBe("PASS");
  });

  it("still FAILs a layer that always throws statusCode: nil", () => {
    const c = check(
      {
        "App/Networking/APIClient.swift": String.raw`import Foundation

struct APIError: Error { let errorMessage: String; let statusCode: Int? }

func send(_ request: URLRequest) async throws -> Data {
  let (data, response) = try await URLSession.shared.data(for: request)
  guard let httpResponse = response as? HTTPURLResponse else {
    throw APIError(errorMessage: "No response", statusCode: nil)
  }
  if !(200...299).contains(httpResponse.statusCode) {
    throw APIError(errorMessage: "Unknown Error", statusCode: nil)
  }
  return data
}
`,
      },
      "ios_http_status_discarded",
    );
    expect(c.status).toBe("FAIL");
  });

  it("still FAILs an always-nil client when a test stub builds HTTPURLResponse(statusCode:)", () => {
    const c = check(
      {
        "App/Networking/APIClient.swift": String.raw`import Foundation

struct APIError: Error { let errorMessage: String; let statusCode: Int? }

func send(_ request: URLRequest) async throws -> Data {
  let (data, response) = try await URLSession.shared.data(for: request)
  guard let httpResponse = response as? HTTPURLResponse else {
    throw APIError(errorMessage: "No response", statusCode: nil)
  }
  if !(200...299).contains(httpResponse.statusCode) {
    throw APIError(errorMessage: "Unknown Error", statusCode: nil)
  }
  return data
}
`,
        "Tests/MockURLProtocol.swift": String.raw`import Foundation
final class MockURLProtocol: URLProtocol {
  override func startLoading() {
    let response = HTTPURLResponse(url: url, statusCode: statusCode, httpVersion: nil, headerFields: nil)!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
  }
}
`,
      },
      "ios_http_status_discarded",
    );
    expect(c.status).toBe("FAIL");
  });
});

describe("ios_http_status_discarded — HTTPURLResponse initialisers do not count as propagation", () => {
  it("still FAILs a discarding client that also builds a synthetic HTTPURLResponse in the same file", () => {
    const c = check(
      {
        "App/Networking/APIClient.swift": String.raw`import Foundation

struct APIError: Error { let errorMessage: String; let statusCode: Int? }

func cachedResponse(for url: URL, code: Int) -> HTTPURLResponse? {
  HTTPURLResponse(url: url, statusCode: code, httpVersion: nil, headerFields: nil)
}

func send(_ request: URLRequest) async throws -> Data {
  let (data, response) = try await URLSession.shared.data(for: request)
  guard let httpResponse = response as? HTTPURLResponse else {
    throw APIError(errorMessage: "No response", statusCode: nil)
  }
  if !(200...299).contains(httpResponse.statusCode) {
    throw APIError(errorMessage: "Unknown Error", statusCode: nil)
  }
  return data
}
`,
      },
      "ios_http_status_discarded",
    );
    expect(c.status).toBe("FAIL");
  });
});

describe("ios_release_logging", () => {
  const prints = Array.from({ length: 12 }, () => `    print("🔵 [KsApi] Successfully Decoded Data")`).join("\n");

  it("keeps WARN but does not claim print output persists on device (kickstarter)", () => {
    const c = check(
      {
        "KsApi/Sources/KsApi/Service+DecodeHelpers.swift": `import Foundation\nfunc decode() {\n${prints}\n#if DEBUG\n    debugLog()\n#endif\n}\n`,
      },
      "ios_release_logging",
    );
    expect(c.status).toBe("WARN");
    expect(c.detail).not.toMatch(/console output persists on device/);
    expect(c.detail).toMatch(/unified log/);
  });

  it("still PASSes with only a couple of print calls", () => {
    const c = check(
      { "App/A.swift": `import Foundation\nfunc a() {\n    print("one")\n    print("two")\n}\n` },
      "ios_release_logging",
    );
    expect(c.status).toBe("PASS");
  });
});
