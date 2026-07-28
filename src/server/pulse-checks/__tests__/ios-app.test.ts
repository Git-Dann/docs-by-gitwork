import { describe, it, expect } from "vitest";
import { evaluateIosChecks, stripSwiftComments } from "../ios-app";
import type { RepoSnapshot } from "../native-mobile";

// ─────────────────────────────────────────────────────────────────────────────
// Self-test in the style of scripts/audit-ui-standards.mjs: every rule is asserted
// to FIRE on a deliberately-defective app AND to stay QUIET on the fixed one. A
// rule that has silently stopped firing is worse than no rule, and a rule that
// fires on correct code trains people to ignore the report.
//
// The defective fixture is modelled on the real findings from the Fellas iOS
// review (July 2026) — credentials in device logs, tokens in UserDefaults, the
// password in the Keychain instead, progressive MP4 video, no Dynamic Type.
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

const statusOf = (checks: ReturnType<typeof evaluateIosChecks>, key: string) =>
  checks.find((c) => c.checkKey === key)?.status;

// ── The defective app ────────────────────────────────────────────────────────

const BAD_PLIST = `<plist><dict>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key><true/>
    <key>NSExceptionDomains</key>
    <dict><key>api.example.com</key><dict><key>NSIncludesSubdomains</key><true/></dict></dict>
  </dict>
  <key>NSUserNotificationsUsageDescription</key><string>We send notifications.</string>
  <key>UIBackgroundModes</key><array><string>audio</string><string>fetch</string></array>
</dict></plist>`;

const BAD_ENTITLEMENTS = `<plist><dict>
  <key>aps-environment</key><string>development</string>
  <key>com.apple.developer.networking.multicast</key><true/>
  <key>com.apple.developer.background-tasks.continued-processing.gpu</key><true/>
</dict></plist>`;

const BAD_GOOGLE_PLIST = `<plist><dict>
  <key>API_KEY</key><string>AIzaSyAfO3oaEXAMPLEKEYVALUE1234567890</string>
  <key>PROJECT_ID</key><string>cool-attic-123456</string>
</dict></plist>`;

const BAD_PBXPROJ = `
  IPHONEOS_DEPLOYMENT_TARGET = 13.0;
  MARKETING_VERSION = 2.1.33;
`;

// Deliberate leftovers: a renamed-but-not-retitled file header, a tunnel URL, and a
// demo asset wired in as a default parameter value.
const BAD_SWIFT_LEFTOVERS = `
//
//  fdsf.swift
//  MyApp
//
struct FramedVideoPlayer {
    var remoteURL: String? = "https://vz-b5cdb98e-9cd.b-cdn.net/abc/play_720p.mp4"
//    static let base = "https://innocent-subtly-duck.ngrok-free.app/api"
}
`;

const BAD_SWIFT_LOGGER = `
class Logger {
    static var isLoggingEnabled = true
    static func logAPICall(url: String?, method: String, body: Encodable?) {
        Logger.log("Endpoint: \\(url ?? "")")
        if let body = body, let dict = body.toDictionary() {
            Logger.log("Body: \\(dict)")
        }
    }
}
`;

const BAD_SWIFT_API = `
struct LoginRequest: Codable {
    let email: String
    let password: String
}
class APIClient {
    func executeRequest(endpoint: String, method: String, body: Encodable?) {
        Logger.logAPICall(url: urlString, method: method, body: body)
        URLSession.shared.dataTaskPublisher(for: request).tryMap { result in
            guard let httpResponse = result.response as? HTTPURLResponse else { throw err }
            if !(200...299).contains(httpResponse.statusCode) {
                throw associatedError.init(errorMessage: "Unknown Error", statusCode: nil)
            }
            return result.data
        }
    }
}
`;

const BAD_SWIFT_STORAGE = `
enum UserJourneyKeys: String {
    case accesstoken = "AuthAccessToken"
    case refreshToken = "AuthRefreshToken"
}
class UserJourney {
    private let userDefaults = UserDefaults.standard
    var accessToken: String { userDefaults.string(forKey: "AuthAccessToken") ?? "" }
}
enum AuthSecrets { static let passwordAccount = "rememberMe.password" }
class LoginViewModel {
    func onLogin(_ password: String) {
        try? KeychainStore.save(password, account: AuthSecrets.passwordAccount, service: svc)
    }
}
enum KeychainStore {
    static func save(_ v: String, account: String, service: String) throws {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword]
        SecItemAdd(q as CFDictionary, nil)
    }
}
`;

const BAD_SWIFT_VIEWS = `
struct FeedView: View {
    var body: some View {
        VStack {
            Text("Watch now").font(.custom("Barlow-Bold", size: 22))
            Text("Latest").font(.custom("Barlow-Regular", size: 14))
            Button { play() } label: { Image(systemName: "play") }
            Button { share() } label: { Image(systemName: "square.and.arrow.up") }
        }
    }
    func openCamera() { let picker = UIImagePickerController() }
    func play() {
        let player = AVPlayer(url: URL(string: "https://cdn.example.com/video/play_720p.mp4")!)
    }
}
`;

const badApp = () =>
  snapshot(
    {
      "MyApp/Info.plist": BAD_PLIST,
      "MyApp/MyApp.entitlements": BAD_ENTITLEMENTS,
      "MyApp/GoogleService-Info.plist": BAD_GOOGLE_PLIST,
      "MyApp.xcodeproj/project.pbxproj": BAD_PBXPROJ,
      Podfile: "pod 'Kingfisher'",
      "MyApp/Extras/FramedVideoPlayer.swift": BAD_SWIFT_LEFTOVERS,
      "MyApp/Extras/Logger.swift": BAD_SWIFT_LOGGER,
      "MyApp/Networking/APIClient.swift": BAD_SWIFT_API,
      "MyApp/Extras/UserJourney.swift": BAD_SWIFT_STORAGE,
      "MyApp/Features/FeedView.swift": BAD_SWIFT_VIEWS,
    },
    ["MyApp/.DS_Store", "MyApp.xcodeproj/xcuserdata/dan.xcuserdatad/x.plist"],
  );

// ── The fixed app ────────────────────────────────────────────────────────────

const GOOD_PLIST = `<plist><dict>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsArbitraryLoads</key><false/></dict>
  <key>ITSAppUsesNonExemptEncryption</key><false/>
  <key>NSCameraUsageDescription</key><string>Used to capture photos.</string>
  <key>UIBackgroundModes</key><array><string>audio</string></array>
</dict></plist>`;

const GOOD_ENTITLEMENTS = `<plist><dict>
  <key>aps-environment</key><string>production</string>
</dict></plist>`;

const GOOD_PBXPROJ = `
  IPHONEOS_DEPLOYMENT_TARGET = 17.0;
  productType = "com.apple.product-type.bundle.unit-test";
  productType = "com.apple.product-type.bundle.ui-testing";
`;

const GOOD_SWIFT = `
#if DEBUG
let loggingEnabled = true
#endif
struct LoginRequest: Codable { let email: String; let password: String }

final class APIClient: NSObject, URLSessionDelegate {
    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.urlCache = URLCache(memoryCapacity: 20_000_000, diskCapacity: 200_000_000, diskPath: "api")
        config.timeoutIntervalForRequest = 15
        config.allowsConstrainedNetworkAccess = true
        config.requestCachePolicy = .returnCacheDataElseLoad
        return URLSession(configuration: config)
    }()

    func urlSession(_ s: URLSession, didReceive challenge: URLAuthenticationChallenge) {
        SecTrustEvaluateWithError(trust, nil)
    }

    func handle(_ httpResponse: HTTPURLResponse, data: Data) throws {
        guard (200...299).contains(httpResponse.statusCode) else {
            throw ApiError(errorMessage: "failed", statusCode: httpResponse.statusCode)
        }
    }
}

enum TokenStore {
    static func save(_ token: String) throws {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        SecItemAdd(q as CFDictionary, nil)
    }
}

struct FeedView: View {
    @ScaledMetric var spacing: CGFloat = 8
    var body: some View {
        VStack(spacing: spacing) {
            Text("Watch now").font(.title)
            Text("Latest").font(.body)
            Button { play() } label: { Image(systemName: "play") }
                .accessibilityLabel("Play episode")
            Button { share() } label: { Image(systemName: "square.and.arrow.up") }
                .accessibilityLabel("Share episode")
        }
        .onAppear { AVAudioSession.sharedInstance().setCategory(.playback) }
    }
    func openCamera() { let picker = UIImagePickerController() }
    func play() {
        guard let url = URL(string: "https://cdn.example.com/master.m3u8") else { return }
        let item = AVPlayerItem(url: url)
        item.preferredPeakBitRate = 2_000_000
        let cache = ImageCache.default
        let processor = DownsamplingImageProcessor(size: CGSize(width: 120, height: 120))
    }
}
`;

const goodApp = () =>
  snapshot({
    "MyApp/Info.plist": GOOD_PLIST,
    "MyApp/MyApp.entitlements": GOOD_ENTITLEMENTS,
    "MyApp/PrivacyInfo.xcprivacy": "<plist><dict/></plist>",
    "MyApp.xcodeproj/project.pbxproj": GOOD_PBXPROJ,
    Podfile: "pod 'Kingfisher'",
    "Podfile.lock": "PODS:\n  - Kingfisher (8.0.3)",
    ".swiftlint.yml": "disabled_rules: []",
    "MyApp/Networking/APIClient.swift": GOOD_SWIFT,
  });

// ─────────────────────────────────────────────────────────────────────────────

describe("iOS checks — fire on the defect", () => {
  const checks = evaluateIosChecks(badApp());

  it("catches credentials reaching the device log in Release", () => {
    // The headline finding: logger hardcoded on + body logging + a password-bearing
    // request model + no #if DEBUG. Foundry's generic repo checks saw none of this.
    expect(statusOf(checks, "ios_release_logging")).toBe("FAIL");
    expect(statusOf(checks, "ios_sensitive_payload_logging")).toBe("FAIL");
    expect(statusOf(checks, "ios_debug_guards")).toBe("WARN");
  });

  it("catches tokens in UserDefaults and the password in the Keychain", () => {
    expect(statusOf(checks, "ios_token_storage")).toBe("FAIL");
    expect(statusOf(checks, "ios_password_retention")).toBe("FAIL");
    // Keychain used but with no accessibility class declared.
    expect(statusOf(checks, "ios_keychain_accessibility")).toBe("WARN");
  });

  it("catches disabled App Transport Security", () => {
    expect(statusOf(checks, "ios_ats_arbitrary_loads")).toBe("FAIL");
  });

  it("catches store-readiness gaps", () => {
    expect(statusOf(checks, "ios_privacy_manifest")).toBe("FAIL");
    // Camera is used via UIImagePickerController with no NSCameraUsageDescription.
    expect(statusOf(checks, "ios_usage_descriptions")).toBe("FAIL");
    expect(statusOf(checks, "ios_aps_environment")).toBe("WARN");
    expect(statusOf(checks, "ios_encryption_declaration")).toBe("WARN");
    expect(statusOf(checks, "ios_deployment_target")).toBe("FAIL");
    // `fetch` is declared with no BGAppRefreshTask anywhere.
    expect(statusOf(checks, "ios_background_modes_declared")).toBe("WARN");
  });

  it("catches the accessibility gaps", () => {
    expect(statusOf(checks, "ios_dynamic_type")).toBe("FAIL");
    expect(statusOf(checks, "ios_accessibility_labels")).toBe("FAIL");
  });

  it("catches the low-data / caching causes of a slow app", () => {
    // Progressive MP4 has one fixed bitrate — the usual cause of "slow on low data".
    expect(statusOf(checks, "ios_adaptive_streaming")).toBe("FAIL");
    expect(statusOf(checks, "ios_low_data_mode")).toBe("WARN");
    expect(statusOf(checks, "ios_url_cache")).toBe("WARN");
    expect(statusOf(checks, "ios_request_timeout")).toBe("WARN");
    expect(statusOf(checks, "ios_offline_cache_fallback")).toBe("WARN");
  });

  it("catches the delivery gaps", () => {
    expect(statusOf(checks, "ios_test_target")).toBe("FAIL");
    expect(statusOf(checks, "ios_ui_test_target")).toBe("WARN");
    // Podfile with no Podfile.lock — two builds can resolve different versions.
    expect(statusOf(checks, "ios_dependency_pinning")).toBe("FAIL");
    expect(statusOf(checks, "ios_swiftlint")).toBe("WARN");
    expect(statusOf(checks, "ios_http_status_discarded")).toBe("FAIL");
  });

  it("catches the two substantive extras", () => {
    // Restricted entitlements: multicast needs Apple's approval, and an archive fails
    // outright if the distribution profile is missing one.
    expect(statusOf(checks, "ios_restricted_entitlements")).toBe("WARN");
    // Firebase key: WARN not FAIL — Google ships these publicly, so rotating is not
    // the fix; confirming the key is bundle-restricted is.
    expect(statusOf(checks, "ios_firebase_config_committed")).toBe("WARN");
    const fb = checks.find((c) => c.checkKey === "ios_firebase_config_committed")?.detail ?? "";
    expect(fb).toMatch(/NOT a leak/i);
    expect(fb).toMatch(/restricted/i);
  });

  it("catches the nice-to-haves without dressing them as risks", () => {
    expect(statusOf(checks, "ios_invalid_plist_keys")).toBe("WARN");
    expect(statusOf(checks, "ios_ats_exception_noop")).toBe("WARN");
    expect(statusOf(checks, "ios_dev_leftovers")).toBe("WARN");

    const leftovers = checks.find((c) => c.checkKey === "ios_dev_leftovers")?.detail ?? "";
    expect(leftovers).toMatch(/ngrok/i);
    expect(leftovers).toMatch(/placeholder file header/i);

    // None of the tidiness checks may ever be a FAIL — that is what makes them
    // safe to damp in priority.ts rather than hide.
    for (const key of ["ios_invalid_plist_keys", "ios_ats_exception_noop", "ios_dev_leftovers", "ios_todo_density", "ios_dead_code"]) {
      expect(statusOf(checks, key), `${key} must never FAIL`).not.toBe("FAIL");
    }
  });

  it("explains the critical logging finding well enough to act on", () => {
    const detail = checks.find((c) => c.checkKey === "ios_sensitive_payload_logging")?.detail ?? "";
    expect(detail).toMatch(/password/i);
    expect(detail).toMatch(/#if DEBUG/);
  });
});

describe("iOS checks — stay quiet on the fix", () => {
  const checks = evaluateIosChecks(goodApp());

  it("reports no failures at all for a correctly-built app", () => {
    const failing = checks.filter((c) => c.status === "FAIL").map((c) => c.checkKey);
    expect(failing).toEqual([]);
  });

  it("credits the things done right rather than only subtracting", () => {
    // A readout that can only find fault does not get trusted, so passes matter.
    for (const key of [
      "ios_release_logging",
      "ios_sensitive_payload_logging",
      "ios_token_storage",
      "ios_password_retention",
      "ios_ats_arbitrary_loads",
      "ios_privacy_manifest",
      "ios_usage_descriptions",
      "ios_dynamic_type",
      "ios_accessibility_labels",
      "ios_adaptive_streaming",
      "ios_low_data_mode",
      "ios_url_cache",
      "ios_request_timeout",
      "ios_test_target",
      "ios_dependency_pinning",
      "ios_http_status_discarded",
      "ios_deployment_target",
    ]) {
      expect(statusOf(checks, key), `${key} should PASS on the fixed app`).toBe("PASS");
    }
  });
});

describe("density checks need enough source to be meaningful", () => {
  // Both are rates, so on a small sample they must skip rather than report a
  // meaningless number — the same trap that made force-unwrap density divide by
  // file count and report "10 per 1k" from a single occurrence.
  const build = (body: string) =>
    evaluateIosChecks(snapshot({ "MyApp/Info.plist": GOOD_PLIST, "MyApp/A.swift": body }));

  it("skips below the minimum sample size", () => {
    const checks = build("let x = 1\n// TODO: fix\n");
    expect(statusOf(checks, "ios_todo_density")).toBe("SKIPPED");
    expect(statusOf(checks, "ios_dead_code")).toBe("SKIPPED");
  });

  it("passes a large clean file and warns on a marker-heavy one", () => {
    const clean = Array.from({ length: 400 }, (_, i) => `let v${i} = ${i}`).join("\n");
    const cleanChecks = build(clean);
    expect(statusOf(cleanChecks, "ios_todo_density")).toBe("PASS");
    expect(statusOf(cleanChecks, "ios_dead_code")).toBe("PASS");

    const noisy = `${clean}\n${Array.from({ length: 40 }, (_, i) => `// TODO: thing ${i}`).join("\n")}`;
    expect(statusOf(build(noisy), "ios_todo_density")).toBe("WARN");
  });

  it("counts commented-out CODE but not prose comments", () => {
    const filler = Array.from({ length: 300 }, (_, i) => `let v${i} = ${i}`).join("\n");
    const prose = `${filler}\n${Array.from({ length: 60 }, () => "// this explains why the thing happens").join("\n")}`;
    expect(statusOf(build(prose), "ios_dead_code")).toBe("PASS");

    const deadCode = `${filler}\n${Array.from({ length: 60 }, (_, i) => `// let dead${i} = compute()`).join("\n")}`;
    expect(statusOf(build(deadCode), "ios_dead_code")).toBe("WARN");
  });
});

describe("stripSwiftComments", () => {
  // Found on a real app: the only occurrences of `allowsConstrainedNetworkAccess`
  // were commented out, so the low-data check passed an app with no adaptation.
  it("removes commented-out code so it cannot satisfy a check", () => {
    const src = `
// config.allowsConstrainedNetworkAccess = true
/* config.allowsExpensiveNetworkAccess = true */
let x = 1
`;
    const out = stripSwiftComments(src);
    expect(out).not.toMatch(/allowsConstrainedNetworkAccess/);
    expect(out).not.toMatch(/allowsExpensiveNetworkAccess/);
    expect(out).toMatch(/let x = 1/);
  });

  // The critical case: a URL contains `//`. Naive stripping truncates it and breaks
  // media-format detection, which is what the adaptive-streaming check relies on.
  it("preserves string literals containing //", () => {
    const src = 'let u = URL(string: "https://cdn.example.com/master.m3u8")';
    const out = stripSwiftComments(src);
    expect(out).toContain("https://cdn.example.com/master.m3u8");
    expect(out).toContain(".m3u8");
  });

  it("handles escaped quotes, multiline strings and nested block comments", () => {
    expect(stripSwiftComments('let s = "a \\" // not a comment"')).toContain("// not a comment");
    expect(stripSwiftComments('let s = """\nhttp://x // keep\n"""')).toContain("// keep");
    expect(stripSwiftComments("/* outer /* inner */ still */ let y = 2")).toMatch(/let y = 2/);
    expect(stripSwiftComments("/* outer /* inner */ still */ let y = 2")).not.toMatch(/still/);
  });

  it("keeps newlines so line-based density metrics stay accurate", () => {
    expect(stripSwiftComments("a\n// c\nb").split("\n")).toHaveLength(3);
  });
});

describe("evidence model", () => {
  it("marks absence findings LOW confidence when the source sample is thin", () => {
    // 2 of 100 Swift files read: not enough to claim an idiom is absent anywhere.
    const thin: RepoSnapshot = {
      owner: "acme",
      repo: "app",
      paths: [
        "MyApp/Info.plist",
        ...Array.from({ length: 100 }, (_, i) => `MyApp/Views/View${i}.swift`),
      ],
      files: new Map([
        ["MyApp/Info.plist", GOOD_PLIST],
        ["MyApp/Views/View0.swift", 'Text("hi").font(.custom("Barlow", size: 12))'],
        ["MyApp/Views/View1.swift", "struct A: View { var body: some View { EmptyView() } }"],
      ]),
      truncated: false,
      accessible: true,
    };

    const dynamicType = evaluateIosChecks(thin).find((c) => c.checkKey === "ios_dynamic_type");
    expect(dynamicType?.status).toBe("FAIL");
    // LOW confidence is excluded from the score by score-breakdown.ts, so a thin
    // sample informs the report without inventing a failure.
    expect(dynamicType?.confidence).toBe("LOW");
    expect(dynamicType?.detail).toMatch(/inconclusive/i);
  });

  it("keeps full confidence when coverage is sound", () => {
    const dynamicType = evaluateIosChecks(badApp()).find((c) => c.checkKey === "ios_dynamic_type");
    expect(dynamicType?.status).toBe("FAIL");
    expect(dynamicType?.confidence).toBeUndefined();
  });

  it("returns nothing rather than guessing when no files could be read", () => {
    const empty = evaluateIosChecks({
      owner: "a", repo: "b", paths: [], files: new Map(), truncated: false, accessible: true,
    });
    // No config and no source — every verdict must be SKIPPED or a safe default,
    // never a confident failure invented from missing data.
    expect(empty.filter((c) => c.status === "FAIL")).toEqual([]);
  });
});
